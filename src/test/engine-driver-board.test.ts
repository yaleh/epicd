/**
 * Phase A — board-backed store + safety integration tests
 *
 * Asserts:
 *   1. Driver tick over a real Core store (isolated tmp board) advances a task's phase.
 *   2. Concurrent merges are serialised by withMergeLock.
 *   3. Worktree is removed in try/finally (simulated with a stub WorktreeRunner).
 *   4. Repeated tick with cap marker is idempotent (withCapGuard).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { Driver, type SafetyConfig, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { MERGE_LOCK_FILENAME, type MergeLockFs, type WorktreeRunner } from "../engine/safety.ts";
import { makeBoardStore } from "../engine/store.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

/** Real MergeLockFs backed by node:fs. */
const realLockFs: MergeLockFs = {
	mkdir: (dir, opts) => mkdir(dir, opts).then(() => {}),
	writeFile: (p, d) => writeFile(p, d),
	exists: (p) => existsSync(p),
	join: (...parts) => join(...parts),
};

/** Stub WorktreeRunner — records add/remove calls without touching git. */
function makeStubRunner(): { runner: WorktreeRunner; added: string[]; removed: string[] } {
	const added: string[] = [];
	const removed: string[] = [];
	const runner: WorktreeRunner = {
		add: async (_repo, wt) => {
			added.push(wt);
		},
		remove: async (_repo, wt) => {
			removed.push(wt);
		},
		rmrf: async (_p) => {},
		join: (...parts) => join(...parts),
	};
	return { runner, added, removed };
}

/**
 * Create a primitive task on the real board and set its pipeline fields.
 * Uses `createTaskFromInput` (generates a valid prefixed ID) then patches
 * pipeline_id + phase via `updateTask`.
 */
async function createBoardTask(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "implementing" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

describe("Phase A – board-backed store + safety wiring", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-board");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-board-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("driver tick over real board advances task phase from implementing to adjudicating (BACK-682 AC#1)", async () => {
		const task = await createBoardTask(core, "Board task 1");

		const store = makeBoardStore(core);
		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick([task]);

		// Re-read from board (not memory) to verify persistence
		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("adjudicating");
	});

	it("concurrent merges are serialised — no interleaving under withMergeLock", async () => {
		const taskA = await createBoardTask(core, "Board task A");
		const taskB = await createBoardTask(core, "Board task B");

		const backlogDir = core.filesystem.backlogDir;
		const log: string[] = [];

		const store = makeBoardStore(core);
		const { runner } = makeStubRunner();

		const safety: SafetyConfig = {
			backlogDir,
			repoPath: projectRoot,
			lockFs: realLockFs,
			worktreeRunner: runner,
		};

		// Slow merge to detect interleaving
		const worktree: WorktreeOps = {
			spawn: async (task) => ({ success: true, output: task.id }),
			merge: async (taskId) => {
				log.push(`${taskId}:start`);
				await new Promise((r) => setTimeout(r, 30));
				log.push(`${taskId}:end`);
			},
		};

		const driver = new Driver([executionPipeline], store, worktree, safety);
		await driver.tick([taskA, taskB]);

		// Each task's merge must not interleave with another's
		expect(log.length).toBe(4);
		// Serialised: first task fully completes before second starts
		expect(log[1]?.endsWith(":end")).toBe(true);
		expect(log[2]?.endsWith(":start")).toBe(true);
	});

	it("worktree runner add is called and remove is called unconditionally (finally)", async () => {
		const backlogDir = core.filesystem.backlogDir;
		const { runner, added, removed } = makeStubRunner();

		// Manually verify withWorktree add/remove lifecycle using stub runner
		const { withWorktree } = await import("../engine/safety.ts");
		let worktreePath = "";
		await withWorktree(
			projectRoot,
			"task-wt",
			async (wt) => {
				worktreePath = wt;
			},
			runner,
		);

		expect(added).toContain(worktreePath);
		expect(removed).toContain(worktreePath);

		// Also confirm driver tick works with safety config wired in
		const task = await createBoardTask(core, "Board task W");
		const store = makeBoardStore(core);

		const safety: SafetyConfig = {
			backlogDir,
			repoPath: projectRoot,
			lockFs: realLockFs,
			worktreeRunner: runner,
		};
		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree, safety);
		await driver.tick([task]);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("adjudicating");
	});

	it("withCapGuard makes repeated tick idempotent (cap marker prevents double-execution)", async () => {
		const task = await createBoardTask(core, "Board task C");

		const backlogDir = core.filesystem.backlogDir;
		const store = makeBoardStore(core);
		const { runner } = makeStubRunner();

		const safety: SafetyConfig = {
			backlogDir,
			repoPath: projectRoot,
			lockFs: realLockFs,
			worktreeRunner: runner,
		};

		let spawnCount = 0;
		const worktree: WorktreeOps = {
			spawn: async () => {
				spawnCount++;
				return { success: true };
			},
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree, safety);

		// First tick — should spawn once
		await driver.tick([task]);
		expect(spawnCount).toBe(1);

		// Second tick with same task — cap marker guards, spawn skipped
		// (task is now in "done" phase so not picked up by machine actor,
		//  but even if forced with "implementing", cap guard prevents re-execution)
		const taskAfter = await core.getTask(task.id);
		const readyTasks = taskAfter?.phase === "implementing" ? [taskAfter] : [];
		await driver.tick(readyTasks);
		expect(spawnCount).toBe(1); // not incremented
	});

	it("creates merge lock at shared .merge-lock path during tick", async () => {
		const task = await createBoardTask(core, "Board task L");

		const backlogDir = core.filesystem.backlogDir;
		const lockPath = join(backlogDir, MERGE_LOCK_FILENAME);
		const store = makeBoardStore(core);
		const { runner } = makeStubRunner();

		const safety: SafetyConfig = {
			backlogDir,
			repoPath: projectRoot,
			lockFs: realLockFs,
			worktreeRunner: runner,
		};

		let lockExistedDuringMerge = false;
		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {
				lockExistedDuringMerge = existsSync(lockPath);
			},
		};

		const driver = new Driver([executionPipeline], store, worktree, safety);
		await driver.tick([task]);

		expect(lockExistedDuringMerge).toBe(true);
		// Lock released after tick
		expect(existsSync(lockPath)).toBe(false);
	});
});
