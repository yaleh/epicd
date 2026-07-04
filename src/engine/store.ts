import type { Core } from "../core/backlog.js";
import type { TaskStore } from "./complete.js";

/**
 * Build a TaskStore backed by the real Core (reads and writes backlog/tasks/*.md).
 * autoCommit is disabled so the engine controls when changes are persisted to git.
 */
export function makeBoardStore(core: Core): TaskStore {
	return {
		getTask: (taskId) => core.getTask(taskId),
		updateTask: (task) => core.updateTask(task, false),
	};
}
