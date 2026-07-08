import type { RetreatContract, RetreatEntry, Task } from "../types/index.js";
import { isCompound } from "./adjudicate.js";
import { gateAdjudicating } from "./adjudicate-gate.js";
import type { CompletionResult, TaskStore } from "./complete.js";
import { completeAdjudication, completeTask } from "./complete.js";
import { Interpreter } from "./interpreter.js";
import type { Pipeline } from "./pipeline.js";
import { isDuplicateGap, recordRetreat } from "./retreat.js";
import { type MergeLockFs, type WorktreeRunner, withCapGuard } from "./safety.js";
import { kindForPhase } from "./skill-registry.js";

/**
 * Handler called by the driver when a compound (epic) task is in a machine-actor phase.
 * Lives in harness, injected here; engine core never spawns directly.
 */
export type DecomposeHandler = (task: Task, repoPath?: string) => Promise<void>;

/**
 * Outcome of the independent judgmental audit for a task sitting in
 * `adjudicating` (BACK-682). Distinct from ENG-8's mechanical `Verdict`
 * (adjudicate.ts) — this is a human/agent judgment call, not a DoD re-run.
 */
export type AdjudicateOutcome =
	| { verdict: "done" }
	| { verdict: "needs-human" }
	| {
			verdict: "retreat";
			gapFingerprint: string;
			classification: "spec" | "decomposition" | "goal";
			contract: RetreatContract;
	  };

/**
 * Handler called by the driver when a primitive task is in `adjudicating`.
 * Lives in harness, injected here; engine core never runs the audit itself.
 * When omitted, the driver defaults to `{ verdict: "done" }` — a trivial
 * pass-through that preserves stub-worktree E2E tests with no injected audit.
 */
export type AdjudicateHandler = (task: Task) => Promise<AdjudicateOutcome>;

/** Worktree operations interface; primitives are stubbed here and hardened in child 5. */
export interface WorktreeOps {
	spawn(task: Task): Promise<CompletionResult>;
	// biome-ignore lint/suspicious/noConfusingVoidType: void allows existing `async () => {}` callers unchanged
	merge(taskId: string, result: CompletionResult): Promise<{ conflict?: boolean; merged?: boolean } | void>;
}

/**
 * Optional safety configuration.  When provided, every machine-phase handler
 * runs inside withMergeLock + withCapGuard.  When omitted the driver runs
 * without locking (suitable for in-memory test scenarios).
 */
export interface SafetyConfig {
	backlogDir: string;
	repoPath: string;
	lockFs: MergeLockFs;
	worktreeRunner: WorktreeRunner;
}

/**
 * Driver: closes the detect→spawn→adjudicate→advance loop.
 *
 * Role branching (per AC #3):
 *   - primitive (leaf, no subtasks): spawn → adjudicate DoD → done | needs-human
 *   - compound/epic: calls injected decompose handler (if provided); else → needs-human stub
 *
 * Safety (per AC #2, when SafetyConfig is provided):
 *   - merge wrapped in withMergeLock
 *   - each handler wrapped in withCapGuard (idempotent across restarts)
 */
export class Driver {
	private interpreter: Interpreter;
	// BACK-686.2: the full task list from the most recent tick(), so a machine-actor
	// handler (e.g. the `evaluating` branch below) can look up a compound task's
	// children without needing a `Core`/`queryTasks` capability on `TaskStore`.
	private tasksSnapshot: Task[] = [];

	constructor(
		pipelines: Pipeline[],
		store: TaskStore,
		worktree: WorktreeOps,
		safety?: SafetyConfig,
		decompose?: DecomposeHandler,
		adjudicateHandler?: AdjudicateHandler,
	) {
		this.interpreter = new Interpreter();

		for (const pipeline of pipelines) {
			for (const state of pipeline.states) {
				if (state.actor !== "machine") continue;

				const phase = state.name;
				this.interpreter.register(pipeline, phase, async (_event, task) => {
					const doWork = async () => {
						const repoRoot = safety?.repoPath ?? process.cwd();
						// BACK-686.2 AC#6: dispatch decides purely from the phase's declared
						// `kind` (plugin/skills/phase-coverage.json), not a hardcoded phase-name
						// match — a `kind:script` phase is always handled by an in-tick call,
						// never a dispatched skill/spawned session, regardless of its name.
						const kind = kindForPhase(repoRoot, `${pipeline.id}/${phase}`);

						// BACK-686.2 AC#2/#3: evaluating is `kind:script` — a mechanical,
						// in-tick call to the epic-evaluate logic (IA + child aggregation),
						// never a dispatched skill/spawned session. Distinct from
						// `adjudicating` below (kind:gate), which CAN escalate to a dispatch.
						if (kind === "script") {
							const { computeEpicVerdict } = await import("../harness/evaluator.js");
							const children = this.tasksSnapshot.filter((t) => t.parent_id === task.id);
							const verdict = await computeEpicVerdict(task, children, repoRoot);
							await store.updateTask({ ...task, phase: verdict });
							return;
						}

						// BACK-682: adjudicating is resolved by an independent judgment
						// call (audit), never re-spawned like a fresh primitive attempt.
						// BACK-686.2 AC#4/#5: a mechanical gate-script runs FIRST — light
						// primitives (and epics, always) resolve without ever calling
						// adjudicateHandler (no session spawn); only a "full" primitive
						// escalates to the skill-dispatch path below.
						if (kind === "gate") {
							const children = this.tasksSnapshot.filter((t) => t.parent_id === task.id);
							const gate = await gateAdjudicating(task, children, task.modifiedFiles ?? [], repoRoot);
							if (gate.verdict !== "dispatch-skill") {
								await completeAdjudication(task.id, gate.verdict, store);
								return;
							}

							const outcome: AdjudicateOutcome = adjudicateHandler
								? await adjudicateHandler(task)
								: { verdict: "done" };

							if (outcome.verdict === "retreat") {
								if (isDuplicateGap(task, outcome.gapFingerprint)) {
									await store.updateTask({ ...task, phase: "needs-human" });
									return;
								}
								const entry: RetreatEntry = {
									ts: new Date().toISOString(),
									from: "execution/adjudicating",
									toPhase: task.entry_phase ?? "",
									gapFingerprint: outcome.gapFingerprint,
									classification: outcome.classification,
									contract: outcome.contract,
								};
								// Worktree/exec-lock are untouched here — retreat only moves
								// phase back to entry_phase (AC#4/Phase D worktree retention).
								await store.updateTask(recordRetreat(task, entry));
								return;
							}

							await completeAdjudication(task.id, outcome.verdict, store);
							return;
						}

						if (isCompound(task)) {
							if (decompose) {
								// Delegate to injected decompose handler (harness seam)
								await decompose(task, safety?.repoPath);
							} else {
								// No handler injected — route to human
								await store.updateTask({
									...task,
									phase: "needs-human",
								});
							}
							return;
						}

						const result = await worktree.spawn(task);

						await completeTask(task.id, result, store, {
							merge: (id, res) => worktree.merge(id, res),
							safety: safety ? { backlogDir: safety.backlogDir, lockFs: safety.lockFs } : undefined,
						});
					};

					if (safety) {
						await withCapGuard(task, phase, doWork, store);
					} else {
						await doWork();
					}
				});
			}
		}
	}

	/** One detect→spawn→adjudicate→advance cycle over the given task list. */
	async tick(tasks: Task[]): Promise<void> {
		this.tasksSnapshot = tasks;
		const events = this.interpreter.scan(tasks);
		await this.interpreter.dispatch(events, tasks);
	}
}
