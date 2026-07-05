/**
 * BACK-633 (BACK-602 plan §602.2): e2e round-trip + read-API freeze for the
 * migrated `engine stage2-gate` writer, plus the AC#3 baime-consumer
 * simulation.
 *
 * 1. "migrated writer round trip": recordStage2Gate (the function backing
 *    `engine stage2-gate`, post BACK-633 migration) writes through
 *    appendGateEvent; queryGateEvents reads it back. This pins the
 *    write -> read contract that BACK-604/E4's gate-inbox depends on:
 *    pagination (offset/limit) and every filter (pipeline_id/gate/actor/
 *    since/until) must keep working exactly as BACK-632 specified. Do not
 *    change queryGateEvents's signature without updating this test.
 * 2. "AC#3 baime GCL consumer simulation": a payload carrying E/C/H fields
 *    (the shape baime's GCL pipeline would attach) is written and read back
 *    purely through the public read API (queryGateEvents) — proving a
 *    consumer can interpret payload — while separately asserting (via
 *    source inspection) that gate-event-store.ts itself never references
 *    those field names, keeping payload opaque to engine core.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendGateEvent, queryGateEvents } from "../core/gate-event-store.ts";
import { recordStage2Gate } from "../harness/stage2-gate.ts";

function tmpLogPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "gate-event-e2e-test-"));
	return { dir, path: join(dir, "gcl-events.jsonl") };
}

describe("e2e round trip — migrated engine stage2-gate writer -> queryGateEvents", () => {
	it("writes stage2 gate events via recordStage2Gate and reads them back with filters + pagination", () => {
		const { dir, path } = tmpLogPath();
		try {
			recordStage2Gate(
				{ passed: true },
				"/repo/rebuilt-a",
				path,
				{ id: "evt-a", itemId: "BACK-600.10", pipelineId: "stage2-gate" },
				undefined,
				"2026-07-05T00:00:00.000Z",
			);
			recordStage2Gate(
				{ passed: false, reason: "suite-failed", failures: "1 test failed" },
				"/repo/rebuilt-b",
				path,
				{ id: "evt-b", itemId: "BACK-600.10", pipelineId: "stage2-gate" },
				undefined,
				"2026-07-05T01:00:00.000Z",
			);
			recordStage2Gate(
				{ passed: true },
				"/repo/rebuilt-c",
				path,
				{ id: "evt-c", itemId: "BACK-601", pipelineId: "other-pipeline" },
				undefined,
				"2026-07-05T02:00:00.000Z",
			);

			// Basic round trip: everything written is readable.
			expect(queryGateEvents(path)).toHaveLength(3);

			// gate filter (all three are gate="stage2", set by recordStage2Gate).
			expect(queryGateEvents(path, { gate: "stage2" }).map((e) => e.id)).toEqual(["evt-a", "evt-b", "evt-c"]);

			// pipeline_id filter.
			expect(queryGateEvents(path, { pipeline_id: "stage2-gate" }).map((e) => e.id)).toEqual(["evt-a", "evt-b"]);

			// actor filter (recordStage2Gate always sets actor="machine").
			expect(queryGateEvents(path, { actor: "machine" })).toHaveLength(3);

			// verdict is readable straight from the event (not a filter, but part
			// of the frozen shape the gate-inbox will read).
			const [passA, failB] = queryGateEvents(path, { pipeline_id: "stage2-gate" });
			expect(passA?.verdict).toBe("pass");
			expect(failB?.verdict).toBe("fail");
			expect(failB?.payload).toEqual({
				reason: "suite-failed",
				failures: "1 test failed",
				rebuiltRepoPath: "/repo/rebuilt-b",
			});

			// time range filter.
			expect(
				queryGateEvents(path, { since: "2026-07-05T01:00:00.000Z", until: "2026-07-05T02:00:00.000Z" }).map(
					(e) => e.id,
				),
			).toEqual(["evt-b", "evt-c"]);

			// pagination (offset/limit), on-disk order.
			expect(queryGateEvents(path, { limit: 2 }).map((e) => e.id)).toEqual(["evt-a", "evt-b"]);
			expect(queryGateEvents(path, { offset: 1, limit: 1 }).map((e) => e.id)).toEqual(["evt-b"]);

			// combined filters (AND semantics).
			expect(queryGateEvents(path, { pipeline_id: "stage2-gate", gate: "stage2" }).map((e) => e.id)).toEqual([
				"evt-a",
				"evt-b",
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("AC#3 — simulated baime GCL pipeline consumer reads E/C/H via the read API only", () => {
	it("a consumer using only queryGateEvents can interpret E/C/H fields inside payload", () => {
		const { dir, path } = tmpLogPath();
		try {
			// A hypothetical baime GCL gate event — engine core never constructs
			// this shape itself; it is opaque payload from core's perspective.
			appendGateEvent(path, {
				id: "gcl-evt-1",
				item_id: "BACK-999",
				pipeline_id: "baime-gcl",
				gate: "gcl-review",
				actor: "baime",
				verdict: "pass",
				timestamp: "2026-07-05T03:00:00.000Z",
				payload: { E: 0.92, C: 0.5, H: 1.1, delta_H: -0.3 },
			});

			// "baime consumer": reads solely through the public read API.
			const [event] = queryGateEvents(path, { pipeline_id: "baime-gcl", gate: "gcl-review" });
			expect(event).toBeDefined();
			const payload = event?.payload as { E: number; C: number; H: number; delta_H: number };
			expect(payload.E).toBeCloseTo(0.92);
			expect(payload.C).toBeCloseTo(0.5);
			expect(payload.H).toBeCloseTo(1.1);
			expect(payload.delta_H).toBeCloseTo(-0.3);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("gate-event-store.ts itself never references E/C/H/gcl field names (negative control)", () => {
		const source = readFileSync(join(import.meta.dir, "../core/gate-event-store.ts"), "utf-8");
		expect(source).not.toMatch(/["'`]E["'`]/);
		expect(source).not.toMatch(/["'`]C["'`]/);
		expect(source).not.toMatch(/["'`]H["'`]/);
		expect(source).not.toMatch(/["'`]gcl["'`]/i);
		expect(source).not.toMatch(/\.payload\s*\.\s*\w/);
		expect(source).not.toMatch(/\.payload\s*\[/);
	});
});
