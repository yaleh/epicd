/**
 * gate-event-store — GateEvent append-only log + query API.
 *
 * Negative controls (BACK-632 acceptance):
 *   1. Append-only: no update/delete is exported; a repeated write with a
 *      reused id never overwrites the earlier line (both are preserved).
 *   2. Core does not interpret payload: a payload containing E/C/H/gcl
 *      field names round-trips untouched, and the module source contains
 *      no string match / special-case on those field names.
 *   3. Real concurrent writes (genuine child processes, not a mocked lock):
 *      no line is lost, corrupted, or interleaved.
 *   4. Query filters (pipeline_id / gate / actor / time range / pagination)
 *      each tested independently.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as gateEventStore from "../core/gate-event-store.ts";
import { appendGateEvent, type GateEvent, queryGateEvents } from "../core/gate-event-store.ts";

function makeEvent(overrides: Partial<GateEvent> = {}): GateEvent {
	return {
		id: "evt-1",
		item_id: "BACK-632",
		pipeline_id: "pipeline-a",
		gate: "gate-1",
		actor: "actor-a",
		verdict: "pass",
		timestamp: "2026-07-05T00:00:00.000Z",
		payload: { note: "hello" },
		...overrides,
	};
}

function tmpLogPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "gate-event-store-test-"));
	return { dir, path: join(dir, "gate-events.jsonl") };
}

describe("appendGateEvent / queryGateEvents — basic round trip", () => {
	it("writes and reads back a single event", () => {
		const { dir, path } = tmpLogPath();
		try {
			appendGateEvent(path, makeEvent());
			const events = queryGateEvents(path);
			expect(events).toHaveLength(1);
			expect(events[0]).toEqual(makeEvent());
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("querying a log that does not exist yet returns an empty array", () => {
		const { dir, path } = tmpLogPath();
		try {
			expect(queryGateEvents(path)).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("creates parent directories on first append", () => {
		const dir = mkdtempSync(join(tmpdir(), "gate-event-store-test-"));
		try {
			const nestedPath = join(dir, "nested", "sub", "gate-events.jsonl");
			appendGateEvent(nestedPath, makeEvent());
			expect(queryGateEvents(nestedPath)).toHaveLength(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("negative control #1 — append-only, no rewrite/delete", () => {
	it("exports no update/delete/remove/rewrite function", () => {
		const exported = Object.keys(gateEventStore);
		expect(exported).toContain("appendGateEvent");
		expect(exported).toContain("queryGateEvents");
		for (const name of exported) {
			expect(name.toLowerCase()).not.toMatch(/update|delete|remove|rewrite|overwrite|truncate/);
		}
	});

	it("attempting to 'rewrite' an already-written event via a second append never removes the original", () => {
		const { dir, path } = tmpLogPath();
		try {
			const original = makeEvent({ id: "evt-dup", verdict: "pass" });
			appendGateEvent(path, original);

			// Attempted tamper: append an event with the same id claiming a different verdict.
			const tamper = makeEvent({ id: "evt-dup", verdict: "fail" });
			appendGateEvent(path, tamper);

			// Both lines survive — the "rewrite" attempt only ever appended a new
			// line; the original event is still present, unmodified.
			const events = queryGateEvents(path, { pipeline_id: "pipeline-a" });
			expect(events).toHaveLength(2);
			expect(events[0]).toEqual(original);
			expect(events[1]).toEqual(tamper);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("the log file only ever grows (byte length is monotonically non-decreasing across appends)", () => {
		const { dir, path } = tmpLogPath();
		try {
			appendGateEvent(path, makeEvent({ id: "a" }));
			const sizeAfterFirst = readFileSync(path, "utf-8").length;
			appendGateEvent(path, makeEvent({ id: "b" }));
			const sizeAfterSecond = readFileSync(path, "utf-8").length;
			expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("negative control #2 — core does not interpret payload", () => {
	it("round-trips a payload containing E/C/H/gcl field names untouched", () => {
		const { dir, path } = tmpLogPath();
		try {
			const payload = { E: 0.9, C: 0.5, H: 3.2, gcl: "some-gcl-token", nested: { gcl: { E: 1 } } };
			const event = makeEvent({ id: "evt-payload", payload });
			appendGateEvent(path, event);

			const [result] = queryGateEvents(path);
			expect(result?.payload).toEqual(payload);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("source contains no string match / special-case on E/C/H/gcl field names", () => {
		const source = readFileSync(join(import.meta.dir, "../core/gate-event-store.ts"), "utf-8");
		// Reject any quoted literal referencing these field names (property access,
		// object key, or string comparison). Deliberately narrow (quoted forms only)
		// so it doesn't false-positive on unrelated identifiers like "each"/"change".
		expect(source).not.toMatch(/["'`]E["'`]/);
		expect(source).not.toMatch(/["'`]C["'`]/);
		expect(source).not.toMatch(/["'`]H["'`]/);
		expect(source).not.toMatch(/["'`]gcl["'`]/i);
		expect(source).not.toMatch(/\.payload\s*\.\s*\w/); // never reaches into payload's shape
		expect(source).not.toMatch(/\.payload\s*\[/);
	});
});

describe("negative control #3 — real concurrent writes (genuine child processes)", () => {
	it("many concurrent child-process appends are neither lost nor corrupted", async () => {
		const { dir, path } = tmpLogPath();
		try {
			const numProcesses = 8;
			const eventsPerProcess = 15;
			// Use the file:// URL string (not .pathname) as the import specifier — on
			// Windows, .pathname yields "/C:/..." (leading slash before the drive
			// letter), which is not a valid module path.
			const moduleUrl = new URL("../core/gate-event-store.ts", import.meta.url).href;

			const script = `
				import { appendGateEvent } from ${JSON.stringify(moduleUrl)};
				const path = ${JSON.stringify(path)};
				const proc = ${JSON.stringify("PLACEHOLDER")};
				for (let i = 0; i < ${eventsPerProcess}; i++) {
					appendGateEvent(path, {
						id: \`\${proc}-\${i}\`,
						item_id: "BACK-632",
						pipeline_id: "concurrent",
						gate: "gate-x",
						actor: proc,
						verdict: "pass",
						timestamp: new Date().toISOString(),
						payload: { i },
					});
				}
			`;

			const procs = Array.from({ length: numProcesses }, (_, procIndex) => {
				const procScript = script.replace('"PLACEHOLDER"', JSON.stringify(`proc${procIndex}`));
				return Bun.spawn(["bun", "-e", procScript], {
					stdout: "pipe",
					stderr: "pipe",
				});
			});

			const results = await Promise.all(
				procs.map(async (proc) => {
					const exitCode = await proc.exited;
					const stderr = await new Response(proc.stderr).text();
					return { exitCode, stderr };
				}),
			);
			for (const { exitCode, stderr } of results) {
				expect(exitCode).toBe(0);
				if (exitCode !== 0) console.error(stderr);
			}

			const events = queryGateEvents(path, { pipeline_id: "concurrent" });
			expect(events).toHaveLength(numProcesses * eventsPerProcess);

			// No corruption: every line parsed cleanly (queryGateEvents already
			// JSON.parse's each line — a corrupted/interleaved line would throw).
			const ids = new Set(events.map((e) => e.id));
			expect(ids.size).toBe(numProcesses * eventsPerProcess); // no id collisions/loss

			for (let p = 0; p < numProcesses; p++) {
				for (let i = 0; i < eventsPerProcess; i++) {
					expect(ids.has(`proc${p}-${i}`)).toBe(true);
				}
			}

			// File itself: line count must match exactly (no dropped/merged lines).
			const rawLines = readFileSync(path, "utf-8")
				.split("\n")
				.filter((l) => l.length > 0);
			expect(rawLines).toHaveLength(numProcesses * eventsPerProcess);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 30_000);
});

describe("negative control #4 — query filters, each independently", () => {
	function seedMixedLog(path: string): void {
		appendGateEvent(path, {
			id: "1",
			item_id: "T-1",
			pipeline_id: "p1",
			gate: "g1",
			actor: "alice",
			verdict: "pass",
			timestamp: "2026-07-01T00:00:00.000Z",
			payload: {},
		});
		appendGateEvent(path, {
			id: "2",
			item_id: "T-2",
			pipeline_id: "p2",
			gate: "g1",
			actor: "bob",
			verdict: "pass",
			timestamp: "2026-07-02T00:00:00.000Z",
			payload: {},
		});
		appendGateEvent(path, {
			id: "3",
			item_id: "T-3",
			pipeline_id: "p1",
			gate: "g2",
			actor: "alice",
			verdict: "fail",
			timestamp: "2026-07-03T00:00:00.000Z",
			payload: {},
		});
		appendGateEvent(path, {
			id: "4",
			item_id: "T-4",
			pipeline_id: "p2",
			gate: "g2",
			actor: "carol",
			verdict: "pass",
			timestamp: "2026-07-04T00:00:00.000Z",
			payload: {},
		});
	}

	it("filters by pipeline_id", () => {
		const { dir, path } = tmpLogPath();
		try {
			seedMixedLog(path);
			const events = queryGateEvents(path, { pipeline_id: "p1" });
			expect(events.map((e) => e.id)).toEqual(["1", "3"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("filters by gate", () => {
		const { dir, path } = tmpLogPath();
		try {
			seedMixedLog(path);
			const events = queryGateEvents(path, { gate: "g2" });
			expect(events.map((e) => e.id)).toEqual(["3", "4"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("filters by actor", () => {
		const { dir, path } = tmpLogPath();
		try {
			seedMixedLog(path);
			const events = queryGateEvents(path, { actor: "alice" });
			expect(events.map((e) => e.id)).toEqual(["1", "3"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("filters by time range (since/until)", () => {
		const { dir, path } = tmpLogPath();
		try {
			seedMixedLog(path);
			const events = queryGateEvents(path, {
				since: "2026-07-02T00:00:00.000Z",
				until: "2026-07-03T00:00:00.000Z",
			});
			expect(events.map((e) => e.id)).toEqual(["2", "3"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("paginates with offset and limit", () => {
		const { dir, path } = tmpLogPath();
		try {
			seedMixedLog(path);
			const page1 = queryGateEvents(path, { limit: 2 });
			const page2 = queryGateEvents(path, { offset: 2, limit: 2 });
			expect(page1.map((e) => e.id)).toEqual(["1", "2"]);
			expect(page2.map((e) => e.id)).toEqual(["3", "4"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("combines filters (AND semantics)", () => {
		const { dir, path } = tmpLogPath();
		try {
			seedMixedLog(path);
			const events = queryGateEvents(path, { pipeline_id: "p1", gate: "g2" });
			expect(events.map((e) => e.id)).toEqual(["3"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
