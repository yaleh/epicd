import { useState } from "react";
import { apiClient, ApiError, type TaskActionResult } from "../lib/api";
import { visibleTaskActions } from "../lib/task-actions";
import type { Task, TaskAction } from "../../types";

// BACK-695: shared by TaskList (row/card) and TaskDetailsModal so the whenStatus filtering,
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
					className="inline-flex items-center gap-1 rounded-md border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50"
				>
					<svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
						<path d="M6.3 3.3a1 1 0 011.05-.07l9 5.5a1 1 0 010 1.72l-9 5.5A1 1 0 016 15.06V4.94a1 1 0 01.3-.71z" />
					</svg>
					{action.label}
				</button>
			))}
		</div>
	);
}
