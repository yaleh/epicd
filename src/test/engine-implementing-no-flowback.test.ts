/**
 * Phase D — BACK-686.3 AC#6: the compound branch's forward path
 * (`implementing -> awaiting-children -> adjudicating`) never re-enters
 * `implementing` directly. The ONLY path back to `implementing` is a guarded
 * single-step retreat (`src/engine/retreat.ts`, child A/BACK-682) targeting
 * `task.entry_phase === "execution/implementing"` — reusing the existing
 * retreat machinery, no new mechanism.
 *
 * This test proves the "decomposition-layer" gap classification specifically
 * (a gap in how a compound task was decomposed, discovered only once its
 * children/aggregation reached `adjudicating`) retreats exactly one step back
 * onto `implementing`, and that the Driver's forward scan never targets
 * `implementing` from `awaiting-children` or `adjudicating` on its own.
 */
import { describe, expect, it } from "bun:test";
import type { AdjudicateHandler } from "../engine/driver.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { assertSingleStepRetreat, gapFingerprint, recordRetreat } from "../engine/retreat.ts";
import type { RetreatContract, Task } from "../types/index.ts";

const contract: RetreatContract = {
	keep: [],
	missing: [{ ac: "AC#3", description: "compound decomposition missed a required deliverable" }],
	wrong: [],
};

function makeTask(phase: string, extra: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Compound task",
		status: "Basic: In Progress",
		pipeline_id: "execution",
		phase,
		filePath: "/fake/task-1.md",
		body: "",
		...extra,
	} as unknown as Task;
}

describe("BACK-686.3 AC#6 — forward-only into adjudicating, guarded single-step retreat back to implementing", () => {
	it("a 'decomposition' classified gap retreats exactly one step from adjudicating to entry_phase execution/implementing", () => {
		const task = makeTask("adjudicating", { entry_phase: "execution/implementing" });
		const fp = gapFingerprint("decomposition", "child AC#3 unreachable as decomposed");
		const entry = {
			ts: new Date().toISOString(),
			from: "execution/adjudicating",
			toPhase: "execution/implementing",
			gapFingerprint: fp,
			classification: "decomposition" as const,
			contract,
		};

		expect(() => assertSingleStepRetreat(task, entry.toPhase)).not.toThrow();
		const updated = recordRetreat(task, entry);

		expect(updated.phase).toBe("execution/implementing");
		expect(updated.retreat_log?.[0]?.classification).toBe("decomposition");
		expect(updated.gap_history).toEqual([fp]);
	});

	it("rejects a 'decomposition' gap retreat attempted from anywhere other than adjudicating (no direct flowback)", () => {
		const task = makeTask("awaiting-children", { entry_phase: "execution/implementing" });
		const fp = gapFingerprint("decomposition", "child AC#3 unreachable as decomposed");
		expect(() =>
			recordRetreat(task, {
				ts: new Date().toISOString(),
				from: "execution/adjudicating",
				toPhase: "execution/implementing",
				gapFingerprint: fp,
				classification: "decomposition",
				contract,
			}),
		).toThrow(/execution\/adjudicating/);
	});

	it("Driver.tick's forward scan never targets 'implementing' from awaiting-children or adjudicating on its own", async () => {
		// awaiting-children is actor:none -> the Driver never dispatches it at all
		// (no handler call, no phase change) until the epic's children all resolve
		// and the mechanical gate (kind:gate, not this Driver) advances it.
		const awaitingChildren = makeTask("awaiting-children");
		let tasks = [awaitingChildren];
		const store = {
			getTask: async (id: string) => tasks.find((t) => t.id === id) ?? null,
			updateTask: async (updated: Task) => {
				tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
			},
		};
		const worktree: WorktreeOps = { spawn: async () => ({ success: true }), merge: async () => {} };
		const adjudicateHandler: AdjudicateHandler = async () => {
			throw new Error("adjudicateHandler should not be called for an awaiting-children (actor:none) task");
		};

		const driver = new Driver([executionPipeline], store, worktree, undefined, undefined, adjudicateHandler);
		await driver.tick(tasks);

		expect(tasks[0]?.phase).toBe("awaiting-children");
	});
});
