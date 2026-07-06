/**
 * BACK-654 — regression tests, Phase A/B.
 *
 * Root cause: complete-task.sh's pre-merge DoD re-verify step awk-scans the
 * rendered "Definition of Done:" PROSE section and executes each prose
 * sentence as a literal shell command via `bash -c`. That prose section is
 * built from `task.definitionOfDoneItems` (human-facing sentences like
 * "bun test (or scoped test) passes") and NEVER reflects the STRUCTURED
 * `task.dod[].text` gates the TS path (dod-runner.ts / adjudicate.ts /
 * complete.ts) actually checks. So a task whose structured gates all pass
 * can still be routed to needs-human by complete-task.sh, because it's
 * really executing unrelated, not-shell-valid prose text instead.
 *
 * These tests exercise the REAL bash script end-to-end (same synthetic-repo
 * pattern as epicd-run-integration.test.ts), using the real
 * handle-basic-ready.sh to claim/create the worktree, simulating the Agent's
 * "done" signal, then invoking the real complete-task.sh and asserting on
 * the resulting task status/board state.
 *
 * Both tests are expected to FAIL against the pre-fix code:
 *   - Test 1: structured `dod: ["true"]` (always passes) + prose
 *     definitionOfDoneItems that are NOT valid shell -> pre-fix,
 *     complete-task.sh executes the prose as shell, it fails, and the task
 *     is wrongly routed to Needs Human instead of merged.
 *   - Test 2: no structured gates at all (`dodGates: []`) -> mirrors
 *     dod-runner.ts's "no gates -> never auto-merge" semantics; pre-fix,
 *     complete-task.sh's awk loop finds zero lines to check in the (now
 *     empty) prose section and falls through to merging anyway.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");
const HANDLE_BASIC_READY_SH = join(process.cwd(), "plugin", "scripts", "handle-basic-ready.sh");
const COMPLETE_TASK_SH = join(process.cwd(), "plugin", "scripts", "complete-task.sh");

/**
 * complete-task.sh (unlike handle-basic-ready.sh) invokes the bare `backlog`
 * binary rather than resolving this repo's dev CLI. To exercise the fixed
 * renderer (which lives only in this dev tree, not whatever `backlog` build
 * happens to be globally installed on the sandbox's PATH), we shim a
 * `backlog` executable onto PATH that forwards to this repo's `src/cli.ts`.
 */
async function createDevCliShim(): Promise<string> {
	const shimDir = createUniqueTestDir("back654-shim-bin");
	await mkdir(shimDir, { recursive: true });
	const shimPath = join(shimDir, "backlog");
	await writeFile(shimPath, `#!/usr/bin/env bash\nexec bun "${CLI_PATH}" "$@"\n`);
	chmodSync(shimPath, 0o755);
	return shimDir;
}

async function createReadyTask(core: Core, title: string, opts: { dodGates: string[]; proseDoD: string[] }) {
	const { task } = await core.createTaskFromInput(
		{
			title,
			status: "Basic: Proposal",
			dodGates: opts.dodGates,
			definitionOfDoneAdd: opts.proseDoD,
			disableDefinitionOfDoneDefaults: true,
		},
		false,
	);
	const withPipeline = { ...task, pipeline_id: "execution", phase: "ready" };
	await core.updateTask(withPipeline, false);
	return withPipeline;
}

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

async function simulateAgentDone(worktreeDir: string, signalFile: string, taskId: string): Promise<void> {
	await writeFile(join(worktreeDir, `${taskId}.txt`), "work done by simulated agent");
	await $`git add ${taskId}.txt`.cwd(worktreeDir).quiet();
	await $`git commit -m "work for ${taskId}"`.cwd(worktreeDir).quiet();
	await writeFile(signalFile, "done");
}

async function runCompleteTask(repoDir: string, taskId: string, shimDir: string) {
	const proc = Bun.spawn(["bash", COMPLETE_TASK_SH, taskId], {
		cwd: repoDir,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, PATH: `${shimDir}:${process.env.PATH ?? ""}` },
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

describe("BACK-654 regression: complete-task.sh vs structured task.dod gates", () => {
	let projectRoot: string;
	let core: Core;
	let shimDir: string;
	let createdTaskIds: string[];

	beforeEach(async () => {
		createdTaskIds = [];
		projectRoot = createUniqueTestDir("back654-regression");
		await mkdir(projectRoot, { recursive: true });
		await $`git init -b main`.cwd(projectRoot).quiet();
		await $`git config user.email "test@test.com"`.cwd(projectRoot).quiet();
		await $`git config user.name "Test"`.cwd(projectRoot).quiet();

		core = new Core(projectRoot);
		await initializeTestProject(core, "back654-regression-test");

		// handle-basic-ready.sh / complete-task.sh transition through the
		// "Basic: ..." pipeline statuses used by this repo's own board
		// (backlog/config.yml) — mirror that here so the transitions are valid.
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.statuses = ["Basic: Proposal", "Basic: In Progress", "Basic: Done", "Basic: Needs Human"];
			await core.filesystem.saveConfig(config);
		}

		await $`git add -A`.cwd(projectRoot).quiet();
		await $`git commit -m "init board"`.cwd(projectRoot).quiet();

		shimDir = await createDevCliShim();
	});

	afterEach(async () => {
		for (const taskId of createdTaskIds) {
			const siblingWorktreeDir = join(projectRoot, "..", `${basename(projectRoot)}-${taskId}`);
			await $`git -C ${projectRoot} worktree remove --force ${siblingWorktreeDir}`.quiet().catch(() => {});
			await rm(siblingWorktreeDir, { recursive: true, force: true }).catch(() => {});
		}
		await rm(projectRoot, { recursive: true, force: true });
		await rm(shimDir, { recursive: true, force: true }).catch(() => {});
	});

	// These tests spawn several subprocesses (git, the "backlog" dev-CLI shim,
	// handle-basic-ready.sh, complete-task.sh) in sequence; under heavy
	// `bun test --parallel` contention that can comfortably exceed the default
	// per-test timeout, so both use a generous explicit timeout.
	it("structured dod gates all pass but prose DoD is not valid shell -> merges (Basic: Done), does not escalate", async () => {
		const task = await createReadyTask(core, "BACK-654 sample: passing structured gate", {
			dodGates: ["true"],
			proseDoD: ["bun test (or scoped test) passes"],
		});
		createdTaskIds.push(task.id);

		const { worktreeDir, signalFile } = await runHandleBasicReady(projectRoot, task.id);
		expect(existsSync(worktreeDir)).toBe(true);

		await simulateAgentDone(worktreeDir, signalFile, task.id);

		const result = await runCompleteTask(projectRoot, task.id, shimDir);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.status).toBe("Basic: Done");

		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).toContain(`work for ${task.id}`);
	}, 30000);

	it("no structured dod gates at all -> escalates to Needs Human even though the agent signalled done", async () => {
		// Prose DoD is deliberately trivially-valid-as-shell ("true") so this test
		// isolates the "no structured gates -> never auto-merge" guard from any
		// incidental prose-parses-as-failing-shell confound (see the other test).
		const task = await createReadyTask(core, "BACK-654 sample: no structured gates", {
			dodGates: [],
			proseDoD: ["true"],
		});
		createdTaskIds.push(task.id);

		const { worktreeDir, signalFile } = await runHandleBasicReady(projectRoot, task.id);
		await simulateAgentDone(worktreeDir, signalFile, task.id);

		const result = await runCompleteTask(projectRoot, task.id, shimDir);
		expect(result.exitCode).toBe(0);

		const updated = await core.getTask(task.id);
		expect(updated?.status).toBe("Basic: Needs Human");

		const log = await $`git -C ${projectRoot} log --oneline -n 5`.text();
		expect(log).not.toContain(`work for ${task.id}`);
	}, 30000);
});
