/**
 * BACK-686.2 Phase E (AC#6) — `scan`/`hasPendingWork`/`dispatch` read the phase's
 * declared `kind` (`plugin/skills/phase-coverage.json`, `kindForPhase`), not just
 * its `actor`. `actor === "machine"` gating in `scan.ts`/`run.ts` is unchanged
 * (AC#8) — a `kind:gate` phase is still `actor: "machine"` and still reports as
 * pending work. `kind` only decides whether `Driver.tick`'s dispatch ever calls a
 * spawn-costing handler (`adjudicateHandler`/`decompose`/`worktree.spawn`) for that
 * phase: `kind:skill` (implementing) always does; `kind:gate` (adjudicating) does
 * only on its non-trivial ("full") path.
 *
 * BACK-686.3: `execution/ready`/`execution/decomposing` unify into
 * `execution/implementing` (kind:skill); `execution/evaluating` (kind:script) is
 * fully retired — its former "never spawns a session" scenario has no phase left
 * to exercise it (see `src/test/engine-epic-gate-fold.test.ts` for the epic
 * aggregation behavior it used to cover, now folded into the adjudicating gate).
 */
import { describe, expect, it } from "bun:test";
import type { TaskStore } from "../engine/complete.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { hasPendingWork } from "../engine/run.ts";
import { kindForPhase } from "../engine/skill-registry.ts";
import type { Task } from "../types/index.ts";

const repoRoot = process.cwd();

function makeTask(overrides: Partial<Task>): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: In Progress",
		pipeline_id: "execution",
		body: "",
		assignee: [],
		labels: [],
		dependencies: [],
		...overrides,
	} as unknown as Task;
}

function makeStore(initial: Task[]): { store: TaskStore; all: () => Task[] } {
	let tasks = [...initial];
	return {
		store: {
			getTask: async (id) => tasks.find((t) => t.id === id) ?? null,
			updateTask: async (updated) => {
				tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
			},
		},
		all: () => tasks,
	};
}

describe("kindForPhase (real manifest) — implementing=skill, adjudicating=gate", () => {
	it("resolves each phase's kind from plugin/skills/phase-coverage.json", () => {
		expect(kindForPhase(repoRoot, "execution/implementing")).toBe("skill");
		expect(kindForPhase(repoRoot, "execution/adjudicating")).toBe("gate");
	});
});

describe("scan/hasPendingWork — actor gating unchanged (AC#8)", () => {
	it("hasPendingWork reports true for an implementing (kind:skill) task", () => {
		const task = makeTask({ id: "task-1", phase: "implementing" });
		expect(hasPendingWork([task], [executionPipeline])).toBe(true);
	});

	it("hasPendingWork reports true for an adjudicating (kind:gate) task", () => {
		const task = makeTask({ id: "task-1", phase: "adjudicating" });
		expect(hasPendingWork([task], [executionPipeline])).toBe(true);
	});
});

describe("Driver.tick dispatch — spawn cost is decided by kind, not phase-name matching (AC#6)", () => {
	it("kind:skill (implementing) compound task: always calls the injected decompose handler", async () => {
		const epic = makeTask({ id: "epic-2", phase: "implementing", labels: ["kind:epic"] });
		const { store, all } = makeStore([epic]);
		const worktree: WorktreeOps = { spawn: async () => ({ success: true }), merge: async () => {} };

		let decomposeCalls = 0;
		const driver = new Driver([executionPipeline], store, worktree, undefined, async () => {
			decomposeCalls++;
		});
		await driver.tick(all());

		expect(decomposeCalls).toBe(1);
	});

	it("kind:gate (adjudicating) light path: zero adjudicateHandler (skill dispatch) calls", async () => {
		const task = makeTask({
			id: "task-1",
			phase: "adjudicating",
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
			definitionOfDoneItems: [{ index: 1, text: "tests pass", checked: true }],
		});
		const { store, all } = makeStore([task]);
		const worktree: WorktreeOps = { spawn: async () => ({ success: true }), merge: async () => {} };

		let adjudicateCalls = 0;
		const driver = new Driver([executionPipeline], store, worktree, undefined, undefined, async () => {
			adjudicateCalls++;
			return { verdict: "done" };
		});
		await driver.tick(all());

		expect(adjudicateCalls).toBe(0);
		expect(all().find((t) => t.id === "task-1")?.phase).toBe("done");
	});

	it("kind:gate (adjudicating) full path: exactly one adjudicateHandler (skill dispatch) call", async () => {
		const task = makeTask({
			id: "task-1",
			phase: "adjudicating",
			labels: ["area:engine"],
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
		});
		const { store, all } = makeStore([task]);
		const worktree: WorktreeOps = { spawn: async () => ({ success: true }), merge: async () => {} };

		let adjudicateCalls = 0;
		const driver = new Driver([executionPipeline], store, worktree, undefined, undefined, async () => {
			adjudicateCalls++;
			return { verdict: "done" };
		});
		await driver.tick(all());

		expect(adjudicateCalls).toBe(1);
	});
});
