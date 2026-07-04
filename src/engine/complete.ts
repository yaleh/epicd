import type { Task } from "../types/index.js";
import { adjudicate } from "./adjudicate.js";
import type { Pipeline } from "./pipeline.js";
import { type MergeLockFs, withMergeLock } from "./safety.js";

export interface CompletionResult {
	success: boolean;
	output?: string;
	error?: string;
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
	 * When combined with `safety`, the call is wrapped in withMergeLock.
	 */
	merge?: (taskId: string, result: CompletionResult) => Promise<void>;
	/** Safety config for merge-lock serialisation. */
	safety?: { backlogDir: string; lockFs: MergeLockFs };
}

/**
 * Unified worker→engine handshake for primitive tasks.
 *
 * Replaces the driver's previously-inlined adjudicate+merge+update logic so
 * there is exactly one adjudication path (ENG-8 / advisory B).
 *
 * Flow:
 *   1. Load task from store.
 *   2. Merge worktree branch (under merge lock when safety is provided).
 *   3. Adjudicate result (success + DoD items) → done | needs-human.
 *   4. Update task phase — engine decides; worker never self-declares done.
 */
export async function completeTask(
	taskId: string,
	result: CompletionResult,
	store: TaskStore,
	options?: CompleteTaskOptions,
): Promise<void> {
	const task = await store.getTask(taskId);
	if (!task) throw new Error(`Task ${taskId} not found`);

	// Merge worktree branch (serialised if safety is provided)
	if (options?.merge) {
		const mergeFn = options.merge;
		const doMerge = () => mergeFn(taskId, result);
		if (options.safety) {
			await withMergeLock(options.safety.backlogDir, doMerge, options.safety.lockFs);
		} else {
			await doMerge();
		}
	}

	// Adjudicate and persist — engine is sole authority over done/needs-human
	const verdict = adjudicate(task, result);
	await store.updateTask({ ...task, phase: verdict });
}
