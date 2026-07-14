import type { Task, TaskAction } from "../../types";

// BACK-695: pure helper shared by TaskList and TaskDetailsModal so the whenPhase filtering
// rule (AC #3) has a single implementation instead of being duplicated per component.

/**
 * Returns the task actions that should be shown as buttons for a given task: actions with
 * no `whenPhase` are always shown; actions with `whenPhase` are shown only when the task's
 * current `phase` (raw pipeline machine-name, see src/engine/pipeline.ts) is in that
 * whitelist (BACK-706). Legacy tasks with no `phase` (no pipeline_id/phase, status-only)
 * never match a non-empty `whenPhase` list, so their button is hidden.
 */
export function visibleTaskActions(taskActions: TaskAction[] | undefined, task: Pick<Task, "phase">): TaskAction[] {
	if (!taskActions || taskActions.length === 0) return [];
	return taskActions.filter(
		(action) => !action.whenPhase || (task.phase !== undefined && action.whenPhase.includes(task.phase)),
	);
}
