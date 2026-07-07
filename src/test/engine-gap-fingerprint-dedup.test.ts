import { describe, expect, it } from "bun:test";
import { gapFingerprint, isDuplicateGap, recordRetreat } from "../engine/retreat.ts";
import type { RetreatEntry, Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase: "adjudicating",
		entry_phase: "authoring/refining",
		filePath: "/fake/task-1.md",
		body: "",
		...overrides,
	} as unknown as Task;
}

function makeEntry(fp: string, overrides: Partial<RetreatEntry> = {}): RetreatEntry {
	return {
		ts: new Date().toISOString(),
		from: "execution/adjudicating",
		toPhase: "authoring/refining",
		gapFingerprint: fp,
		classification: "spec",
		contract: { keep: [], missing: [{ ac: "AC#1", description: "not implemented" }], wrong: [] },
		...overrides,
	};
}

describe("gapFingerprint (BACK-682 schema #2)", () => {
	it("is deterministic for the same (classification, normalizedFailingCheck)", () => {
		const a = gapFingerprint("spec", "AC#3");
		const b = gapFingerprint("spec", "AC#3");
		expect(a).toBe(b);
	});

	it("normalizes whitespace before hashing", () => {
		const a = gapFingerprint("goal", "bun   test\n\tfoo");
		const b = gapFingerprint("goal", "bun test foo");
		expect(a).toBe(b);
	});

	it("differs across classification or failing check", () => {
		expect(gapFingerprint("spec", "AC#3")).not.toBe(gapFingerprint("decomposition", "AC#3"));
		expect(gapFingerprint("spec", "AC#3")).not.toBe(gapFingerprint("spec", "AC#4"));
	});
});

describe("gap-fingerprint dedup guard (BACK-682 AC#2) — second occurrence forces needs-human", () => {
	it("isDuplicateGap is false the first time a fingerprint appears", () => {
		const task = makeTask();
		expect(isDuplicateGap(task, "fp-1")).toBe(false);
	});

	it("recordRetreat succeeds on the first occurrence of a gap fingerprint", () => {
		const task = makeTask();
		const updated = recordRetreat(task, makeEntry("fp-1"));
		expect(updated.gap_history).toEqual(["fp-1"]);
	});

	it("isDuplicateGap is true once a fingerprint is already in gap_history", () => {
		const task = makeTask({ gap_history: ["fp-1"] });
		expect(isDuplicateGap(task, "fp-1")).toBe(true);
	});

	it("recordRetreat refuses a second retreat for the same gap fingerprint — caller must route to needs-human instead", () => {
		const task = makeTask({ gap_history: ["fp-1"], retreat_log: [makeEntry("fp-1")] });
		expect(() => recordRetreat(task, makeEntry("fp-1"))).toThrow(/already retreated/);
	});
});
