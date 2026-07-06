import { resolvePipelinePhase } from "../core/engine-fields-backfill.ts";
import { pipelineById } from "../engine/pipeline.ts";

export function getTerminalStatus(statuses: readonly string[]): string | null {
	if (statuses.length === 0) return null;
	const terminalStatus = statuses[statuses.length - 1];
	return terminalStatus && terminalStatus.trim().length > 0 ? terminalStatus : null;
}

function normalizeStatusForComparison(status: string | null | undefined): string {
	return (status ?? "").trim().toLowerCase();
}

/** True when `status` carries the canonical `"<Role>: <Phase>"` label() format, e.g. "Basic: Done". */
function hasRolePrefix(status: string): boolean {
	return /^[A-Za-z]+:\s*\S/.test(status.trim());
}

/**
 * True when `status` resolves (via the BACK-655 legacy-vocab table) to a
 * phase whose `actor` is `"none"` — the engine's terminal/waiting-only class
 * (`execution/done`, `awaiting-children`, `exploration/done`). This lets a
 * `Basic: Done` task be recognized as terminal even when phase is unset and
 * regardless of where `Done` sits in the board's configured status list.
 *
 * Only applies to statuses already in the canonical `label()` format
 * (`"<Role>: <Phase>"`). A bare custom-board word that happens to collide
 * with a phase name (e.g. a board declaring a literal status `"Done"`) is not
 * engine-managed vocabulary and must not be reinterpreted — it falls through
 * to the last-configured-status fallback below.
 */
function isEngineTerminalStatus(status: string | null | undefined): boolean {
	if (!status || !hasRolePrefix(status)) return false;
	const resolved = resolvePipelinePhase(status);
	if (!resolved) return false;
	const state = pipelineById(resolved.pipeline_id)?.states.find((s) => s.name === resolved.phase);
	return state?.actor === "none";
}

/**
 * A status is terminal when it derives to an engine actor:"none" phase
 * (BACK-655 Phase E); the last-configured-status comparison is kept as a
 * fallback for non-engine/custom status vocabularies (existing consumers:
 * Kanban `CleanupModal`, board export).
 */
export function isTerminalStatus(status: string | null | undefined, statuses: readonly string[]): boolean {
	if (isEngineTerminalStatus(status)) return true;

	const terminalStatus = getTerminalStatus(statuses);
	return (
		terminalStatus !== null && normalizeStatusForComparison(status) === normalizeStatusForComparison(terminalStatus)
	);
}
