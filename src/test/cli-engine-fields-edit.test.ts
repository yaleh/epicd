/**
 * BACK-628.3 — `task edit --phase/--pipeline-id/--parent-id` CLI flags.
 *
 * MCP `task_edit` already exposed these engine-managed fields end-to-end (types,
 * schema, buildTaskUpdateInput); the CLI was the only surface missing them. These
 * tests confirm the flags reach `TaskUpdateInput` and that setting `--phase` also
 * derives `status` via the BACK-627 centralization in `Core.updateTask`.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

let TEST_DIR: string;

beforeEach(async () => {
	TEST_DIR = createUniqueTestDir("test-cli-engine-fields-edit");
	await mkdir(TEST_DIR, { recursive: true });
	await $`git init -b main`.cwd(TEST_DIR).quiet();
	await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
	await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
	const core = new Core(TEST_DIR);
	await initializeTestProject(core, "Engine Fields Edit Test", true);
});

afterEach(async () => {
	try {
		await safeCleanup(TEST_DIR);
	} catch {
		// ignore
	}
});

describe("task edit --pipeline-id/--phase/--parent-id (BACK-628.3)", () => {
	it("sets pipeline_id, phase, and parent_id, deriving status from phase (BACK-627)", async () => {
		await $`bun ${CLI_PATH} task create "Parent epic"`.cwd(TEST_DIR).quiet();
		await $`bun ${CLI_PATH} task create "Child task"`.cwd(TEST_DIR).quiet();

		await $`bun ${CLI_PATH} task edit task-2 --pipeline-id execution --phase ready --parent-id task-1`
			.cwd(TEST_DIR)
			.quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-2");
		expect(task?.pipeline_id).toBe("execution");
		expect(task?.phase).toBe("ready");
		expect(task?.parent_id).toBe("task-1");
		expect(task?.status).toBe("Basic: Ready");
	});

	it("re-setting --phase alone keeps status in sync without a separate --status flag", async () => {
		const core = new Core(TEST_DIR);
		await core.createTaskFromInput({ title: "Solo task", pipeline_id: "execution", phase: "ready" }, false);
		await $`bun ${CLI_PATH} task edit task-1 --phase done`.cwd(TEST_DIR).quiet();

		const task = await core.filesystem.loadTask("task-1");
		expect(task?.phase).toBe("done");
		expect(task?.status).toBe("Basic: Done");
	});
});
