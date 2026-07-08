import { describe, expect, it } from "bun:test";
import { recordRetreat } from "../engine/retreat.ts";
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

/** Unresolved gap count for the latest retreat round: missing + wrong entries in its contract. */
function unresolvedGapCount(task: Task): number {
	const last = task.retreat_log?.at(-1);
	if (!last) return 0;
	return last.contract.missing.length + last.contract.wrong.length;
}

describe("double monotonicity across ≥2 retreat rounds (BACK-682 AC#3)", () => {
	it("unresolved gap count does not increase, and the satisfied-AC (keep) set only grows round over round", () => {
		// Round 1: AC#1 not yet implemented, AC#2/AC#3 already satisfied elsewhere.
		const round1Entry: RetreatEntry = {
			ts: new Date().toISOString(),
			from: "execution/adjudicating",
			toPhase: "authoring/refining",
			gapFingerprint: "fp-round-1",
			classification: "spec",
			contract: {
				keep: ["AC#2", "AC#3"],
				missing: [{ ac: "AC#1", description: "not implemented" }],
				wrong: [],
			},
		};
		let task = makeTask();
		task = recordRetreat(task, round1Entry);
		expect(unresolvedGapCount(task)).toBe(1);
		expect(task.retreat_log?.at(-1)?.contract.keep).toEqual(["AC#2", "AC#3"]);

		// Round 2 (must go through adjudicating again first — simulate re-entry then a
		// second retreat): AC#1 now implemented too (keep grows), one remaining wrong AC.
		task = { ...task, phase: "adjudicating" };
		const round2Entry: RetreatEntry = {
			ts: new Date().toISOString(),
			from: "execution/adjudicating",
			toPhase: "authoring/refining",
			gapFingerprint: "fp-round-2",
			classification: "goal",
			contract: {
				keep: ["AC#1", "AC#2", "AC#3"],
				missing: [],
				wrong: [
					{
						ac: "AC#4",
						description: "implements the wrong interpretation",
						obsoleteBlock: { file: "src/x.ts", lines: "10-20", reason: "misread the AC" },
					},
				],
			},
		};
		task = recordRetreat(task, round2Entry);

		// ① unresolved gap count did not increase (1 -> 1, not 1 -> 2+)
		expect(unresolvedGapCount(task)).toBeLessThanOrEqual(1);
		// ② keep set only grows, never shrinks or drops a previously-satisfied AC
		const round1Keep = new Set(round1Entry.contract.keep);
		const round2Keep = new Set(task.retreat_log?.at(-1)?.contract.keep);
		for (const ac of round1Keep) expect(round2Keep.has(ac)).toBe(true);
		expect(round2Keep.size).toBeGreaterThan(round1Keep.size);

		// Both rounds are preserved in the append-only log — retreat never erases history.
		expect(task.retreat_log?.length).toBe(2);
		expect(task.gap_history).toEqual(["fp-round-1", "fp-round-2"]);
	});
});
