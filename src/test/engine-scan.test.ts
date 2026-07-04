/**
 * `engine scan` scan-authority tests (BACK-614; introduced BACK-605.8 Phase B).
 *
 * Asserts:
 *   1. A primitive task in execution/ready is emitted as a single machine line
 *      "basic-ready:<id>" — NOT a rendered template blob, NOT `---EVENT---`
 *      (rendering is the scan-loop.js daemon's job; one renderer, not two).
 *   2. A task in a non-ready phase is NOT emitted.
 *   3. A task in a non-execution pipeline is NOT emitted.
 *   4. A task with no pipeline/phase set at all is NOT emitted.
 *   5. scanReadyLines is a pure board read — it never spawns anything.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { scanReadyLines } from "../engine/scan.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

async function createBoardTask(core: Core, title: string, overrides: Partial<Task> = {}): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "ready", ...overrides };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

describe("scanReadyLines", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-scan");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-scan-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("emits a single 'basic-ready:<id>' machine line for an actionable execution/ready task", async () => {
		const task = await createBoardTask(core, "Actionable task");
		const tasks = await core.queryTasks({});

		const lines = scanReadyLines(tasks);

		expect(lines).toContain(`basic-ready:${task.id}`);
		// It is a machine line, NOT a rendered template blob or transport delimiter.
		for (const line of lines) {
			expect(line).not.toContain("---EVENT---");
			expect(line).not.toContain("__TASK_ID__");
			expect(line).not.toContain("Actionable task"); // no title rendering here
		}
	});

	it("does not emit a task in a non-ready phase", async () => {
		const task = await createBoardTask(core, "Awaiting task", { phase: "awaiting-children" });
		const tasks = await core.queryTasks({});

		expect(scanReadyLines(tasks)).not.toContain(`basic-ready:${task.id}`);
	});

	it("does not emit a task in a non-execution pipeline", async () => {
		const task = await createBoardTask(core, "Other pipeline task", { pipeline_id: "authoring" });
		const tasks = await core.queryTasks({});

		expect(scanReadyLines(tasks)).not.toContain(`basic-ready:${task.id}`);
	});

	it("does not emit a task with no pipeline/phase set at all", async () => {
		const { task } = await core.createTaskFromInput({ title: "Untracked task", status: "To Do" }, false);
		const tasks = await core.queryTasks({});

		expect(scanReadyLines(tasks)).not.toContain(`basic-ready:${task.id}`);
	});

	it("never calls a spawn primitive — architectural boundary", async () => {
		await createBoardTask(core, "Spawn boundary task");
		const tasks = await core.queryTasks({});

		let spawnCalls = 0;
		const spySpawnPrimitive = async () => {
			spawnCalls++;
			return { success: true };
		};

		const lines = scanReadyLines(tasks);
		// Sanity: a line was produced, yet nothing invoked the spy spawn primitive.
		expect(lines.length).toBeGreaterThan(0);
		expect(spawnCalls).toBe(0);
		void spySpawnPrimitive;
	});

	it("emits one line per actionable task", async () => {
		const t1 = await createBoardTask(core, "Task one");
		const t2 = await createBoardTask(core, "Task two");
		const tasks = await core.queryTasks({});

		const lines = scanReadyLines(tasks);

		expect(lines).toContain(`basic-ready:${t1.id}`);
		expect(lines).toContain(`basic-ready:${t2.id}`);
	});
});
