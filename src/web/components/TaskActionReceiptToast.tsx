import type { TaskActionResult } from "../lib/api";

// BACK-695: fire-and-forget receipt for a task action dispatch. Deliberately not the same
// component as SuccessToast (which is hardcoded green) - a task action's exit code can be
// non-zero, and the toast must say so without implying the task's status changed.

interface TaskActionReceiptToastProps {
	actionLabel: string;
	result: TaskActionResult;
	onDismiss: () => void;
}

function summarizeOutput(result: TaskActionResult): string | null {
	const text = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
	if (!text) return null;
	const firstLines = text.split("\n").slice(0, 3).join(" ");
	return firstLines.length > 160 ? `${firstLines.slice(0, 160)}…` : firstLines;
}

export function TaskActionReceiptToast({ actionLabel, result, onDismiss }: TaskActionReceiptToastProps) {
	const success = result.exitCode === 0;
	const colorClasses = success
		? "bg-green-500 dark:bg-green-600 border-green-400 dark:border-green-500"
		: "bg-red-500 dark:bg-red-600 border-red-400 dark:border-red-500";
	const outputSummary = summarizeOutput(result);

	return (
		<div
			className={`fixed top-4 right-4 ${colorClasses} text-white px-6 py-4 rounded-lg shadow-xl flex items-start gap-3 animate-slide-in-right z-50 border transition-colors duration-200 max-w-md`}
			role="status"
		>
			<div className="flex-1 min-w-0">
				<div className="font-medium">
					{actionLabel}: {success ? "done" : `failed (exit ${result.exitCode})`}
				</div>
				{outputSummary && <div className="mt-1 text-xs opacity-90 truncate">{outputSummary}</div>}
			</div>
			<button
				onClick={onDismiss}
				className="text-white/80 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/50 rounded p-1"
				aria-label="Dismiss"
			>
				<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	);
}
