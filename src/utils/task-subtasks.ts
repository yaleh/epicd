import type { Task } from "../types/index.ts";
import { taskIdsEqual } from "./task-path.ts";
import { sortByTaskId } from "./task-sorting.ts";

/**
 * Independent has-children indicator (BACK-664 child 1 / BACK-665 AC#3):
 * whether a task has any children, derived purely from tree position
 * (`parentTaskId`), never concatenated into the status display string.
 */
export function hasChildren(task: Task, tasks: Task[]): boolean {
	return tasks.some(
		(candidate) => Boolean(candidate.parentTaskId) && taskIdsEqual(candidate.parentTaskId ?? "", task.id),
	);
}

export function attachSubtaskSummaries(task: Task, tasks: Task[]): Task {
	let parentTitle: string | undefined;
	if (task.parentTaskId) {
		const parent = tasks.find((candidate) => taskIdsEqual(task.parentTaskId ?? "", candidate.id));
		if (parent) {
			parentTitle = parent.title;
		}
	}

	const summaries: Array<{ id: string; title: string }> = [];
	for (const candidate of tasks) {
		if (!candidate.parentTaskId) continue;
		if (!taskIdsEqual(candidate.parentTaskId, task.id)) continue;
		summaries.push({ id: candidate.id, title: candidate.title });
	}

	if (summaries.length === 0) {
		if (parentTitle && parentTitle !== task.parentTaskTitle) {
			return {
				...task,
				parentTaskTitle: parentTitle,
			};
		}
		return task;
	}

	const sortedSummaries = sortByTaskId(summaries);
	return {
		...task,
		...(parentTitle && parentTitle !== task.parentTaskTitle ? { parentTaskTitle: parentTitle } : {}),
		subtasks: sortedSummaries.map((summary) => summary.id),
		subtaskSummaries: sortedSummaries,
	};
}
