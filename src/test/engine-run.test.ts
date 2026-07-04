/**
 * Phase C — run entry point + guard + end-to-end tests
 *
 * Asserts:
 *   1. runEngine() ticks to fixpoint (no pending machine-phase tasks remain).
 *   2. Single-active-driver guard: throws when .active-agents file exists.
 *   3. E2E: a primitive task in "ready" reaches "done" via stub spawn.
 *   4. runEngine() is idempotent: second call with no pending work does 0 ticks.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import type { WorktreeOps } from "../engine/driver.ts";
import { ACTIVE_AGENTS_FILE, isDriverActive, runEngine } from "../engine/run.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

/**
 * Create a primitive task on the real board with pipeline fields set.
 * Uses the valid default status so `createTaskFromInput` doesn't reject it,
 * then patches pipeline_id + phase via `updateTask`.
 */
async function createBoardTask(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "ready" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

const stubWorktree: WorktreeOps = {
	spawn: async () => ({ success: true }),
	merge: async () => {},
};

const failingWorktree: WorktreeOps = {
	spawn: async () => ({ success: false, error: "agent crashed" }),
	merge: async () => {},
};

describe("isDriverActive", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = createUniqueTestDir("run-guard");
		await mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("returns false when .active-agents does not exist", () => {
		expect(isDriverActive(tmpDir)).toBe(false);
	});

	it("returns true when .active-agents file exists", async () => {
		await writeFile(join(tmpDir, ACTIVE_AGENTS_FILE), "pid:12345");
		expect(isDriverActive(tmpDir)).toBe(true);
	});
});

describe("runEngine – fixpoint loop", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-run");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-run-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("returns 0 ticks when there are no engine tasks", async () => {
		const result = await runEngine(core, stubWorktree);
		expect(result.ticks).toBe(0);
	});

	it("single-active-driver guard: throws when .active-agents exists", async () => {
		const backlogDir = core.filesystem.backlogDir;
		await writeFile(join(backlogDir, ACTIVE_AGENTS_FILE), "pid:99");

		await expect(runEngine(core, stubWorktree)).rejects.toThrow("Single-active-driver guard");
	});

	it("E2E: primitive task ready → done (stub spawn)", async () => {
		const task = await createBoardTask(core, "E2E task 1");

		const result = await runEngine(core, stubWorktree);
		expect(result.ticks).toBeGreaterThan(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("done");
	});

	it("E2E: primitive task ready → needs-human (failing spawn)", async () => {
		const task = await createBoardTask(core, "E2E task 2");

		const result = await runEngine(core, failingWorktree);
		expect(result.ticks).toBeGreaterThan(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("needs-human");
	});

	it("ticks multiple tasks to fixpoint in one run", async () => {
		const [taskA, taskB, taskC] = await Promise.all([
			createBoardTask(core, "E2E task A"),
			createBoardTask(core, "E2E task B"),
			createBoardTask(core, "E2E task C"),
		]);

		const result = await runEngine(core, stubWorktree);
		expect(result.ticks).toBeGreaterThan(0);

		for (const task of [taskA, taskB, taskC]) {
			const updated = await core.getTask(task.id);
			expect(updated?.phase).toBe("done");
		}
	});

	it("second call with no pending work does 0 ticks (idempotent)", async () => {
		await createBoardTask(core, "Idempotent task 1");

		// First run drives to done
		await runEngine(core, stubWorktree);

		// Second run — nothing machine-pending
		const result = await runEngine(core, stubWorktree);
		expect(result.ticks).toBe(0);
	});

	it("respects maxTicks limit and stops", async () => {
		await createBoardTask(core, "MaxTick task");

		const tickCounts: number[] = [];
		const result = await runEngine(core, stubWorktree, {
			maxTicks: 5,
			onTick: (t) => tickCounts.push(t),
		});

		expect(result.ticks).toBeLessThanOrEqual(5);
		expect(tickCounts.length).toBe(result.ticks);
	});

	it("onTick callback is called for each tick with monotonically increasing count", async () => {
		await createBoardTask(core, "Tick callback task 1");
		await createBoardTask(core, "Tick callback task 2");

		const tickCounts: number[] = [];
		await runEngine(core, stubWorktree, {
			onTick: (t) => tickCounts.push(t),
		});

		expect(tickCounts.length).toBeGreaterThan(0);
		for (let i = 0; i < tickCounts.length; i++) {
			expect(tickCounts[i]).toBe(i + 1);
		}
	});
});
