/**
 * Phase B — `engine complete <id>` CLI tests (BACK-605.8).
 *
 * Thin CLI wrapper over the existing completeTask (ENG-8): re-run DoD in the
 * worktree, merge under lock on pass, route to needs-human on fail/conflict.
 * Exercised at the CLI-process layer (spawns `bun src/cli.ts engine
 * complete ...`), following the same real-git pattern as
 * engine-safety-worktree.test.ts.
 *
 * Asserts:
 *   1. DoD passes → worktree branch is merged into main and phase → done.
 *   2. DoD fails → no merge occurs and phase → needs-human.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

/**
 * Create a primitive task on the real board with pipeline fields + structured
 * executable DoD gates (BACK-613: runDoD re-runs task.dod, not the prose checklist).
 * Pass an empty array to model a task with no machine gate declared.
 */
async function createReadyTaskWithDoD(core: Core, title: string, dodGates: string[]) {
	const { task } = await core.createTaskFromInput({ title, status: "To Do", dodGates }, false);
	const withPipeline = { ...task, pipeline_id: "execution", phase: "implementing" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

/** Create a worktree-like dir with its own `task/<id>` branch containing one commit. */
async function makeTaskBranch(repoDir: string, taskId: string): Promise<string> {
	const branchName = `task/${taskId}`;
	const worktreeDir = join(repoDir, ".worktrees", taskId);
	await mkdir(join(repoDir, ".worktrees"), { recursive: true });
	await $`git -C ${repoDir} worktree add -b ${branchName} ${worktreeDir}`.quiet();
	await writeFile(join(worktreeDir, `${taskId}.txt`), "work done");
	await $`git add ${taskId}.txt`.cwd(worktreeDir).quiet();
	await $`git commit -m "work for ${taskId}"`.cwd(worktreeDir).quiet();
	return worktreeDir;
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

describe("engine complete CLI", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-complete-cli");
		await mkdir(projectRoot, { recursive: true });
		await $`git init -b main`.cwd(projectRoot).quiet();
		await $`git config user.email "test@test.com"`.cwd(projectRoot).quiet();
		await $`git config user.name "Test"`.cwd(projectRoot).quiet();

		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-complete-cli-test");

		// Mirror this project's own .gitignore convention (BACK-616/BACK-621):
		// the merge-lock sentinel is ephemeral, machine-local lock state, not
		// board content — it must never be tracked in board history.
		await writeFile(join(projectRoot, ".gitignore"), "backlog/.merge-lock\nbacklog/.merge-lock-sentinel\n");

		// initializeTestProject writes backlog/ files but does not commit them;
		// commit so the repo has a clean HEAD for worktree/merge operations.
		await $`git add -A`.cwd(projectRoot).quiet();
		await $`git commit -m "init board"`.cwd(projectRoot).quiet();
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("merges the worktree branch and sets phase to adjudicating (not done directly) when DoD passes (BACK-682 AC#1)", async () => {
		const task = await createReadyTaskWithDoD(core, "CLI complete pass", ["true"]);
		const worktreeDir = await makeTaskBranch(projectRoot, task.id);

		const result = await runCli(["engine", "complete", task.id, "--worktree", worktreeDir], projectRoot);

		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("adjudicating");

		// The commit made on the task branch should now be part of main's history.
		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).toContain(`work for ${task.id}`);

		// BACK-616: the post-merge phase write to the board file must itself be
		// committed — no uncommitted changes left under backlog/.
		const status = await $`git -C ${projectRoot} status --porcelain -- backlog`.text();
		expect(status.trim()).toBe("");
	});

	it("does not merge and sets phase to needs-human when DoD fails", async () => {
		const task = await createReadyTaskWithDoD(core, "CLI complete fail", ["false"]);
		const worktreeDir = await makeTaskBranch(projectRoot, task.id);

		const result = await runCli(["engine", "complete", task.id, "--worktree", worktreeDir], projectRoot);

		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("needs-human");

		// The commit made on the task branch must NOT be part of main's history.
		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).not.toContain(`work for ${task.id}`);

		// BACK-616: the phase→needs-human write must be committed too, not just
		// the done path.
		const status = await $`git -C ${projectRoot} status --porcelain -- backlog`.text();
		expect(status.trim()).toBe("");
	});

	it("does not merge and sets phase to needs-human when NO structured dod gate is declared", async () => {
		// BACK-613: a task with no machine gate must not be auto-merged (prose-only DoD
		// is human-facing and never executed). completeTask routes empty gates → needs-human.
		const task = await createReadyTaskWithDoD(core, "CLI complete ungated", []);
		const worktreeDir = await makeTaskBranch(projectRoot, task.id);

		const result = await runCli(["engine", "complete", task.id, "--worktree", worktreeDir], projectRoot);

		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("needs-human");

		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).not.toContain(`work for ${task.id}`);
	});
});
