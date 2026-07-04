/**
 * Phase B — engine run with injected WorkerRunner (no stub).
 *
 * Asserts:
 *   1. runEngine drives a Basic:Ready task to done when backed by
 *      makeWorkerRunner + a fake SpawnPrimitive.
 *   2. The fake SpawnPrimitive receives a brief containing task details.
 *   3. runEngine drives a task to needs-human when SpawnPrimitive returns failure.
 *   4. CLI source no longer contains the success:true stub constant.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import type { WorktreeOps } from "../engine/driver.ts";
import { runEngine } from "../engine/run.ts";
import type { WorktreeRunner } from "../engine/safety.ts";
import { realSpawn } from "../engine/spawn.ts";
import type { SpawnPrimitive } from "../harness/worker-runner.ts";
import { makeWorkerRunner } from "../harness/worker-runner.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

/** Fake WorktreeRunner — no git operations. */
function makeFakeWorktreeRunner(): WorktreeRunner {
	return {
		add: async () => {},
		remove: async () => {},
		rmrf: async () => {},
		join: (...parts) => join(...parts),
	};
}

/** Create a primitive task on the real board in phase "ready". */
async function createReadyTask(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "ready" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

/** Build WorktreeOps using makeWorkerRunner + fake primitives. */
function makeWorktreeOps(spawnPrimitive: SpawnPrimitive, projectRoot: string): WorktreeOps {
	const worktreeRunner = makeFakeWorktreeRunner();
	const runner = makeWorkerRunner(spawnPrimitive);
	return {
		spawn: (task: Task) => realSpawn(task, projectRoot, runner, worktreeRunner),
		merge: async () => {},
	};
}

describe("engine run — makeWorkerRunner integration", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-run-runner");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-run-runner-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("drives Basic:Ready → done with makeWorkerRunner(fakeSpawnPrimitive)", async () => {
		const task = await createReadyTask(core, "Run-runner basic task");
		const briefs: string[] = [];

		const fakeSpawn: SpawnPrimitive = async (brief) => {
			briefs.push(brief);
			return { success: true };
		};

		const worktree = makeWorktreeOps(fakeSpawn, projectRoot);
		const { ticks } = await runEngine(core, worktree);

		expect(ticks).toBeGreaterThan(0);
		expect(briefs.length).toBeGreaterThan(0);
		expect(briefs[0]).toContain(task.id);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("done");
	});

	it("brief sent to SpawnPrimitive contains task title", async () => {
		await createReadyTask(core, "Unique task title for runner");
		const briefs: string[] = [];

		const fakeSpawn: SpawnPrimitive = async (brief) => {
			briefs.push(brief);
			return { success: true };
		};

		await runEngine(core, makeWorktreeOps(fakeSpawn, projectRoot));

		expect(briefs.length).toBeGreaterThan(0);
		expect(briefs[0]).toContain("Unique task title for runner");
	});

	it("drives Basic:Ready → needs-human when SpawnPrimitive reports failure", async () => {
		const task = await createReadyTask(core, "Failing runner task");

		const fakeSpawn: SpawnPrimitive = async () => ({ success: false, error: "dod check failed" });
		const worktree = makeWorktreeOps(fakeSpawn, projectRoot);

		await runEngine(core, worktree);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("needs-human");
	});

	it("multiple tasks each receive a separate brief", async () => {
		await createReadyTask(core, "Task Alpha");
		await createReadyTask(core, "Task Beta");

		const briefs: string[] = [];
		const fakeSpawn: SpawnPrimitive = async (brief) => {
			briefs.push(brief);
			return { success: true };
		};

		await runEngine(core, makeWorktreeOps(fakeSpawn, projectRoot));
		expect(briefs.length).toBe(2);
	});
});

describe("CLI source — stub removed", () => {
	it("src/cli.ts no longer contains success: true as const stub", async () => {
		const cliPath = join(import.meta.dir, "../cli.ts");
		const content = await readFile(cliPath, "utf-8");
		expect(content).not.toContain("success: true as const");
	});

	// Note (BACK-605.8 Phase D): the old `engine run` CLI command — which wired
	// makeWorkerRunner to the claude-subprocess spawn primitive — has been retired.
	// The engine no longer spawns agents itself (see `engine watch` + the epicd-run
	// skill + `engine complete`), so cli.ts no longer imports makeWorkerRunner. The
	// assertion that it did has been removed; makeWorkerRunner itself still exists
	// and is exercised directly by this file's tests above.
});
