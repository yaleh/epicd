/**
 * BACK-620 — claiming a task via the real `plugin/scripts/handle-basic-ready.sh`
 * must preserve engine structural fields (pipeline_id, phase, parent_id, dod)
 * that were already present on the task file before the claim.
 *
 * Regression for: the script used to shell out to the bare `backlog` binary
 * on $PATH, which can resolve to a stale globally installed npm package
 * whose frontmatter schema doesn't know about these fields — it silently
 * dropped them on rewrite. The fix pins the claim edit to this repo's own
 * dev CLI (src/cli.ts), which does know the current schema.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const HANDLE_BASIC_READY_SH = join(process.cwd(), "plugin", "scripts", "handle-basic-ready.sh");

describe("handle-basic-ready.sh — claim preserves engine structural fields (BACK-620)", () => {
	let projectRoot: string;
	let core: Core;
	let taskId: string;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("handle-basic-ready-claim");
		await mkdir(projectRoot, { recursive: true });
		await $`git init -b main`.cwd(projectRoot).quiet();
		await $`git config user.email "test@test.com"`.cwd(projectRoot).quiet();
		await $`git config user.name "Test"`.cwd(projectRoot).quiet();

		core = new Core(projectRoot);
		await initializeTestProject(core, "handle-basic-ready-claim-test");

		// handle-basic-ready.sh claims via the "Basic: ..." pipeline statuses
		// used by this repo's own board (backlog/config.yml) — mirror that
		// here so the claim's status transition is valid.
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.statuses = ["Basic: Proposal", "Basic: In Progress", "Basic: Done"];
			await core.filesystem.saveConfig(config);
		}

		const { task } = await core.createTaskFromInput(
			{
				title: "Claim preserves structural fields",
				status: "Basic: Proposal",
				dodGates: ["true", "bunx tsc --noEmit"],
			},
			false,
		);
		const withStructuralFields = {
			...task,
			pipeline_id: "execution",
			phase: "ready",
			parent_id: "BACK-601",
		};
		await core.updateTask(withStructuralFields, false);
		taskId = task.id;

		await $`git add -A`.cwd(projectRoot).quiet();
		await $`git commit -m "init board with structural-fields task"`.cwd(projectRoot).quiet();
	});

	afterEach(async () => {
		const siblingWorktreeDir = join(projectRoot, "..", `${basename(projectRoot)}-${taskId}`);
		await $`git -C ${projectRoot} worktree remove --force ${siblingWorktreeDir}`.quiet().catch(() => {});
		await rm(siblingWorktreeDir, { recursive: true, force: true }).catch(() => {});
		await rm(projectRoot, { recursive: true, force: true }).catch(() => {});
	});

	it("preserves pipeline_id/phase/parent_id/dod after claim; only status/assignee/notes change", async () => {
		// Read directly off disk (not through Core's cached ContentStore) so we
		// see the real file the script wrote, not a stale in-memory snapshot.
		const before = await core.filesystem.loadTask(taskId);
		expect(before?.pipeline_id).toBe("execution");
		expect(before?.phase).toBe("ready");
		expect(before?.parent_id).toBe("BACK-601");
		expect(before?.dod?.length ?? 0).toBeGreaterThan(0);

		const proc = Bun.spawn(["bash", HANDLE_BASIC_READY_SH, taskId], {
			cwd: projectRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(exitCode).toBe(0);
		void stdout;
		void stderr;

		const after = await core.filesystem.loadTask(taskId);
		expect(after).not.toBeNull();
		expect(after?.pipeline_id).toBe(before?.pipeline_id);
		expect(after?.phase).toBe(before?.phase);
		expect(after?.parent_id).toBe(before?.parent_id);
		expect(after?.dod).toEqual(before?.dod);

		// The claim itself is expected to have taken effect.
		expect(after?.status).toBe("Basic: In Progress");
	});
});
