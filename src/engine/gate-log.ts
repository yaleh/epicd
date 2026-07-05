/**
 * Shared read-only CLI wrapper over `queryGateEvents` (src/core/gate-event-store.ts).
 *
 * This is the ONE place that turns CLI-shaped string options (from `engine gate-log`,
 * see src/cli.ts) into a `GateEventFilter` and resolves the default log file path.
 * BACK-605.9's `inbox` operation skill shells out to `engine gate-log`; BACK-605.10's
 * planned CLI/Web read surfaces are expected to reuse this same function instead of
 * re-implementing the query wrapper a second time (CLAUDE.md simplicity-first: single
 * implementation for similar concerns).
 */

import { type GateEvent, type GateEventFilter, queryGateEvents } from "../core/gate-event-store.ts";

/** Default gate-event log location, relative to the project root. */
export const DEFAULT_GATE_LOG_RELATIVE_PATH = "docs/research/gate-events.jsonl";

export interface GateLogQueryOptions {
	/** Absolute or relative path to the GateEvent JSONL log; defaults to `<cwd>/docs/research/gate-events.jsonl`. */
	file?: string;
	pipelineId?: string;
	gate?: string;
	actor?: string;
	since?: string;
	until?: string;
	limit?: string | number;
	offset?: string | number;
}

function toInt(value: string | number | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Resolve the default log path against `cwd` when `options.file` is not given. */
export function resolveGateLogPath(cwd: string, options: GateLogQueryOptions = {}): string {
	if (options.file) return options.file;
	return `${cwd}/${DEFAULT_GATE_LOG_RELATIVE_PATH}`;
}

/**
 * Run a read-only gate-event query for a CLI (or any other read surface) invocation.
 * Pure pass-through onto `queryGateEvents` — no additional interpretation of `payload`.
 */
export function runGateLogQuery(cwd: string, options: GateLogQueryOptions = {}): GateEvent[] {
	const path = resolveGateLogPath(cwd, options);
	const filter: GateEventFilter = {
		pipeline_id: options.pipelineId,
		gate: options.gate,
		actor: options.actor,
		since: options.since,
		until: options.until,
		limit: toInt(options.limit),
		offset: toInt(options.offset),
	};
	return queryGateEvents(path, filter);
}
