import type { Task } from "../../types";
import { isTerminalStatus } from "../../utils/terminal-status";
import type { ClaimState } from "./coordinator-claims";
import { computeDriverIndicator, type DriverIndicator, getPhaseActor } from "./driver-indicator";

// Browser-safe (no `node:fs`): imported directly by TaskList.tsx. Pulled out of the
// component so the All Tasks page's default filter/sort behavior (BACK-653) is a set of
// pure, independently-testable functions instead of inline JSX logic.

export function extractTaskNumericId(taskId: string): number | null {
	const match = taskId.trim().match(/(\d+)$/);
	if (!match?.[1]) return null;
	return Number.parseInt(match[1], 10);
}

/** Ascending by numeric task id (e.g. BACK-12 < BACK-100), falling back to locale compare. */
export function compareTaskIdsAscending(a: Pick<Task, "id">, b: Pick<Task, "id">): number {
	const idA = extractTaskNumericId(a.id);
	const idB = extractTaskNumericId(b.id);

	if (idA !== null && idB !== null) {
		return idA - idB;
	}
	if (idA !== null) return -1;
	if (idB !== null) return 1;
	return a.id.localeCompare(b.id, undefined, { sensitivity: "base", numeric: true });
}

export function sortTasksByIdDescending<T extends Pick<Task, "id">>(list: T[]): T[] {
	return [...list].sort((a, b) => compareTaskIdsAscending(b, a));
}

/**
 * A task is "terminal" (BACK-653 AC#3, actor=none-equivalent) when either:
 *  - it has a `pipeline_id`/`phase` and the pipeline declares that phase's actor as
 *    "none" (reuses `getPhaseActor`, BACK-645's actor-classification, unchanged), or
 *  - it has no pipeline/phase info at all, and its plain `status` is the last configured
 *    status — the same terminal-status convention already used by the Kanban cleanup flow.
 */
export function isTaskTerminal(
	task: Pick<Task, "pipeline_id" | "phase" | "status">,
	availableStatuses: readonly string[],
): boolean {
	const actor = getPhaseActor(task.pipeline_id, task.phase);
	if (actor) return actor === "none";
	return isTerminalStatus(task.status, availableStatuses);
}

/** Per-task driver indicator, joining `actor(phase)` with its Coordinator claim state. */
export function getTaskDriverIndicator(
	task: Pick<Task, "id" | "pipeline_id" | "phase">,
	claimStates: Record<string, ClaimState>,
): DriverIndicator | null {
	const actor = getPhaseActor(task.pipeline_id, task.phase);
	const claimState: ClaimState = claimStates[task.id] ?? "unclaimed";
	return computeDriverIndicator(actor, claimState);
}

/**
 * Sort priority (BACK-653 AC#4), lower value sorts first:
 *   0. human-gate (👤)  1. stale (⚠️)  2. agent-active (🤖)  3. queued (⏳)
 *   4. no indicator and not terminal (e.g. legacy task with no pipeline_id yet)
 *   5. terminal (✓, actor=none) — hidden by default, see `filterVisibleTasks`
 */
export const DRIVER_INDICATOR_PRIORITY: Record<DriverIndicator, number> = {
	"human-gate": 0,
	stale: 1,
	"agent-active": 2,
	queued: 3,
};
export const NO_INDICATOR_PRIORITY = 4;
export const TERMINAL_PRIORITY = 5;

export function driverPriorityRank(
	task: Pick<Task, "id" | "pipeline_id" | "phase" | "status">,
	claimStates: Record<string, ClaimState>,
	availableStatuses: readonly string[],
): number {
	const indicator = getTaskDriverIndicator(task, claimStates);
	if (indicator) return DRIVER_INDICATOR_PRIORITY[indicator];
	return isTaskTerminal(task, availableStatuses) ? TERMINAL_PRIORITY : NO_INDICATOR_PRIORITY;
}

/**
 * Sorts tasks by driver-indicator priority (BACK-653 AC#4). Applied both to the flat
 * All Tasks view and *within* each existing lane/phase grouping (BACK-644) — this never
 * changes which lane/phase bucket a task falls into, only the order inside it.
 */
export function sortTasksByDriverPriority(
	tasks: Task[],
	claimStates: Record<string, ClaimState>,
	availableStatuses: readonly string[],
): Task[] {
	return [...tasks].sort((a, b) => {
		const rankDiff =
			driverPriorityRank(a, claimStates, availableStatuses) - driverPriorityRank(b, claimStates, availableStatuses);
		if (rankDiff !== 0) return rankDiff;
		return compareTaskIdsAscending(b, a);
	});
}

/** Default All Tasks view (BACK-653 AC#3) hides terminal tasks unless `showDone` is on. */
export function filterVisibleTasks(tasks: Task[], availableStatuses: readonly string[], showDone: boolean): Task[] {
	if (showDone) return tasks;
	return tasks.filter((task) => !isTaskTerminal(task, availableStatuses));
}

/** Inline gate-review actions (BACK-646) are only offered on human-gate rows. */
export function canShowGateActions(task: Pick<Task, "pipeline_id" | "phase">): boolean {
	return getPhaseActor(task.pipeline_id, task.phase) === "human";
}
