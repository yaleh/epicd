/**
 * BACK-613 Phase B — `task create/edit --dod-gate <cmd>` sets STRUCTURED executable
 * DoD gates (task.dod), distinct from the prose `--dod` checklist.
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
	TEST_DIR = createUniqueTestDir("test-cli-dod-gate");
	await mkdir(TEST_DIR, { recursive: true });
	await $`git init -b main`.cwd(TEST_DIR).quiet();
	await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
	await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
	const core = new Core(TEST_DIR);
	await initializeTestProject(core, "DoD Gate Test", true);
});

afterEach(async () => {
	try {
		await safeCleanup(TEST_DIR);
	} catch {
		// ignore
	}
});

describe("task create/edit --dod-gate (BACK-613)", () => {
	it("create --dod-gate sets structured executable dod, leaving prose --dod separate", async () => {
		await $`bun ${CLI_PATH} task create "Gated task" --dod-gate ${"bunx tsc --noEmit"} --dod ${"human note only"}`
			.cwd(TEST_DIR)
			.quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task).not.toBeNull();

		// Structured gate is present and executable-verbatim.
		expect(task?.dod).toEqual([{ text: "bunx tsc --noEmit", checked: false }]);
		// The prose checklist got the human note, NOT the gate command.
		const proseTexts = (task?.definitionOfDoneItems ?? []).map((i) => i.text);
		expect(proseTexts).toContain("human note only");
		expect(proseTexts).not.toContain("bunx tsc --noEmit");
	});

	it("edit --dod-gate appends to structured dod", async () => {
		await $`bun ${CLI_PATH} task create "Editable task" --dod-gate ${"true"}`.cwd(TEST_DIR).quiet();
		await $`bun ${CLI_PATH} task edit task-1 --dod-gate ${"bun test"}`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.dod).toEqual([
			{ text: "true", checked: false },
			{ text: "bun test", checked: false },
		]);
	});

	it("edit --remove-dod-gate removes a structured gate by 1-based index (BACK-633)", async () => {
		await $`bun ${CLI_PATH} task create "Gated task" --dod-gate ${"bunx tsc --noEmit"} --dod-gate ${"wrong cmd"} --dod-gate ${"bun test"}`
			.cwd(TEST_DIR)
			.quiet();
		await $`bun ${CLI_PATH} task edit task-1 --remove-dod-gate 2`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.dod).toEqual([
			{ text: "bunx tsc --noEmit", checked: false },
			{ text: "bun test", checked: false },
		]);
	});

	it("edit --remove-dod-gate composes with --dod-gate in the same call (replace-by-index then append)", async () => {
		await $`bun ${CLI_PATH} task create "Gated task" --dod-gate ${"wrong cmd"}`.cwd(TEST_DIR).quiet();
		await $`bun ${CLI_PATH} task edit task-1 --remove-dod-gate 1 --dod-gate ${"bunx tsc --noEmit"}`
			.cwd(TEST_DIR)
			.quiet();

		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task?.dod).toEqual([{ text: "bunx tsc --noEmit", checked: false }]);
	});
});
