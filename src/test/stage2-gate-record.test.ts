/**
 * Phase C / BACK-633: recordStage2Gate — GateEvent recorder tests.
 *
 * Verifies that recordStage2Gate appends a well-formed GateEvent
 * (src/core/gate-event-store.ts) containing:
 *   gate = 'stage2'
 *   verdict = 'pass' | 'fail'
 *   actor = 'machine'
 *   payload = { reason?, failures?, rebuiltRepoPath }
 *   id / item_id / pipeline_id (provenance)
 *   timestamp (injectable)
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { queryGateEvents } from "../core/gate-event-store.ts";
import { recordStage2Gate } from "../harness/stage2-gate.ts";

function tmpLogPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "stage2-gate-record-test-"));
	return { dir, path: join(dir, "gate-events.jsonl") };
}

describe("recordStage2Gate", () => {
	it("records a passing result as a GateEvent", () => {
		const { dir, path } = tmpLogPath();
		try {
			recordStage2Gate(
				{ passed: true },
				"/tmp/rebuilt",
				path,
				{ id: "evt-1", itemId: "BACK-633", pipelineId: "stage2-gate" },
				undefined,
				"2026-07-04T00:00:00.000Z",
			);

			const events = queryGateEvents(path);
			expect(events).toHaveLength(1);
			const event = events[0];
			expect(event?.gate).toBe("stage2");
			expect(event?.verdict).toBe("pass");
			expect(event?.actor).toBe("machine");
			expect(event?.item_id).toBe("BACK-633");
			expect(event?.pipeline_id).toBe("stage2-gate");
			expect(event?.timestamp).toBe("2026-07-04T00:00:00.000Z");
			expect(event?.payload).toEqual({ rebuiltRepoPath: "/tmp/rebuilt" });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("records a suite-failed result with reason and failures excerpt in payload", () => {
		const { dir, path } = tmpLogPath();
		try {
			recordStage2Gate(
				{ passed: false, reason: "suite-failed", failures: "1 test failed" },
				"/tmp/rebuilt",
				path,
				{ id: "evt-2", itemId: "BACK-633", pipelineId: "stage2-gate" },
				undefined,
				"2026-07-04T01:00:00.000Z",
			);

			const [event] = queryGateEvents(path);
			expect(event?.verdict).toBe("fail");
			expect(event?.payload).toEqual({
				reason: "suite-failed",
				failures: "1 test failed",
				rebuiltRepoPath: "/tmp/rebuilt",
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("records a drive-failed result with reason", () => {
		const { dir, path } = tmpLogPath();
		try {
			recordStage2Gate(
				{ passed: false, reason: "drive-failed", failures: "tracer never reached fixpoint" },
				"/rebuilt/path",
				path,
				{ id: "evt-3", itemId: "BACK-633", pipelineId: "stage2-gate" },
				undefined,
				"2026-07-04T02:00:00.000Z",
			);

			const [event] = queryGateEvents(path);
			expect(event?.gate).toBe("stage2");
			expect(event?.verdict).toBe("fail");
			expect((event?.payload as { reason?: string })?.reason).toBe("drive-failed");
			expect((event?.payload as { rebuiltRepoPath?: string })?.rebuiltRepoPath).toBe("/rebuilt/path");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("records a missing-source result and defaults timestamp to a real ISO string", () => {
		const { dir, path } = tmpLogPath();
		try {
			recordStage2Gate(
				{ passed: false, reason: "missing-source", failures: "missing: src/engine/driver.ts" },
				"/rebuilt/path",
				path,
				{ id: "evt-4", itemId: "BACK-633", pipelineId: "stage2-gate" },
			);

			const [event] = queryGateEvents(path);
			expect((event?.payload as { reason?: string })?.reason).toBe("missing-source");
			expect(event?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
