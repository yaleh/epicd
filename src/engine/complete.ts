import type { Task } from "../types/index.js";
import { adjudicate } from "./adjudicate.js";
import type { Pipeline } from "./pipeline.js";
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
		await store.updateTask({ ...task, phase: verdict });
		await options?.commit?.(taskId, verdict);
	};

	if (options?.safety) {
		await withMergeLock(options.safety.backlogDir, run, options.safety.lockFs);
	} else {
		await run();
	}
}
