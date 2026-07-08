/**
 * BACK-664.1 — has-children is an independent, standalone indicator, never
 * concatenated into the status display string (BACK-664 child 1 / BACK-665
 * AC#3). This file covers:
 *   1. The core/CLI-side `hasChildren` helper (utils/task-subtasks.ts).
 *   2. The web-side `hasChildren` reimplementation (web/lib/lanes.ts) stays
 *      behaviorally aligned with the core one.
 *   3. The real `task list --plain` CLI output carries a has-children marker
 *      that is independent of status/phase (present regardless of which
 *      phase/status the parent task is in).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { hasChildren as coreHasChildren } from "../utils/task-subtasks.ts";
import { hasChildren as webHasChildren } from "../web/lib/lanes.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

function makeTask(overrides: Partial<Task>): Task {
	return {
		id: "TASK-1",
		title: "Task",
		status: "To Do",
		assignee: [],
		createdDate: "2026-01-01 00:00",
		labels: [],
		dependencies: [],
		...overrides,
	};
}

describe("hasChildren — core/CLI-side helper (utils/task-subtasks.ts)", () => {
	it("is true when another task's parentTaskId points at it", () => {
		const parent = makeTask({ id: "TASK-1" });
		const child = makeTask({ id: "TASK-1.1", parentTaskId: "TASK-1" });
		expect(coreHasChildren(parent, [parent, child])).toBe(true);
	});

	it("is false for a leaf task with no children", () => {
		const leaf = makeTask({ id: "TASK-2" });
		const unrelated = makeTask({ id: "TASK-3" });
		expect(coreHasChildren(leaf, [leaf, unrelated])).toBe(false);
	});

	it("is independent of status/phase — true regardless of the parent's status", () => {
		const child = makeTask({ id: "TASK-1.1", parentTaskId: "TASK-1" });
		for (const status of ["Ready", "Needs Human", "Done", "Draft"]) {
			const parent = makeTask({ id: "TASK-1", status });
			expect(coreHasChildren(parent, [parent, child])).toBe(true);
		}
	});
});

describe("hasChildren — web-side helper (web/lib/lanes.ts) stays aligned with the core helper", () => {
	it("agrees with the core helper across compound and primitive tasks", () => {
		const parent = makeTask({ id: "TASK-1" });
		const child = makeTask({ id: "TASK-1.1", parentTaskId: "TASK-1" });
		const leaf = makeTask({ id: "TASK-2" });
		const tasks = [parent, child, leaf];

		expect(webHasChildren(parent, tasks)).toBe(coreHasChildren(parent, tasks));
		expect(webHasChildren(leaf, tasks)).toBe(coreHasChildren(leaf, tasks));
		expect(webHasChildren(parent, tasks)).toBe(true);
		expect(webHasChildren(leaf, tasks)).toBe(false);
	});
});

describe("CLI `task list --plain` has-children marker", () => {
	let TEST_DIR: string;
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("has-children-indicator-cli");
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await initializeTestProject(core, "Has Children Indicator Test");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	it("marks a task with children and leaves a leaf task unmarked, independent of status", async () => {
		await $`bun ${CLI_PATH} task create "Parent task" --pipeline execution --phase implementing`.cwd(TEST_DIR).quiet();
		await $`bun ${CLI_PATH} task create "Child task" -p 1`.cwd(TEST_DIR).quiet();
		await $`bun ${CLI_PATH} task create "Leaf task"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${CLI_PATH} task list --plain`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);
		const out = result.stdout.toString();

		const parentLine = out.split("\n").find((line) => line.includes("TASK-1 - Parent task"));
		const leafLine = out.split("\n").find((line) => line.includes("TASK-2 - Leaf task"));

		expect(parentLine).toBeDefined();
		expect(leafLine).toBeDefined();
		// The has-children marker must be present on the parent row (independent
		// of its "Implementing" status/phase) and absent on the leaf task's row.
		expect(parentLine?.trim().startsWith("▸")).toBe(true);
		expect(leafLine?.trim().startsWith("▸")).toBe(false);
	}, 15000);
});
