/**
 * BACK-686.2 Phase C (AC#4) — `execution/adjudicating` becomes a gate: a
 * mechanical gate-script (`gateAdjudicating`, `src/engine/adjudicate-gate.ts`)
 * runs first. The "light" path (risk-scaled `auditDepthFor` says "light" AND AC
 * checkboxes all-checked AND DoD checkboxes all-checked) resolves straight to
 * `done` with NO dispatch/spawn recorded (no `adjudicateHandler` call). The
 * "full" path (touches src/engine|src/security, or an `area:engine`/`area:security`
 * label, or an unchecked AC/DoD item) dispatches exactly one call to the
 * `adjudicate` skill handler.
 *
 * `adjudicate.ts`'s existing `adjudicate()` (ENG-8 mechanical DoD verdict) and
 * `complete.ts`'s `completeTask`/`completeAdjudication` are unchanged (AC#9) —
 * `gateAdjudicating` sits strictly after DoD verdict resolution, as an
 * additional decision layer.
 */
import { describe, expect, it } from "bun:test";
import { gateAdjudicating } from "../engine/adjudicate-gate.ts";
import type { TaskStore } from "../engine/complete.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Adjudicating",
		pipeline_id: "execution",
		phase: "adjudicating",
		assignee: [],
		labels: [],
		dependencies: [],
		body: "",
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

describe("gateAdjudicating — pure mechanical gate function (AC#4)", () => {
	it("resolves to done for a light-depth primitive with all AC/DoD checkboxes checked", async () => {
		const task = makeTask({
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
			definitionOfDoneItems: [{ index: 1, text: "tests pass", checked: true }],
		});
		const result = await gateAdjudicating(task, [], [], "/fake/repo");
		expect(result.verdict).toBe("done");
	});

	it("escalates to dispatch-skill when an AC checkbox is unchecked, even at light depth", async () => {
		const task = makeTask({
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: false }],
		});
		const result = await gateAdjudicating(task, [], [], "/fake/repo");
		expect(result.verdict).toBe("dispatch-skill");
	});

	it("escalates to dispatch-skill when a DoD checkbox is unchecked, even at light depth", async () => {
		const task = makeTask({
			definitionOfDoneItems: [{ index: 1, text: "tests pass", checked: false }],
		});
		const result = await gateAdjudicating(task, [], [], "/fake/repo");
		expect(result.verdict).toBe("dispatch-skill");
	});

	it("escalates to dispatch-skill when the diff touches src/engine/** (full audit depth)", async () => {
		const task = makeTask({
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
		});
		const result = await gateAdjudicating(task, [], ["src/engine/driver.ts"], "/fake/repo");
		expect(result.verdict).toBe("dispatch-skill");
	});

	it("escalates to dispatch-skill when the task carries an area:engine label (full audit depth)", async () => {
		const task = makeTask({
			labels: ["area:engine"],
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
		});
		const result = await gateAdjudicating(task, [], [], "/fake/repo");
		expect(result.verdict).toBe("dispatch-skill");
	});

	it("resolves to done for a light task with no AC/DoD items declared at all", async () => {
		const task = makeTask();
		const result = await gateAdjudicating(task, [], [], "/fake/repo");
		expect(result.verdict).toBe("done");
	});
});

describe("Driver.tick — adjudicating gate wiring (AC#4)", () => {
	function driverWith(adjudicateHandlerCalls: { count: number }, task: Task) {
		const { store, all } = makeStore([task]);
		const worktree: WorktreeOps = { spawn: async () => ({ success: true }), merge: async () => {} };
		const driver = new Driver([executionPipeline], store, worktree, undefined, undefined, async () => {
			adjudicateHandlerCalls.count++;
			return { verdict: "done" };
		});
		return { driver, all };
	}

	it("light path: resolves straight to done, with ZERO adjudicateHandler (skill dispatch) calls", async () => {
		const task = makeTask({
			id: "light-1",
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
			definitionOfDoneItems: [{ index: 1, text: "tests pass", checked: true }],
		});
		const adjudicateHandlerCalls = { count: 0 };
		const { driver, all } = driverWith(adjudicateHandlerCalls, task);

		await driver.tick(all());

		expect(all().find((t) => t.id === "light-1")?.phase).toBe("done");
		expect(adjudicateHandlerCalls.count).toBe(0);
	});

	it("full path: an engine-labeled task issues exactly ONE adjudicateHandler (skill dispatch) call", async () => {
		const task = makeTask({
			id: "full-1",
			labels: ["area:engine"],
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: true }],
		});
		const adjudicateHandlerCalls = { count: 0 };
		const { driver, all } = driverWith(adjudicateHandlerCalls, task);

		await driver.tick(all());

		expect(all().find((t) => t.id === "full-1")?.phase).toBe("done");
		expect(adjudicateHandlerCalls.count).toBe(1);
	});

	it("full path: an unchecked AC checkbox issues exactly ONE adjudicateHandler call even at light depth", async () => {
		const task = makeTask({
			id: "full-2",
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: false }],
		});
		const adjudicateHandlerCalls = { count: 0 };
		const { driver, all } = driverWith(adjudicateHandlerCalls, task);

		await driver.tick(all());

		expect(adjudicateHandlerCalls.count).toBe(1);
	});
});
