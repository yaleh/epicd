import { describe, expect, it } from "bun:test";
import { assertSingleStepRetreat, recordRetreat } from "../engine/retreat.ts";
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

function makeEntry(overrides: Partial<RetreatEntry> = {}): RetreatEntry {
	return {
		ts: new Date().toISOString(),
		from: "execution/adjudicating",
		toPhase: "authoring/refining",
		gapFingerprint: "abc123",
		classification: "spec",
		contract: { keep: [], missing: [{ ac: "AC#1", description: "not implemented" }], wrong: [] },
		...overrides,
	};
}

describe("assertSingleStepRetreat (BACK-682 AC#1/#4)", () => {
	it("throws when called from a phase other than execution/adjudicating", () => {
		const task = makeTask({ phase: "ready" });
		expect(() => assertSingleStepRetreat(task, "authoring/refining")).toThrow(/execution\/adjudicating/);
	});

	it("throws when toPhase does not equal task.entry_phase (cross-level retreat rejected)", () => {
		const task = makeTask({ entry_phase: "authoring/refining" });
		expect(() => assertSingleStepRetreat(task, "authoring/backlog")).toThrow(/entry_phase/);
	});

	it("throws when task has no entry_phase recorded", () => {
		const task = makeTask({ entry_phase: undefined });
		expect(() => assertSingleStepRetreat(task, "authoring/refining")).toThrow();
	});

	it("passes for a legal single-step retreat from adjudicating to entry_phase", () => {
		const task = makeTask({ entry_phase: "authoring/refining" });
		expect(() => assertSingleStepRetreat(task, "authoring/refining")).not.toThrow();
	});
});

describe("recordRetreat — write access restricted to execution/adjudicating (AC#1)", () => {
	it("rejects a retreat entry written from a non-adjudicating phase", () => {
		const task = makeTask({ phase: "ready" });
		expect(() => recordRetreat(task, makeEntry())).toThrow();
	});

	it("rejects when entry.from is not the literal execution/adjudicating key", () => {
		const task = makeTask();
		expect(() => recordRetreat(task, makeEntry({ from: "execution/ready" }))).toThrow(/execution\/adjudicating/);
	});

	it("accepts a legal single-step retreat and appends to retreat_log", () => {
		const task = makeTask();
		const entry = makeEntry();
		const updated = recordRetreat(task, entry);
		expect(updated.phase).toBe("authoring/refining");
		expect(updated.retreat_log).toEqual([entry]);
		expect(updated.gap_history).toEqual([entry.gapFingerprint]);
	});
});
