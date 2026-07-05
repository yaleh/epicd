/**
 * GateEvent store — engine-core-owned schema + append-only log + query API.
 *
 * Boundary (ADR-011 D-4; epic BACK-602 description §7): the semantics of
 * E/C/H, GCL, delta_H live entirely inside `GateEvent.payload`, interpreted
 * by baime's GCL pipeline. This module (and engine core generally) never
 * inspects, matches, or special-cases any field name inside `payload` — it
 * is treated as an opaque blob end to end.
 *
 * API is intentionally minimal (CLAUDE.md simplicity-first):
 *   - appendGateEvent  — append-only write; there is no update/delete.
 *   - queryGateEvents  — read + filter + paginate.
 *
 * Storage: JSONL, one GateEvent per line, written with `appendFileSync`
 * (the same primitive `src/harness/stage2-gate.ts` / `engine stage2-gate`
 * already uses for `docs/research/gate-events.jsonl`). The fs primitive is
 * injected via `GateEventStoreFs` so tests can exercise real file I/O
 * against a tmp path without hardcoding a location — the same "real
 * primitive injection" convention as `MergeLockFs` / `WorktreeRunner` in
 * `src/engine/safety.ts`.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** Generic gate-event shape (epic BACK-602 description). */
export interface GateEvent {
	id: string;
	item_id: string;
	pipeline_id: string;
	gate: string;
	actor: string;
	verdict: string;
	timestamp: string;
	/** Opaque to engine core — never read or matched on by this module. */
	payload: unknown;
}

/** Minimal fs primitive required by the store — injected for testability. */
export interface GateEventStoreFs {
	/** Append one line (no trailing newline) to `path`, creating parent dirs as needed. */
	appendLine(path: string, line: string): void;
	/** Read all non-empty lines of `path`, or `[]` if it does not exist. */
	readLines(path: string): string[];
}

/** Real fs-backed adapter used in production. */
export const realGateEventStoreFs: GateEventStoreFs = {
	appendLine(path: string, line: string): void {
		const dir = dirname(path);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		// O_APPEND write of a single line is the same atomicity primitive the
		// gate-events.jsonl writer relies on (stage2-gate / cli.ts).
		appendFileSync(path, `${line}\n`);
	},
	readLines(path: string): string[] {
		if (!existsSync(path)) return [];
		return readFileSync(path, "utf-8")
			.split("\n")
			.filter((line) => line.length > 0);
	},
};

/**
 * Append `event` to the log at `path`. Append-only: there is no exported
 * update/delete/rewrite. A repeated call (even with a reused `id`) only ever
 * adds a new line — it can never alter or remove a previously written line.
 */
export function appendGateEvent(path: string, event: GateEvent, fs: GateEventStoreFs = realGateEventStoreFs): void {
	fs.appendLine(path, JSON.stringify(event));
}

export interface GateEventFilter {
	pipeline_id?: string;
	gate?: string;
	actor?: string;
	/** Inclusive lower bound on `timestamp` (ISO 8601 string compare). */
	since?: string;
	/** Inclusive upper bound on `timestamp` (ISO 8601 string compare). */
	until?: string;
	/** Max number of events to return, applied after `offset`. */
	limit?: number;
	/** Number of matching events to skip, in log order. */
	offset?: number;
}

/**
 * Read + filter + paginate events from the log at `path`. Filters are
 * combined with AND. Pagination (`offset`/`limit`) applies after filtering,
 * in on-disk (append) order.
 */
export function queryGateEvents(
	path: string,
	filter: GateEventFilter = {},
	fs: GateEventStoreFs = realGateEventStoreFs,
): GateEvent[] {
	const events = fs.readLines(path).map((line) => JSON.parse(line) as GateEvent);

	const filtered = events.filter((event) => {
		if (filter.pipeline_id !== undefined && event.pipeline_id !== filter.pipeline_id) return false;
		if (filter.gate !== undefined && event.gate !== filter.gate) return false;
		if (filter.actor !== undefined && event.actor !== filter.actor) return false;
		if (filter.since !== undefined && event.timestamp < filter.since) return false;
		if (filter.until !== undefined && event.timestamp > filter.until) return false;
		return true;
	});

	const offset = filter.offset ?? 0;
	const page = filtered.slice(offset);
	return filter.limit !== undefined ? page.slice(0, filter.limit) : page;
}
