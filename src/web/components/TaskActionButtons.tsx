import { useState } from "react";
import { apiClient, ApiError, type TaskActionResult } from "../lib/api";
import { visibleTaskActions } from "../lib/task-actions";
import type { Task, TaskAction } from "../../types";

// BACK-695: shared by TaskList (row/card) and TaskDetailsModal so the whenPhase filtering,
// dispatch call, and pending/receipt state have a single implementation.

interface TaskActionButtonsProps {
	task: Task;
	taskActions: TaskAction[] | undefined;
	className: string;
	onResult: (action: TaskAction, result: TaskActionResult) => void;
}

export function TaskActionButtons({ task, taskActions, className, onResult }: TaskActionButtonsProps) {
	const [pendingActionId, setPendingActionId] = useState<string | null>(null);
	const actions = visibleTaskActions(taskActions, task);
	if (actions.length === 0) return null;

	const runAction = async (action: TaskAction, event: React.MouseEvent) => {
		event.stopPropagation();
		setPendingActionId(action.id);
		try {
			const result = await apiClient.runTaskAction(task.id, action.id);
			onResult(action, result);
		} catch (err) {
			const message = err instanceof ApiError ? err.message : "Failed to run task action.";
			onResult(action, { exitCode: -1, stderr: message });
		} finally {
			setPendingActionId(null);
		}
	};

	return (
		<div className={className} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
			{actions.map((action) => (
				<button
					key={action.id}
					type="button"
					disabled={pendingActionId === action.id}
					onClick={(event) => runAction(action, event)}
					title={action.label}
					aria-label={action.label}
					className="inline-flex items-center whitespace-nowrap rounded-md border border-transparent bg-blue-600 dark:bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-1 disabled:opacity-50"
				>
					{action.label}
				</button>
			))}
		</div>
	);
}
