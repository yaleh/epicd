import type { Task } from "../types/index.js";
import { adjudicate, isPrimitive } from "./adjudicate.js";
import type { CompletionResult, TaskStore } from "./complete.js";
import { Interpreter } from "./interpreter.js";
import type { Pipeline } from "./pipeline.js";
import { type MergeLockFs, type WorktreeRunner, withCapGuard, withMergeLock } from "./safety.js";

/** Worktree operations interface; primitives are stubbed here and hardened in child 5. */
export interface WorktreeOps {
	spawn(task: Task): Promise<CompletionResult>;
	merge(taskId: string, result: CompletionResult): Promise<void>;
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
 *   - compound/epic: stub → needs-human (decompose out of scope for BACK-600.8)
 *
 * Safety (per AC #2, when SafetyConfig is provided):
 *   - merge wrapped in withMergeLock
 *   - each handler wrapped in withCapGuard (idempotent across restarts)
 */
export class Driver {
	private interpreter: Interpreter;

	constructor(pipelines: Pipeline[], store: TaskStore, worktree: WorktreeOps, safety?: SafetyConfig) {
		this.interpreter = new Interpreter();

		for (const pipeline of pipelines) {
			for (const state of pipeline.states) {
				if (state.actor !== "machine") continue;

				const phase = state.name;
				this.interpreter.register(pipeline, phase, async (_event, task) => {
					const doWork = async () => {
						if (!isPrimitive(task)) {
							// compound/epic — decompose out of scope, route to human
							await store.updateTask({ ...task, phase: "needs-human" });
							return;
						}

						const result = await worktree.spawn(task);

						if (safety) {
							await withMergeLock(safety.backlogDir, () => worktree.merge(task.id, result), safety.lockFs);
						} else {
							await worktree.merge(task.id, result);
						}

						const verdict = adjudicate(task, result);
						await store.updateTask({ ...task, phase: verdict });
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
		const events = this.interpreter.scan(tasks);
		await this.interpreter.dispatch(events, tasks);
	}
}
