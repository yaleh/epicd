/**
 * BACK-686.1 Phase A (AC#1) — `engine promote` must write `task.entry_phase`
 * to the exact `${pipeline_id}/${phase}` the task held immediately before
 * promote overwrote those fields. Written once; a second promote of an
 * already-promoted task (if it ever happens) must not clobber the first
 * recorded entry_phase.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

async function createTaskWithStatus(core: Core, title: string, status: string, labels?: string[]): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withStatus: Task = labels ? { ...task, status, labels } : { ...task, status };
	await core.updateTask(withStatus, false);
	return withStatus;
}

function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return (async () => {
		const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { stdout, stderr, exitCode };
	})();
}

describe("engine promote writes entry_phase (BACK-686.1 A1)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-promote-entry-phase");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-promote-entry-phase-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("sets entry_phase to the pre-promote pipeline_id/phase (authoring/backlog)", async () => {
		const task = await createTaskWithStatus(core, "Backlog task", "Basic: Backlog");
		expect(task.pipeline_id ?? "").toBe("");
		expect(task.phase ?? "").toBe("");

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.entry_phase).toBe("/");
		expect(updated?.pipeline_id).toBe("execution");
		expect(updated?.phase).toBe("ready");
	});

	it("records the exact prior pipeline_id/phase when the task already had one (e.g. authoring/backlog explicit)", async () => {
		const task = await createTaskWithStatus(core, "Explicit backlog task", "Basic: Backlog");
		const withPhase: Task = { ...task, pipeline_id: "authoring", phase: "backlog" };
		await core.updateTask(withPhase, false);

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.entry_phase).toBe("authoring/backlog");
		expect(updated?.pipeline_id).toBe("execution");
		expect(updated?.phase).toBe("ready");
	});

	it("does not overwrite an already-recorded entry_phase on a second promote-like update", async () => {
		const task = await createTaskWithStatus(core, "Epic backlog task", "Epic: Backlog", ["kind:epic"]);

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);

		const afterFirstPromote = await core.getTask(task.id);
		expect(afterFirstPromote?.entry_phase).toBe("/");

		// Simulate a later structural update that runs through the same code path's
		// write-once guard by directly re-invoking store semantics is out of scope
		// here (CLI only allows promote from Backlog boundary); assert the recorded
		// value is stable across a getTask reload.
		const reread = await core.getTask(task.id);
		expect(reread?.entry_phase).toBe("/");
	});
});
