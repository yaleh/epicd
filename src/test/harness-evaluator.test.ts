/**
 * harness/evaluator.ts (BACK-628.4): the compound-phase counterpart to decomposer.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { displayStatus } from "../core/field-registry.ts";
import { advanceAwaitingChildrenToAdjudicating, evaluateEpic } from "../harness/evaluator.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

async function createTask(core: Core, title: string, overrides: Partial<Task> = {}): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withOverrides: Task = { ...task, pipeline_id: "execution", ...overrides };
	await core.updateTask(withOverrides, false);
	return withOverrides;
}

describe("advanceAwaitingChildrenToAdjudicating (BACK-686.2 Phase D, AC#5: was 'ToEvaluating')", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("harness-evaluator-advance");
		core = new Core(projectRoot);
		await initializeTestProject(core, "evaluator-advance-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("advances an awaiting-children epic to adjudicating once all children are terminal", async () => {
		const epic = await createTask(core, "Epic", { phase: "awaiting-children" });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "needs-human", parent_id: epic.id });

		const advanced = await advanceAwaitingChildrenToAdjudicating(core);

		expect(advanced).toEqual([epic.id]);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("adjudicating");
	});

	it("does not advance while any child is still non-terminal", async () => {
		const epic = await createTask(core, "Epic", { phase: "awaiting-children" });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "ready", parent_id: epic.id });

		const advanced = await advanceAwaitingChildrenToAdjudicating(core);

		expect(advanced).toEqual([]);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
	});

	it("does not advance an epic with no children yet", async () => {
		const epic = await createTask(core, "Childless epic", { phase: "awaiting-children" });

		const advanced = await advanceAwaitingChildrenToAdjudicating(core);

		expect(advanced).toEqual([]);
		expect((await core.getTask(epic.id))?.phase).toBe("awaiting-children");
	});
});

describe("evaluateEpic", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("harness-evaluator-eval");
		core = new Core(projectRoot);
		await initializeTestProject(core, "evaluator-eval-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("sets the epic to done when all children are done", async () => {
		const epic = await createTask(core, "Epic", { phase: "evaluating" });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "done", parent_id: epic.id });

		await evaluateEpic(core, epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("done");
		expect(displayStatus(reloaded as Task)).toBe("Done");
	});

	it("sets the epic to needs-human when any child is needs-human", async () => {
		const epic = await createTask(core, "Epic", { phase: "evaluating" });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "needs-human", parent_id: epic.id });

		await evaluateEpic(core, epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
		expect(displayStatus(reloaded as Task)).toBe("Needs Human");
	});

	it("throws for an unknown epic id", async () => {
		await expect(evaluateEpic(core, "TASK-999")).rejects.toThrow("Task not found");
	});
});

describe("evaluateEpic semantics via the tick path (BACK-686.2 AC#10)", () => {
	// BACK-628.4's IA+aggregation semantics (IA red or any child needs-human ->
	// epic needs-human; IA all green + all children done -> epic done) must hold
	// identically when reached through Driver.tick's in-tick `evaluating` branch
	// (src/engine/driver.ts), not only through this file's Core-based CLI path.
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("harness-evaluator-tick");
		core = new Core(projectRoot);
		await initializeTestProject(core, "evaluator-tick-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("Driver.tick resolves an evaluating epic to done when all children are done", async () => {
		const { Driver } = await import("../engine/driver.ts");
		const { executionPipeline } = await import("../engine/pipeline.ts");
		const { makeBoardStore } = await import("../engine/store.ts");

		const epic = await createTask(core, "Epic", { phase: "evaluating", subtasks: ["c1", "c2"] });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "done", parent_id: epic.id });

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

	it("Driver.tick resolves an evaluating epic to needs-human when any child is needs-human", async () => {
		const { Driver } = await import("../engine/driver.ts");
		const { executionPipeline } = await import("../engine/pipeline.ts");
		const { makeBoardStore } = await import("../engine/store.ts");

		const epic = await createTask(core, "Epic", { phase: "evaluating", subtasks: ["c1", "c2"] });
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "needs-human", parent_id: epic.id });

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
});
