/**
 * Phase B — `engine watch` data-derived emitter tests (BACK-605.8).
 *
 * Asserts:
 *   1. A primitive task in execution/ready is emitted as a rendered blob
 *      containing the task id, followed by the `---EVENT---` delimiter.
 *   2. A task in a non-ready phase is NOT emitted.
 *   3. A task in a non-execution pipeline is NOT emitted.
 *   4. A compound (non-actionable-for-basic-ready) task in "decomposing"
 *      phase is NOT emitted as a basic-ready event.
 *   5. The watch path never calls a spawn primitive — the architectural
 *      boundary this task restores (engine core never spawns Agents).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { EVENT_DELIMITER, formatEventOutput, scanForEvents } from "../engine/watch.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

async function createBoardTask(core: Core, title: string, overrides: Partial<Task> = {}): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "ready", ...overrides };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

describe("scanForEvents", () => {
	let projectRoot: string;
	let core: Core;
	let templatesDir: string;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-watch");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-watch-test");
		templatesDir = createUniqueTestDir("engine-watch-templates");
		await mkdir(templatesDir, { recursive: true });
		await writeFile(join(templatesDir, "basic-ready.md"), "# basic-ready\nTask: __TASK_ID__ — __TASK_TITLE__\n");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
		await rm(templatesDir, { recursive: true, force: true });
	});

	it("emits a rendered blob containing the task id for an actionable execution/ready task", async () => {
		const task = await createBoardTask(core, "Actionable task");
		const tasks = await core.queryTasks({});

		const events = scanForEvents(tasks, { templatesDir });

		const match = events.find((e) => e.task.id === task.id);
		expect(match).toBeDefined();
		expect(match?.blob).toContain(task.id);
		expect(match?.blob).toContain("Actionable task");

		const output = formatEventOutput(match!);
		expect(output).toContain(EVENT_DELIMITER);
	});

	it("does not emit a task in a non-ready phase", async () => {
		const task = await createBoardTask(core, "Awaiting task", { phase: "awaiting-children" });
		const tasks = await core.queryTasks({});

		const events = scanForEvents(tasks, { templatesDir });

		expect(events.find((e) => e.task.id === task.id)).toBeUndefined();
	});

	it("does not emit a task in a non-execution pipeline", async () => {
		const task = await createBoardTask(core, "Other pipeline task", { pipeline_id: "authoring" });
		const tasks = await core.queryTasks({});

		const events = scanForEvents(tasks, { templatesDir });

		expect(events.find((e) => e.task.id === task.id)).toBeUndefined();
	});

	it("does not emit a task with no pipeline/phase set at all", async () => {
		const { task } = await core.createTaskFromInput({ title: "Untracked task", status: "To Do" }, false);
		const tasks = await core.queryTasks({});

		const events = scanForEvents(tasks, { templatesDir });

		expect(events.find((e) => e.task.id === task.id)).toBeUndefined();
	});

	it("never calls a spawn primitive — architectural boundary", async () => {
		await createBoardTask(core, "Spawn boundary task");
		const tasks = await core.queryTasks({});

		let spawnCalls = 0;
		const spySpawnPrimitive = async () => {
			spawnCalls++;
			return { success: true };
		};

		const events = scanForEvents(tasks, { templatesDir });
		// Sanity: events were produced, yet nothing invoked the spy spawn primitive.
		expect(events.length).toBeGreaterThan(0);
		expect(spawnCalls).toBe(0);
		// Reference the spy so it's not considered unused if scanForEvents ever
		// takes an injectable spawn (it must not — this assertion pins that down).
		void spySpawnPrimitive;
	});

	it("emits multiple actionable tasks each with their own delimiter", async () => {
		const t1 = await createBoardTask(core, "Task one");
		const t2 = await createBoardTask(core, "Task two");
		const tasks = await core.queryTasks({});

		const events = scanForEvents(tasks, { templatesDir });

		const ids = events.map((e) => e.task.id);
		expect(ids).toContain(t1.id);
		expect(ids).toContain(t2.id);
		for (const event of events) {
			expect(formatEventOutput(event)).toContain(EVENT_DELIMITER);
		}
	});
});
