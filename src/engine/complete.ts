import type { Task } from "../types/index.js";
import { adjudicate } from "./adjudicate.js";
import { isLegalPhase, type Pipeline } from "./pipeline.js";
import { type MergeLockFs, withMergeLock } from "./safety.js";

export interface DodResult {
	cmd: string;
	passed: boolean;
}

export interface CompletionResult {
	success: boolean;
	output?: string;
	error?: string;
	/** Per-command results from the harness DoD runner (ENG-8). */
	dodResults?: DodResult[];
}

/** Minimal interface the completion API needs from the task store. */
export interface TaskStore {
	getTask(taskId: string): Promise<Task | null>;
	updateTask(task: Task): Promise<void>;
}

/**
 * Signal that a task has completed. Advances the task's phase to the next
 * phase in the pipeline, driven by pipeline data — no hardcoded transitions.
 * No sentinel files are created or read — phase is the only handshake.
 */
export async function complete(
	taskId: string,
	result: CompletionResult,
	pipelines: Pipeline[],
	store: TaskStore,
): Promise<void> {
	const task = await store.getTask(taskId);
	if (!task) throw new Error(`Task ${taskId} not found`);
	if (!task.pipeline_id || !task.phase) {
		throw new Error(`Task ${taskId} has no pipeline_id or phase`);
	}

	const pipeline = pipelines.find((p) => p.id === task.pipeline_id);
	if (!pipeline) {
		throw new Error(`Pipeline ${task.pipeline_id} not found`);
	}

	const currentIdx = pipeline.states.findIndex((s) => s.name === task.phase);
	if (currentIdx === -1) {
		throw new Error(`Phase ${task.phase} not found in pipeline ${task.pipeline_id}`);
	}

	const nextState = pipeline.states[currentIdx + 1];
	if (!nextState) {
		throw new Error(`No next phase after ${task.phase} in pipeline ${task.pipeline_id}`);
	}

	// Advance phase; result is recorded by the caller (driver/coordinator)
	void result; // acknowledged — stored externally if needed
	await store.updateTask({ ...task, phase: nextState.name });
}

/**
 * Options for the unified worker→engine handshake (completeTask).
 */
export interface CompleteTaskOptions {
	/**
	 * Called to git-merge the task worktree branch.
	 * Returns `{conflict: true}` when the merge fails due to conflicts;
	 * the engine routes to `needs-human` without adjudicating DoD.
	 * When combined with `safety`, the call is wrapped in withMergeLock.
	 */
	// biome-ignore lint/suspicious/noConfusingVoidType: void allows existing `async () => {}` callers unchanged
	merge?: (taskId: string, result: CompletionResult) => Promise<{ conflict?: boolean; merged?: boolean } | void>;
	/** Safety config for merge-lock serialisation. */
	safety?: { backlogDir: string; lockFs: MergeLockFs };
	/**
	 * Called after the phase-updating `store.updateTask` write, with the final
	 * verdict ("done" | "needs-human"). Commits that write to git — otherwise
	 * the board file's phase change is left uncommitted on disk after merge
	 * (BACK-616). Optional: omitted for in-memory TaskStore test doubles.
	 */
	commit?: (taskId: string, verdict: string) => Promise<void>;
}

/**
 * Unified worker→engine handshake for primitive tasks.
 *
 * Replaces the driver's previously-inlined adjudicate+merge+update logic so
 * there is exactly one adjudication path (ENG-8 / advisory B).
 *
 * Flow (ENG-8 composite sequence), all under a single merge-lock scope when
 * `options.safety` is provided:
 *   1. Load task from store.
 *   2. Pre-adjudicate dodResults — if present and any fail (or empty) →
 *      phase → needs-human immediately, skip merge.
 *   3. Merge worktree branch.
 *      - If merge signals conflict → phase → needs-human (skip adjudication).
 *   4. Adjudicate remaining result (success + legacy DoD items) → done | needs-human.
 *   5. Update task phase — engine decides; worker never self-declares done.
 *      BACK-682: when the verdict is "done" AND the task's own pipeline
 *      declares an "adjudicating" phase (currently only `execution`), the
 *      phase written is "adjudicating", not "done" directly — a primitive's
 *      completion path becomes ready → adjudicating → done (AC#1). The
 *      independent judgmental audit that resolves "adjudicating" to its
 *      final "done"/"needs-human" is a separate step (`completeAdjudication`
 *      below), never this function. Pipelines with no "adjudicating" phase
 *      declared are unaffected — same direct verdict as before.
 *   6. Commit the phase write (options.commit), if provided.
 */
export async function completeTask(
	taskId: string,
	result: CompletionResult,
	store: TaskStore,
	options?: CompleteTaskOptions,
): Promise<void> {
	const task = await store.getTask(taskId);
	if (!task) throw new Error(`Task ${taskId} not found`);

	const run = async (): Promise<void> => {
		// ENG-8: pre-adjudicate dodResults before merge — dod fail skips merge entirely.
		if (result.dodResults !== undefined) {
			const dodFailed = result.dodResults.length === 0 || result.dodResults.some((r) => !r.passed);
			if (dodFailed) {
				await store.updateTask({ ...task, phase: "needs-human" });
				await options?.commit?.(taskId, "needs-human");
				return;
			}
		}

		// Merge worktree branch
		if (options?.merge) {
			const mergeOutcome = await options.merge(taskId, result);

			// Conflict → needs-human immediately, bypass adjudication
			if (mergeOutcome != null && (mergeOutcome as { conflict?: boolean }).conflict) {
				await store.updateTask({ ...task, phase: "needs-human" });
				await options?.commit?.(taskId, "needs-human");
				return;
			}
		}

		// Adjudicate and persist — engine is sole authority over done/needs-human
		const verdict = adjudicate(task, result);
		// BACK-682 AC#1: a "done" verdict routes through "adjudicating" first,
		// for any pipeline that declares that phase; other pipelines/verdicts
		// are unaffected.
		const nextPhase = verdict === "done" && isLegalPhase(task.pipeline_id, "adjudicating") ? "adjudicating" : verdict;
		await store.updateTask({ ...task, phase: nextPhase });
		await options?.commit?.(taskId, nextPhase);
	};

	if (options?.safety) {
		await withMergeLock(options.safety.backlogDir, run, options.safety.lockFs);
	} else {
		await run();
	}
}

/**
 * Resolves a task sitting in `adjudicating` to its final terminal phase
 * (BACK-682 AC#1/#14) — called ONLY with the output of an independent
 * judgmental audit (the `adjudicate` skill's leaf agent), never with an
 * implementation agent's self-report. This is deliberately a separate
 * function from `completeTask`: `completeTask` re-runs DoD mechanically
 * (ENG-8); this step consumes a judgment call instead, so it takes the
 * verdict directly rather than a `CompletionResult`.
 *
 * Retreat ("needs another implementation round") is NOT a valid `verdict`
 * here — a retreat is written via `src/engine/retreat.ts`'s `recordRetreat`,
 * which moves the phase back to `task.entry_phase` under its own guards
 * (single-step, gap-fingerprint dedup, three-way contract).
 */
export async function completeAdjudication(
	taskId: string,
	verdict: "done" | "needs-human",
	store: TaskStore,
	options?: Pick<CompleteTaskOptions, "commit">,
): Promise<void> {
	const task = await store.getTask(taskId);
	if (!task) throw new Error(`Task ${taskId} not found`);
	await store.updateTask({ ...task, phase: verdict });
	await options?.commit?.(taskId, verdict);
}
