/**
 * Phase E — CI-runnable end-to-end integration test (BACK-605.8).
 *
 * This test proves the real merge-tail machinery works end-to-end on a
 * fabricated board, without spawning a real Claude Code session:
 *
 *   1. Set up a temp git repo + epicd board (same pattern as
 *      engine-complete-cli.test.ts / engine-safety-worktree.test.ts).
 *   2. Create a primitive task in the execution/implementing phase.
 *   3. Run the REAL `plugin/scripts/handle-basic-ready.sh <id>` against the
 *      temp board — this claims the task and creates a real git worktree +
 *      `task/<id>` branch, exactly as the epicd-run skill would.
 *   4. Simulate the Agent: the test itself (not a real Agent) writes one
 *      commit into the created worktree, then writes the
 *      `.agent-done-<id>` sentinel file — the exact contract documented in
 *      templates/basic-ready.md and produced by handle-basic-ready.sh's
 *      `.caps/<id>.signal` capability token.
 *   5. Run the REAL `bun run cli engine complete <id> --worktree <path>`
 *      (Phase B's CLI) and assert the merge-tail's real before/after
 *      contract (see engine-complete-cli.test.ts / src/engine/complete.ts):
 *        - DoD passes -> branch is merged into the board's main and the
 *          task's phase becomes "done".
 *        - DoD fails  -> no merge happens and the task's phase becomes
 *          "needs-human".
 *
 * ---------------------------------------------------------------------
 * EXPLICIT UNTESTABLE GAP (read before touching this file):
 *
 * Nowhere in this test do we simulate an actual Agent(...) tool call. The
 * step where a live Claude Code session spawns a background Agent to do
 * the real implementation work inside the worktree (templates/basic-ready.md
 * Step 2) CANNOT be invoked from a CI test process — the Agent tool only
 * exists inside a running interactive session. This test instead performs
 * that step's *observable side effect* (a commit + the `.agent-done-<id>`
 * sentinel file) directly, which lets us prove every other link in the
 * chain (claim, worktree, sentinel wait/hand-off contract, DoD re-run,
 * merge-under-lock, phase transition) without pretending the Agent-spawn
 * itself is covered.
 *
 * This gap is closed ONLY by the manual-soak DoD item in BACK-605.8's plan
 * (a live session actually running the epicd-run skill against one real
 * "ready" task end-to-end), not by any automation in this file. See the
 * task's Implementation Notes for the manual-soak status recorded against
 * this phase.
 * ---------------------------------------------------------------------
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");
const HANDLE_BASIC_READY_SH = join(process.cwd(), "plugin", "scripts", "handle-basic-ready.sh");

/** Create a primitive execution/implementing task on the real board with one structured DoD gate. */
async function createReadyTaskWithDoD(core: Core, title: string, dodCmd: string) {
	const { task } = await core.createTaskFromInput({ title, status: "To Do", dodGates: [dodCmd] }, false);
	const withPipeline = { ...task, pipeline_id: "execution", phase: "implementing" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
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

/**
 * Run the real handle-basic-ready.sh against `repoDir` for `taskId`.
 * Returns the claimed worktree path, read back from the `.caps/<id>.wt`
 * capability token the script writes (its real, documented output contract).
 */
async function runHandleBasicReady(
	repoDir: string,
	taskId: string,
): Promise<{ worktreeDir: string; signalFile: string }> {
	const proc = Bun.spawn(["bash", HANDLE_BASIC_READY_SH, taskId], {
		cwd: repoDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`handle-basic-ready.sh failed (exit ${exitCode}): stdout=${stdout} stderr=${stderr}`);
	}

	const capsDir = join(repoDir, "backlog", ".caps");
	const worktreeDir = (await readFile(join(capsDir, `${taskId}.wt`), "utf8")).trim();
	const signalFile = (await readFile(join(capsDir, `${taskId}.signal`), "utf8")).trim();
	return { worktreeDir, signalFile };
}

/** Simulate the Agent step: one commit in the worktree + the done sentinel. */
async function simulateAgentDone(worktreeDir: string, signalFile: string, taskId: string): Promise<void> {
	await writeFile(join(worktreeDir, `${taskId}.txt`), "work done by simulated agent");
	await $`git add ${taskId}.txt`.cwd(worktreeDir).quiet();
	await $`git commit -m "work for ${taskId}"`.cwd(worktreeDir).quiet();
	await writeFile(signalFile, "done");
}

describe("epicd-run integration (handle-basic-ready -> simulated agent -> engine complete)", () => {
	let projectRoot: string;
	let core: Core;
	let createdTaskIds: string[];

	beforeEach(async () => {
		createdTaskIds = [];
		projectRoot = createUniqueTestDir("epicd-run-integration");
		await mkdir(projectRoot, { recursive: true });
		// Canonicalize now (e.g. macOS /var -> /private/var) so every path built
		// from projectRoot downstream matches what shell scripts/subprocesses
		// naturally resolve to (they run under the real, non-symlinked path).
		projectRoot = await realpath(projectRoot);
		await $`git init -b main`.cwd(projectRoot).quiet();
		await $`git config user.email "test@test.com"`.cwd(projectRoot).quiet();
		await $`git config user.name "Test"`.cwd(projectRoot).quiet();

		core = new Core(projectRoot);
		await initializeTestProject(core, "epicd-run-integration-test");

		// initializeTestProject writes backlog/ files but does not commit them;
		// commit so the repo has a clean HEAD for worktree/merge operations.
		await $`git add -A`.cwd(projectRoot).quiet();
		await $`git commit -m "init board"`.cwd(projectRoot).quiet();
	});

	afterEach(async () => {
		// handle-basic-ready.sh creates its worktree as a SIBLING of the repo,
		// named "<repoBasename>-<taskId>" (see WT_PATH in the script) — remove
		// the git worktree registration first, then both directories.
		for (const taskId of createdTaskIds) {
			const siblingWorktreeDir = join(projectRoot, "..", `${basename(projectRoot)}-${taskId}`);
			await $`git -C ${projectRoot} worktree remove --force ${siblingWorktreeDir}`.quiet().catch(() => {});
			await rm(siblingWorktreeDir, { recursive: true, force: true }).catch(() => {});
		}
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("happy path: DoD passes -> worktree branch is merged into main and phase becomes adjudicating (BACK-682 AC#1)", async () => {
		const task = await createReadyTaskWithDoD(core, "Integration happy path", "true");
		createdTaskIds.push(task.id);

		const { worktreeDir, signalFile } = await runHandleBasicReady(projectRoot, task.id);
		expect(existsSync(worktreeDir)).toBe(true);
		expect(signalFile).toBe(join(projectRoot, "backlog", `.agent-done-${task.id}`));

		await simulateAgentDone(worktreeDir, signalFile, task.id);
		expect(existsSync(signalFile)).toBe(true);

		const result = await runCli(["engine", "complete", task.id, "--worktree", worktreeDir], projectRoot);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("adjudicating");

		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).toContain(`work for ${task.id}`);
	});

	it("failure path: DoD fails -> no merge happens and phase becomes needs-human", async () => {
		const task = await createReadyTaskWithDoD(core, "Integration failure path", "false");
		createdTaskIds.push(task.id);

		const { worktreeDir, signalFile } = await runHandleBasicReady(projectRoot, task.id);
		await simulateAgentDone(worktreeDir, signalFile, task.id);

		const result = await runCli(["engine", "complete", task.id, "--worktree", worktreeDir], projectRoot);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.phase).toBe("needs-human");

		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).not.toContain(`work for ${task.id}`);
	});
});
