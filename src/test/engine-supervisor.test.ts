/**
 * epicd supervisor (BACK-628.2): the execution-lane replacement for baime's
 * Monitor+scan-loop.cjs. Proves ENG-1/ENG-4 (dispatch cap idempotency, safe
 * across a simulated restart) and ENG-6 (field-identity single instance).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { acquireFieldLock, supervisorTick } from "../engine/supervisor.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

const testFs = {
	mkdir: (dir: string, options: { recursive: true }) => mkdir(dir, options).then(() => {}),
	writeFile: (path: string, data: string) => Bun.write(path, data).then(() => {}),
	exists: (path: string) => existsSync(path),
	join: (...parts: string[]) => join(...parts),
};

describe("supervisorTick", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-supervisor-tick");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-supervisor-tick-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("dispatches each ready task once, persisting a cap marker before emitting", async () => {
		const { task } = await core.createTaskFromInput({ title: "Ready task", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "ready" } as Task, false);

		const spawned: string[] = [];
		const dispatched = await supervisorTick(core, projectRoot, async (taskId, payload) => {
			expect(payload).toContain(`basic-ready:${taskId}`);
			spawned.push(taskId);
		});

		expect(dispatched).toEqual([task.id]);
		expect(spawned).toEqual([task.id]);

		const reloaded = await core.getTask(task.id);
		expect(reloaded?.cap?.some((m) => (m as Record<string, unknown>).phase === "ready-dispatched")).toBe(true);
	});

	it("does not re-dispatch a task already carrying the dispatch cap marker (ENG-1/ENG-4 restart safety)", async () => {
		const { task } = await core.createTaskFromInput({ title: "Ready task", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "ready" } as Task, false);

		const firstSpawns: string[] = [];
		await supervisorTick(core, projectRoot, async (taskId) => {
			firstSpawns.push(taskId);
		});
		expect(firstSpawns).toEqual([task.id]);

		// Simulate a supervisor restart: a fresh tick against the same on-disk
		// state (task is still "ready" — the agent hasn't completed it yet).
		const secondSpawns: string[] = [];
		const secondDispatched = await supervisorTick(core, projectRoot, async (taskId) => {
			secondSpawns.push(taskId);
		});

		expect(secondDispatched).toEqual([]);
		expect(secondSpawns).toEqual([]);
	});

	it("dispatches a new ready task while skipping an already-dispatched one", async () => {
		const { task: a } = await core.createTaskFromInput({ title: "A", status: "To Do" }, false);
		await core.updateTask({ ...a, pipeline_id: "execution", phase: "ready" } as Task, false);
		await supervisorTick(core, projectRoot, async () => {});

		const { task: b } = await core.createTaskFromInput({ title: "B", status: "To Do" }, false);
		await core.updateTask({ ...b, pipeline_id: "execution", phase: "ready" } as Task, false);

		const dispatched = await supervisorTick(core, projectRoot, async () => {});
		expect(dispatched).toEqual([b.id]);
	});

	it("does not dispatch a task that is not in the ready phase", async () => {
		const { task } = await core.createTaskFromInput({ title: "Not ready", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "done" } as Task, false);

		const dispatched = await supervisorTick(core, projectRoot, async () => {});
		expect(dispatched).toEqual([]);
	});
});

describe("acquireFieldLock", () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-supervisor-lock");
		await mkdir(projectRoot, { recursive: true });
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("a second supervisor for the same field fails fast (ENG-6 single instance)", async () => {
		const release = await acquireFieldLock(projectRoot, "execution", testFs);

		await expect(acquireFieldLock(projectRoot, "execution", testFs)).rejects.toThrow();

		await release();
	});

	it("a different pipeline_id (field) does not conflict — fields don't cross-reap (ENG-6)", async () => {
		const releaseExecution = await acquireFieldLock(projectRoot, "execution", testFs);
		const releaseAuthoring = await acquireFieldLock(projectRoot, "authoring", testFs);

		await releaseExecution();
		await releaseAuthoring();
	});

	it("releasing the lock allows a subsequent instance to acquire it", async () => {
		const release = await acquireFieldLock(projectRoot, "execution", testFs);
		await release();

		const releaseAgain = await acquireFieldLock(projectRoot, "execution", testFs);
		await releaseAgain();
	});
});

describe("engine supervisor — CLI end-to-end (BACK-628.2)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-supervisor-cli");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-supervisor-cli-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("ticks once and exits cleanly when there is nothing to dispatch", () => {
		const out = execFileSync("bun", [CLI_PATH, "engine", "supervisor", "--once"], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		expect(out.trim()).toBe("");
	});

	// Transport-only (BACK-605.8 Phase D): a ready task's payload is printed for
	// an in-session Agent tool call to consume — this command never spawns a
	// `claude` subprocess itself.
	it("prints the self-contained dispatch payload for a ready task instead of spawning anything", async () => {
		const { task } = await core.createTaskFromInput({ title: "Ready task", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "ready" } as Task, false);

		const out = execFileSync("bun", [CLI_PATH, "engine", "supervisor", "--once"], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		expect(out).toContain(`basic-ready:${task.id}`);
		expect(out).toContain("---EVENT---");
	});

	it("refuses a second instance for the same field while the lock is held (ENG-6)", async () => {
		const release = await acquireFieldLock(core.filesystem.backlogDir, "execution", testFs);
		try {
			expect(() =>
				execFileSync("bun", [CLI_PATH, "engine", "supervisor", "--once"], {
					cwd: projectRoot,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				}),
			).toThrow();
		} finally {
			await release();
		}
	});
});
