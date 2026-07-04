import type { Task } from "../types/index.js";
import type { CompletionResult } from "./complete.js";

export type Verdict = "done" | "needs-human";

/** Returns true when the task is a primitive (leaf) — it has no subtask children. */
export function isPrimitive(task: Task): boolean {
	return !task.subtasks || task.subtasks.length === 0;
}

/**
 * Adjudicate the outcome of a completed phase for a primitive task.
 *
 * Rules (in order):
 *  1. If spawn failed → needs-human.
 *  2. If any DoD item is unchecked → needs-human.
 *  3. Otherwise → done.
 */
export function adjudicate(task: Task, result: CompletionResult): Verdict {
	if (!result.success) return "needs-human";

	if (task.definitionOfDoneItems && task.definitionOfDoneItems.length > 0) {
		if (task.definitionOfDoneItems.some((item) => !item.checked)) return "needs-human";
	}

	return "done";
}
