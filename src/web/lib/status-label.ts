import { displayStatus } from "../../core/field-registry";
import type { PipelineState } from "../../engine/pipeline";
import { getPhaseActor } from "./driver-indicator";

/**
 * Re-exported so web components have one import for the phase-derived status TEXT
 * (this file already owns the status badge COLOR via getStatusBadgeClass below).
 * field-registry.ts is pure logic (no node:fs) — safe for the browser bundle,
 * verified by `bun build` against this file.
 */
export { displayStatus };

// Browser-safe (no `node:fs`): imported directly by TaskList.tsx / TaskColumn.tsx /
// MilestonesPage.tsx.

const HUMAN_CLASS = "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200";
const MACHINE_CLASS = "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200";
const DONE_CLASS = "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
const BLOCKED_CLASS = "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
const INERT_CLASS = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";

/**
 * The single `label(phase, actor)` render-boundary projection (BACK-604 AC#5 / BACK-646
 * 604.3), converging what used to be 3 separately-duplicated status-color heuristics
 * (`TaskList.getStatusColor`, `TaskColumn.getStatusBadgeClass`, `MilestonesPage.getStatusBadgeClass`
 * via `MilestoneTaskRow`). Pure phase+actor -> Tailwind color-class lookup; `actor` must come
 * from a pipeline-data lookup (`getPhaseActor`), never a per-task field, and this never
 * interprets/parses a display string — that's `getStatusBadgeClass`'s job below, and only as
 * a legacy fallback.
 */
export function label(phase: string | undefined, actor: PipelineState["actor"] | undefined): string {
	if (actor === "human") return HUMAN_CLASS;
	if (actor === "machine") return MACHINE_CLASS;
	// actor === "none" or unknown/no actor resolved at all.
	if (phase === "done") return DONE_CLASS;
	return INERT_CLASS;
}

/**
 * Legacy fallback for tasks that carry no engine `phase` (only the old free-text `status`
 * string) — equivalent to the union of what the 3 pre-convergence heuristics used to render
 * for such tasks (to-do/blank -> gray, in-progress/doing -> blue, done/complete -> green,
 * blocked/stuck -> red), so non-engine tasks don't regress.
 */
function legacyColorClass(status: string): string {
	const normalized = status.toLowerCase();
	if (normalized.includes("done") || normalized.includes("complete")) return DONE_CLASS;
	if (normalized.includes("progress") || normalized.includes("doing")) return MACHINE_CLASS;
	if (normalized.includes("blocked") || normalized.includes("stuck")) return BLOCKED_CLASS;
	return INERT_CLASS;
}

/**
 * Converged status-badge color-class lookup. Callers pass whatever they have:
 *  - `TaskList`/`MilestonesPage` have the full task, so pass `task.phase`/`task.pipeline_id`.
 *  - `TaskColumn` only knows the column's status string (title) plus the tasks currently in
 *    it, so it passes one representative task's `phase`/`pipeline_id` (all tasks in a status
 *    column share the same displayed status, hence the same phase when engine-managed).
 * When `phase` resolves to a known pipeline actor, color is derived from pipeline-data only.
 * Otherwise (no phase — legacy task, or an empty/non-engine column) falls back to the
 * status-string heuristic above.
 */
export function getStatusBadgeClass(status: string | undefined, phase?: string, pipelineId?: string): string {
	const actor = getPhaseActor(pipelineId, phase);
	if (phase && actor !== undefined) {
		return label(phase, actor);
	}
	return legacyColorClass(status ?? "");
}
