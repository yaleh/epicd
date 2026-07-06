/**
 * `engine promote <id>` CLI tests (BACK-623).
 *
 * Human promote gate: exercises the CLI process directly (spawns
 * `bun src/cli.ts engine promote ...`), following the same real-process
 * pattern as engine-complete-cli.test.ts.
 *
 * Asserts:
 *   1. Promoting a "Basic: Backlog" task sets pipeline_id: execution,
 *      phase: ready, status: "Basic: Ready".
 *   2. Promoting an "Epic: Backlog" task sets phase: decomposing, role: compound,
 *      status: "Epic: Decomposing" (BACK-631 — must NOT be phase: ready, which
 *      scan.ts's PHASE_PREFIX would misroute as basic-ready instead of epic-ready).
 *   3. Promoting a task NOT at a Backlog status is rejected (non-zero exit,
 *      task unchanged).
 *   4. A promoted Basic task is reported by `engine scan --once` as `basic-ready:<id>`.
 *   5. A promoted Epic is reported by `engine scan --once` as `epic-ready:<id>`,
 *      never `basic-ready:<id>` (BACK-631).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { roleOf, type Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

/**
 * Create a task then set its `status` directly via updateTask (bypassing
 * createTaskFromInput's canonical-status validation, which only knows the
 * project's default To Do/In Progress/Done vocabulary — not the four-axis
 * Basic/Epic statuses declared in backlog/config.yml).
 */
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

describe("engine promote CLI", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-promote");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-promote-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("promotes a Basic: Backlog task to pipeline_id execution, phase ready, status Ready", async () => {
		const task = await createTaskWithStatus(core, "Backlog task", "Basic: Backlog");

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`engine promote: ${task.id} → execution/ready`);

		const updated = await core.getTask(task.id);
		expect(updated?.pipeline_id).toBe("execution");
		expect(updated?.phase).toBe("ready");
		expect(updated?.status).toBe("Ready");
	});

	it("promotes an Epic: Backlog task to pipeline_id execution, phase decomposing, status Decomposing (BACK-631)", async () => {
		const task = await createTaskWithStatus(core, "Epic backlog task", "Epic: Backlog", ["kind:epic"]);

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`engine promote: ${task.id} → execution/decomposing`);

		const updated = await core.getTask(task.id);
		expect(updated?.pipeline_id).toBe("execution");
		expect(updated?.phase).toBe("decomposing");
		expect(updated && roleOf(updated)).toBe("compound");
		expect(updated?.status).toBe("Decomposing");
	});

	it("promotes an Epic: Backlog task even with no pre-declared role or children (role derives from kind:epic label, BACK-643)", async () => {
		// No `role` field written by promote anymore — roleOf() derives "compound"
		// directly from the kind:epic label for a pre-decompose epic (BACK-643),
		// so promote no longer needs to pre-declare `role: compound` (BACK-631).
		const task = await createTaskWithStatus(core, "Epic with no role/children", "Epic: Backlog", ["kind:epic"]);
		expect(task.role).toBeUndefined();

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.role).toBeUndefined();
		expect(updated && roleOf(updated)).toBe("compound");
		expect(updated?.phase).toBe("decomposing");
	});

	it("rejects promote when status is not a Backlog status, task unchanged", async () => {
		const task = await createTaskWithStatus(core, "Proposal task", "Basic: Proposal");

		const result = await runCli(["engine", "promote", task.id], projectRoot);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("must be at Backlog to promote");

		const unchanged = await core.getTask(task.id);
		expect(unchanged?.status).toBe("Basic: Proposal");
		expect(unchanged?.pipeline_id).toBeUndefined();
		expect(unchanged?.phase).toBeUndefined();
	});

	it("rejects promote for an unknown task id", async () => {
		const result = await runCli(["engine", "promote", "BACK-99999"], projectRoot);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("not found");
	});

	it("a promoted Basic task is reported by engine scan --once as basic-ready:<id>", async () => {
		const task = await createTaskWithStatus(core, "Promote then scan", "Basic: Backlog");

		const promoteResult = await runCli(["engine", "promote", task.id], projectRoot);
		expect(promoteResult.exitCode).toBe(0);

		const scanResult = await runCli(["engine", "scan", "--once"], projectRoot);
		expect(scanResult.exitCode).toBe(0);
		expect(scanResult.stdout).toContain(`basic-ready:${task.id}`);
	});

	it("a promoted Epic is reported by engine scan --once as epic-ready:<id>, never basic-ready (BACK-631 negative control)", async () => {
		const task = await createTaskWithStatus(core, "Promote epic then scan", "Epic: Backlog");

		const promoteResult = await runCli(["engine", "promote", task.id], projectRoot);
		expect(promoteResult.exitCode).toBe(0);

		const scanResult = await runCli(["engine", "scan", "--once"], projectRoot);
		expect(scanResult.exitCode).toBe(0);
		expect(scanResult.stdout).toContain(`epic-ready:${task.id}`);
		expect(scanResult.stdout).not.toContain(`basic-ready:${task.id}`);
	});
});
