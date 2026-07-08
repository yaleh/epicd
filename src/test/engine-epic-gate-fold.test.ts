/**
 * BACK-686.2 Phase D (AC#5) — the epic path is folded into the adjudicating gate:
 * `awaiting-children -> adjudicating(gate) -> done/needs-human`, with no independent
 * `evaluating` phase left in the runtime path. `advanceAwaitingChildrenToAdjudicating`
 * (`src/harness/evaluator.ts`) now targets `adjudicating` directly, and
 * `Driver.tick`'s adjudicating branch (`gateAdjudicating`, `src/engine/adjudicate-gate.ts`)
 * folds in the same IA+child-aggregation logic (`computeEpicVerdict`) that used to run
 * only from the separate `evaluating` phase.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { Driver } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { makeBoardStore } from "../engine/store.ts";
import { advanceAwaitingChildrenToAdjudicating } from "../harness/evaluator.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

async function createTask(core: Core, title: string, overrides: Partial<Task> = {}): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withOverrides: Task = { ...task, pipeline_id: "execution", ...overrides };
	await core.updateTask(withOverrides, false);
	return withOverrides;
}

describe("Epic path folds evaluating's IA+aggregation into the adjudicating gate (BACK-686.2 AC#5)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-epic-gate-fold");
		core = new Core(projectRoot);
		await initializeTestProject(core, "epic-gate-fold-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("a fresh epic with all-terminal children goes awaiting-children -> adjudicating -> done, never visiting evaluating", async () => {
		const epic = await createTask(core, "Epic", { phase: "awaiting-children", subtasks: ["c1", "c2"] });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "done", parent_id: epic.id });

		const advanced = await advanceAwaitingChildrenToAdjudicating(core);
		expect(advanced).toEqual([epic.id]);

		const afterAdvance = await core.getTask(epic.id);
		expect(afterAdvance?.phase).toBe("adjudicating");

		const store = makeBoardStore(core);
		const driver = new Driver([executionPipeline], store, {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		});
		const tasks = await core.queryTasks({});
		await driver.tick(tasks);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("done");
	});

	it("a fresh epic with a needs-human child goes awaiting-children -> adjudicating -> needs-human", async () => {
		const epic = await createTask(core, "Epic", { phase: "awaiting-children", subtasks: ["c1", "c2"] });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "needs-human", parent_id: epic.id });

		await advanceAwaitingChildrenToAdjudicating(core);

		const store = makeBoardStore(core);
		const driver = new Driver([executionPipeline], store, {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		});
		const tasks = await core.queryTasks({});
		await driver.tick(tasks);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});

	it("the epic gate never escalates to a skill dispatch (adjudicateHandler is never called for an epic)", async () => {
		const epic = await createTask(core, "Epic", { phase: "awaiting-children", subtasks: ["c1"] });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });

		await advanceAwaitingChildrenToAdjudicating(core);

		const store = makeBoardStore(core);
		const adjudicateHandlerCalls = { count: 0 };
		const driver = new Driver(
			[executionPipeline],
			store,
			{ spawn: async () => ({ success: true }), merge: async () => {} },
			undefined,
			undefined,
			async () => {
				adjudicateHandlerCalls.count++;
				return { verdict: "done" };
			},
		);
		const tasks = await core.queryTasks({});
		await driver.tick(tasks);

		expect(adjudicateHandlerCalls.count).toBe(0);
		expect((await core.getTask(epic.id))?.phase).toBe("done");
	});
});
