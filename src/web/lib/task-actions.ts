import type { Task, TaskAction } from "../../types";

// BACK-695: pure helper shared by TaskList and TaskDetailsModal so the whenStatus filtering
// rule (AC #3) has a single implementation instead of being duplicated per component.

/**
 * Returns the task actions that should be shown as buttons for a given task: actions with
 * no `whenStatus` are always shown; actions with `whenStatus` are shown only when the task's
 * current status is in that whitelist.
 */
export function visibleTaskActions(taskActions: TaskAction[] | undefined, task: Pick<Task, "status">): TaskAction[] {
	if (!taskActions || taskActions.length === 0) return [];
	return taskActions.filter((action) => !action.whenStatus || action.whenStatus.includes(task.status));
}
