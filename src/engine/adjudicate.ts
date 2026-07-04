import { roleOf, type Task } from "../types/index.js";
import type { CompletionResult } from "./complete.js";

export type Verdict = "done" | "needs-human";

/** Returns true when the task is compound (has role=compound, or has subtask children). */
export function isCompound(task: Task): boolean {
	return roleOf(task) === "compound";
}

/** Returns true when the task is a primitive (leaf) — not compound. */
export function isPrimitive(task: Task): boolean {
	return !isCompound(task);
}

/**
 * Adjudicate the outcome of a completed phase for a primitive task.
 *
 * Rules (in order, ENG-8 precedence):
 *  1. If spawn failed → needs-human.
 *  2. If dodResults present:
 *     a. Empty dodResults → needs-human (engine cannot verify work).
 *     b. Any command failed → needs-human (shell truth wins; checkbox cannot override).
 *  3. If no dodResults (legacy / no DoD runner injected):
 *     fall back to checkbox scan — any unchecked item → needs-human.
 *  4. Otherwise → done.
 */
export function adjudicate(task: Task, result: CompletionResult): Verdict {
	if (!result.success) return "needs-human";

	if (result.dodResults !== undefined) {
		// ENG-8 path: engine re-ran commands; worker cannot self-attest.
		if (result.dodResults.length === 0) return "needs-human";
		if (result.dodResults.some((r) => !r.passed)) return "needs-human";
		return "done";
	}

	// Legacy fallback: no DoD runner was injected; use checkbox state.
	if (task.definitionOfDoneItems && task.definitionOfDoneItems.length > 0) {
		if (task.definitionOfDoneItems.some((item) => !item.checked)) return "needs-human";
	}

	return "done";
}
