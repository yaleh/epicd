import type { Task } from "../types/index.js";
import type { Pipeline } from "./pipeline.js";

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
