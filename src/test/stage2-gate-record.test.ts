/**
 * Phase C: recordStage2Gate — structured JSON line recorder tests.
 *
 * Verifies that recordStage2Gate writes a well-formed JSON record containing:
 *   gate_type = 'stage2'
 *   passed (boolean)
 *   reason / failures (when present)
 *   rebuiltRepoPath (provenance)
 *   timestamp (injectable)
 */

import { describe, expect, it } from "bun:test";
import { recordStage2Gate, type Stage2GateRecord } from "../harness/stage2-gate.ts";

/** Parse the first recorded line as a Stage2GateRecord (tests assert lines.length first). */
function parseRecord(lines: string[]): Stage2GateRecord {
	return JSON.parse(lines[0] ?? "") as Stage2GateRecord;
}

describe("recordStage2Gate", () => {
	it("records a passing result as structured JSON", () => {
		const lines: string[] = [];
		recordStage2Gate({ passed: true }, "/tmp/rebuilt", (line) => lines.push(line), "2026-07-04T00:00:00.000Z");

		expect(lines).toHaveLength(1);
		const record = parseRecord(lines);
		expect(record.gate_type).toBe("stage2");
		expect(record.passed).toBe(true);
		expect(record.rebuiltRepoPath).toBe("/tmp/rebuilt");
		expect(record.timestamp).toBe("2026-07-04T00:00:00.000Z");
		expect(record.reason).toBeUndefined();
		expect(record.failures).toBeUndefined();
	});

	it("records a suite-failed result with reason and failures excerpt", () => {
		const lines: string[] = [];
		recordStage2Gate(
			{ passed: false, reason: "suite-failed", failures: "1 test failed" },
			"/tmp/rebuilt",
			(line) => lines.push(line),
			"2026-07-04T01:00:00.000Z",
		);

		const record = parseRecord(lines);
		expect(record.passed).toBe(false);
		expect(record.reason).toBe("suite-failed");
		expect(record.failures).toBe("1 test failed");
	});

	it("records a drive-failed result with reason", () => {
		const lines: string[] = [];
		recordStage2Gate(
			{ passed: false, reason: "drive-failed", failures: "tracer never reached fixpoint" },
			"/rebuilt/path",
			(line) => lines.push(line),
			"2026-07-04T02:00:00.000Z",
		);

		const record = parseRecord(lines);
		expect(record.gate_type).toBe("stage2");
		expect(record.passed).toBe(false);
		expect(record.reason).toBe("drive-failed");
		expect(record.rebuiltRepoPath).toBe("/rebuilt/path");
	});

	it("records a missing-source result", () => {
		const lines: string[] = [];
		recordStage2Gate(
			{ passed: false, reason: "missing-source", failures: "missing: src/engine/driver.ts" },
			"/rebuilt/path",
			(line) => lines.push(line),
		);

		const record = parseRecord(lines);
		expect(record.reason).toBe("missing-source");
		// timestamp defaults to a real ISO string when not injected
		expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});
