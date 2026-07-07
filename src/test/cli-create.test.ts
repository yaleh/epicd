import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

let TEST_DIR: string;

beforeEach(async () => {
	TEST_DIR = createUniqueTestDir("test-cli-create");
	await mkdir(TEST_DIR, { recursive: true });
	await $`git init -b main`.cwd(TEST_DIR).quiet();
	await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
	await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

	const core = new Core(TEST_DIR);
	await initializeTestProject(core, "Create Command Test", true);

	const config = await core.filesystem.loadConfig();
	if (!config) {
		throw new Error("Expected backlog config to exist");
	}

	config.autoCommit = true;
	await core.filesystem.saveConfig(config);
	const git = await core.getGitOps();
	await git.addFile(join(TEST_DIR, "backlog", "config.yml"));
	await git.commitChanges("backlog: Enable autoCommit for CLI create tests");
});

afterEach(async () => {
	try {
		await safeCleanup(TEST_DIR);
	} catch {
		// Ignore cleanup errors
	}
});

describe("create commands", () => {
	it("should honor autoCommit config for task create", async () => {
		// CLI-CONTRACT: verifies 'task create' triggers an auto-commit when autoCommit=true in config; checks commit count and message
		const beforeCount = Number((await $`git rev-list --count HEAD`.cwd(TEST_DIR).text()).trim());
		const output = await $`bun ${CLI_PATH} task create "CLI Auto Commit Task"`.cwd(TEST_DIR).text();
		const afterCount = Number((await $`git rev-list --count HEAD`.cwd(TEST_DIR).text()).trim());

		const core = new Core(TEST_DIR);
		const git = await core.getGitOps();
		const task = await core.filesystem.loadTask("task-1");

		expect(task).not.toBeNull();
		expect(output).toContain(`Created task ${task?.id}`);
		expect(afterCount).toBe(beforeCount + 1);
		expect(await git.isClean()).toBe(true);
		expect(await git.getLastCommitMessage()).toContain(`Create task ${task?.id}`);
		expect(task?.title).toBe("CLI Auto Commit Task");
	});

	it("should accept dependencies from other active branches", async () => {
		const core = new Core(TEST_DIR);

		const remoteDir = join(TEST_DIR, "remote.git");
		await $`git init --bare -b main ${remoteDir}`.quiet();
		await $`git remote add origin ${remoteDir}`.cwd(TEST_DIR).quiet();
		await $`git push -u origin main`.cwd(TEST_DIR).quiet();

		await $`git checkout -b feature`.cwd(TEST_DIR).quiet();
		await core.createTask(
			{
				id: "task-1",
				title: "Cross-branch dependency target",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-09",
				labels: [],
				dependencies: [],
				rawContent: "Created on feature branch",
			},
			true,
		);
		await $`git push -u origin feature`.cwd(TEST_DIR).quiet();
		await $`git remote update origin --prune`.cwd(TEST_DIR).quiet();
		await $`git checkout main`.cwd(TEST_DIR).quiet();
		await core.gitOps.fetch();

		const visibleTasks = await core.queryTasks();
		expect(visibleTasks.some((task) => task.id === "TASK-1")).toBe(true);

		// CLI-CONTRACT: verifies 'task create --depends-on task-1' creates task with dependency on a task visible from a remote branch
		const output = await $`bun ${CLI_PATH} task create "Depends on feature task" --depends-on task-1`
			.cwd(TEST_DIR)
			.text();
		const createdTask = await core.filesystem.loadTask("task-2");

		expect(output).toContain("Created task TASK-2");
		expect(createdTask?.dependencies).toEqual(["TASK-1"]);
	});

	it("defaults a bare create to authoring/draft (not Basic: Proposal)", async () => {
		await $`bun ${CLI_PATH} task create "Bare create"`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.pipeline_id).toBe("authoring");
		expect(task?.phase).toBe("draft");
		expect(task?.status).toBe("Draft");
	});

	it("honors explicit --pipeline/--phase", async () => {
		await $`bun ${CLI_PATH} task create "Explicit pipeline" --pipeline execution --phase ready`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.pipeline_id).toBe("execution");
		expect(task?.phase).toBe("ready");
		expect(task?.status).toBe("Ready");
	});

	it("rejects --pipeline given without --phase (BACK-661 asymmetric validation)", async () => {
		const result = await $`bun ${CLI_PATH} task create "Half pair pipeline only" --pipeline execution`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		expect(result.exitCode).not.toBe(0);

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task).toBeNull();
	});

	it("rejects --phase given without --pipeline (BACK-661 asymmetric validation)", async () => {
		const result = await $`bun ${CLI_PATH} task create "Half pair phase only" --phase ready`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		expect(result.exitCode).not.toBe(0);

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task).toBeNull();
	});

	it("rejects an illegal --pipeline/--phase combo at create", async () => {
		const result = await $`bun ${CLI_PATH} task create "Illegal combo" --pipeline execution --phase proposal`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();
		expect(result.exitCode).not.toBe(0);

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task).toBeNull();
	});
});
