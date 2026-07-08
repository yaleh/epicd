/**
 * `engine promote <id>` CLI tests (BACK-623).
 *
 * Human promote gate: exercises the CLI process directly (spawns
 * `bun src/cli.ts engine promote ...`), following the same real-process
 * pattern as engine-complete-cli.test.ts.
 *
 * Asserts (BACK-686.3: promote de-forks — every promote lands on
 * `execution/implementing` regardless of `kind:epic`; the leaf-vs-compound
 * decompose decision is now a runtime branch inside `implementing`'s skill,
 * not a promote-time fork):
 *   1. Promoting a "Basic: Backlog" task sets pipeline_id: execution,
 *      phase: implementing, status: "Implementing".
 *   2. Promoting an "Epic: Backlog" task ALSO sets phase: implementing (role still
 *      derives to "compound" via roleOf() from the kind:epic label — that label is
 *      now only a hint consumed by the implementing skill, not a promote-time gate).
 *   3. Promoting a task NOT at a Backlog status is rejected (non-zero exit,
 *      task unchanged).
 *   4. A promoted task (Basic or Epic-labeled) is reported by `engine scan --once`
 *      as `basic-ready:<id>` — there is only one dispatch channel for `implementing`.
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

	it("promotes a Basic: Backlog task to pipeline_id execution, phase implementing, status Implementing", async () => {
		const task = await createTaskWithStatus(core, "Backlog task", "Basic: Backlog");

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`engine promote: ${task.id} → execution/implementing`);

		const updated = await core.getTask(task.id);
		expect(updated?.pipeline_id).toBe("execution");
		expect(updated?.phase).toBe("implementing");
		expect(updated?.status).toBe("Implementing");
	});

	it("promotes an Epic: Backlog task to pipeline_id execution, phase implementing too (de-forked, BACK-686.3 AC#2)", async () => {
		const task = await createTaskWithStatus(core, "Epic backlog task", "Epic: Backlog", ["kind:epic"]);

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`engine promote: ${task.id} → execution/implementing`);

		const updated = await core.getTask(task.id);
		expect(updated?.pipeline_id).toBe("execution");
		expect(updated?.phase).toBe("implementing");
		expect(updated && roleOf(updated)).toBe("compound");
		expect(updated?.status).toBe("Implementing");
	});

	it("promotes an Epic: Backlog task even with no children (role derives from kind:epic label, BACK-643) — still lands on implementing", async () => {
		// There is no `role` field to write or pre-declare anymore (BACK-664.2) —
		// roleOf() derives "compound" directly from the kind:epic label for a
		// pre-decompose epic (BACK-643), so promote never needs a stored role (BACK-631).
		// BACK-686.3: promote no longer reads kind:epic at all — this only proves roleOf()
		// still resolves "compound" for display/has-children purposes downstream.
		const task = await createTaskWithStatus(core, "Epic with no children", "Epic: Backlog", ["kind:epic"]);

		const result = await runCli(["engine", "promote", task.id], projectRoot);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated && roleOf(updated)).toBe("compound");
		expect(updated?.phase).toBe("implementing");
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

	it("a promoted Epic is reported by engine scan --once as basic-ready:<id> too — one dispatch channel for implementing (BACK-686.3, was BACK-631's epic-ready negative control)", async () => {
		const task = await createTaskWithStatus(core, "Promote epic then scan", "Epic: Backlog", ["kind:epic"]);

		const promoteResult = await runCli(["engine", "promote", task.id], projectRoot);
		expect(promoteResult.exitCode).toBe(0);

		const scanResult = await runCli(["engine", "scan", "--once"], projectRoot);
		expect(scanResult.exitCode).toBe(0);
		expect(scanResult.stdout).toContain(`basic-ready:${task.id}`);
	});
});
