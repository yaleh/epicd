/**
 * BACK-686.1 Phase A (AC#2) — proves the BACK-682 single-step retreat guard is
 * no longer dead code against a *real* task (backed by an actual on-disk
 * task file via `Core`/`store`, not just an in-memory fixture object as in
 * engine-retreat-guard.test.ts).
 *
 * Flow: promote a real task (authoring/backlog → execution/ready) so
 * `entry_phase` gets recorded by the CLI's `engine promote` (Phase A1), drive
 * it to `execution/adjudicating`, then call `recordRetreat` — it must land
 * the task back on its recorded `entry_phase` with no throw.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { recordRetreat } from "../engine/retreat.ts";
import type { RetreatEntry, Task } from "../types/index.ts";
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

describe("recordRetreat against a real promoted task (BACK-686.1 A1/A2 bridge)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-retreat-real-task");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-retreat-real-task-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("retreats a real task from adjudicating back to its recorded entry_phase with no throw", async () => {
		const task = await createTaskWithStatus(core, "Real retreat task", "Basic: Backlog");
		await core.updateTask({ ...task, pipeline_id: "authoring", phase: "backlog" }, false);

		const promoteResult = await runCli(["engine", "promote", task.id], projectRoot);
		expect(promoteResult.exitCode).toBe(0);

		const promoted = await core.getTask(task.id);
		expect(promoted).not.toBeNull();
		expect(promoted?.entry_phase).toBeTruthy();
		const entryPhase = promoted?.entry_phase as string;

		// Drive the real task into execution/adjudicating, the only phase allowed
		// to author a retreat edge.
		const atAdjudicating: Task = { ...(promoted as Task), phase: "adjudicating" };
		await core.updateTask(atAdjudicating, false);
		const reloaded = await core.getTask(task.id);
		expect(reloaded).not.toBeNull();

		const entry: RetreatEntry = {
			ts: new Date().toISOString(),
			from: "execution/adjudicating",
			toPhase: entryPhase,
			gapFingerprint: "real-task-gap-1",
			classification: "spec",
			contract: { keep: [], missing: [{ ac: "AC#1", description: "not implemented" }], wrong: [] },
		};

		let retreated: Task | undefined;
		expect(() => {
			retreated = recordRetreat(reloaded as Task, entry);
		}).not.toThrow();

		expect(retreated?.phase).toBe(entryPhase);
		await core.updateTask(retreated as Task, false);

		const final = await core.getTask(task.id);
		expect(final?.phase).toBe(entryPhase);
		expect(final?.retreat_log?.length).toBe(1);
		expect(final?.gap_history).toContain("real-task-gap-1");
	});
});
