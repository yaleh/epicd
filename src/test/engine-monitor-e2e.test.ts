/**
 * Phase C — Monitor-hosted e2e: full pipeline closure with fake SpawnPrimitive.
 *
 * Simulates Monitor-hosted engine run loop with injected fake SpawnPrimitive:
 *   Basic:Ready → runEngine → realSpawn → makeWorkerRunner(fake) → completeTask
 *                          → adjudicate → Basic:Done (or needs-human)
 *
 * Asserts:
 *   1. Full pipeline: Basic:Ready → Basic:Done via makeWorkerRunner + fake primitive.
 *   2. Full pipeline: Basic:Ready → needs-human when primitive reports failure.
 *   3. Single-active-driver guard prevents a second driver from starting.
 *   4. Worktree isolation: created and cleaned up for every primitive task.
 *   5. Multiple tasks each reach done independently.
 *
 * Note: True Monitor hosting (Claude Code Monitor tool) and true Claude Code
 * Agent spawn cannot be verified in bun test — these are validated by soak/manual
 * e2e per BACK-605.1 Constraints.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import type { WorktreeOps } from "../engine/driver.ts";
import { ACTIVE_AGENTS_FILE, runEngine } from "../engine/run.ts";
import type { WorktreeRunner } from "../engine/safety.ts";
import { realSpawn } from "../engine/spawn.ts";
import type { SpawnPrimitive } from "../harness/worker-runner.ts";
import { makeWorkerRunner } from "../harness/worker-runner.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

/** Fake WorktreeRunner — tracks worktree lifecycle without touching git. */
function makeFakeWorktreeRunner(): { runner: WorktreeRunner; added: string[]; removed: string[] } {
	const added: string[] = [];
	const removed: string[] = [];
	return {
		runner: {
			add: async (_repo, wt) => {
				added.push(wt);
			},
			remove: async (_repo, wt) => {
				removed.push(wt);
			},
			rmrf: async () => {},
			join: (...parts) => join(...parts),
		},
		added,
		removed,
	};
}

/** Create a primitive task on the real board in phase "ready". */
async function createReadyTask(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "ready" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

/** Build WorktreeOps simulating Monitor-hosted runner with fake spawn primitive. */
function makeMonitorOps(
	spawnPrimitive: SpawnPrimitive,
	projectRoot: string,
	worktreeRunner: WorktreeRunner,
): WorktreeOps {
	const runner = makeWorkerRunner(spawnPrimitive);
	return {
		spawn: (task: Task) => realSpawn(task, projectRoot, runner, worktreeRunner),
		merge: async () => {},
	};
}

describe("Monitor-hosted engine e2e — makeWorkerRunner + fake SpawnPrimitive", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-monitor-e2e");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-monitor-e2e-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("Basic:Ready → done via Monitor-hosted runner (fake primitive)", async () => {
		const task = await createReadyTask(core, "Monitor e2e basic task");
		const { runner: worktreeRunner, added, removed } = makeFakeWorktreeRunner();

		const briefs: string[] = [];
		const fakeSpawn: SpawnPrimitive = async (brief) => {
			briefs.push(brief);
			return { success: true };
		};

		const worktree = makeMonitorOps(fakeSpawn, projectRoot, worktreeRunner);
		const { ticks } = await runEngine(core, worktree);

		expect(ticks).toBeGreaterThan(0);
		expect(briefs.length).toBe(1);
		expect(briefs[0]).toContain(task.id);
		expect(briefs[0]).toContain(task.title);

		// Worktree was created and cleaned up
		expect(added.length).toBe(1);
		expect(removed.length).toBe(1);
		expect(added[0]).toContain(task.id);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("done");
	});

	it("Basic:Ready → needs-human when fake primitive reports failure", async () => {
		const task = await createReadyTask(core, "Monitor e2e failing task");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		const fakeSpawn: SpawnPrimitive = async () => ({ success: false, error: "dod check failed" });
		const worktree = makeMonitorOps(fakeSpawn, projectRoot, worktreeRunner);

		await runEngine(core, worktree);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("needs-human");
	});

	it("single-active-driver guard prevents duplicate engine runs", async () => {
		await createReadyTask(core, "Guard e2e task");
		const backlogDir = core.filesystem.backlogDir;
		await writeFile(join(backlogDir, ACTIVE_AGENTS_FILE), "pid:99999");

		const { runner: worktreeRunner } = makeFakeWorktreeRunner();
		const fakeSpawn: SpawnPrimitive = async () => ({ success: true });
		const worktree = makeMonitorOps(fakeSpawn, projectRoot, worktreeRunner);

		await expect(runEngine(core, worktree)).rejects.toThrow("Single-active-driver guard");
	});

	it("worktree isolation: each task gets its own worktree, cleaned up after", async () => {
		await createReadyTask(core, "Monitor task A");
		await createReadyTask(core, "Monitor task B");

		const { runner: worktreeRunner, added, removed } = makeFakeWorktreeRunner();
		const fakeSpawn: SpawnPrimitive = async () => ({ success: true });
		const worktree = makeMonitorOps(fakeSpawn, projectRoot, worktreeRunner);

		await runEngine(core, worktree);

		// Two primitive tasks → two worktrees created and cleaned up
		expect(added.length).toBe(2);
		expect(removed.length).toBe(2);
	});

	it("multiple tasks each reach done independently", async () => {
		const [taskA, taskB, taskC] = await Promise.all([
			createReadyTask(core, "Monitor parallel A"),
			createReadyTask(core, "Monitor parallel B"),
			createReadyTask(core, "Monitor parallel C"),
		]);

		const { runner: worktreeRunner } = makeFakeWorktreeRunner();
		const fakeSpawn: SpawnPrimitive = async () => ({ success: true });
		const worktree = makeMonitorOps(fakeSpawn, projectRoot, worktreeRunner);

		await runEngine(core, worktree);

		for (const task of [taskA, taskB, taskC]) {
			const updated = await core.getTask(task.id);
			expect(updated?.phase).toBe("done");
		}
	});

	it("engine is sole authority: task phase changes only after runEngine returns", async () => {
		const task = await createReadyTask(core, "Sole-authority e2e task");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();
		const fakeSpawn: SpawnPrimitive = async () => ({ success: true });
		const worktree = makeMonitorOps(fakeSpawn, projectRoot, worktreeRunner);

		const before = await core.getTask(task.id);
		expect(before?.phase).toBe("ready");

		await runEngine(core, worktree);

		const after = await core.getTask(task.id);
		expect(after?.phase).toBe("done");
	});
});
