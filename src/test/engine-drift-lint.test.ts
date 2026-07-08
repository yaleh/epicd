/**
 * BACK-655 Phase D — `engine drift-lint`: lists tasks whose `status` is set
 * but `pipeline_id`/`phase` is empty, or whose `phase` is not a legal state
 * of its `pipeline_id`. Exits non-zero when drift is found (CI-usable).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { computeDrift } from "../core/engine-fields-backfill.ts";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

function baseTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "A task",
		status: "Basic: Ready",
		assignee: [],
		createdDate: "2026-01-01 00:00",
		labels: [],
		dependencies: [],
		rawContent: "",
		...overrides,
	} as Task;
}

describe("computeDrift", () => {
	it("flags status set but pipeline_id/phase empty", () => {
		const task = baseTask({ status: "Basic: Ready", pipeline_id: undefined, phase: undefined });
		const drift = computeDrift([task]);
		const entry = drift.find((d) => d.id === task.id);
		expect(entry).toBeDefined();
		expect(entry?.reason).toMatch(/missing/i);
	});

	it("flags a phase illegal for its pipeline", () => {
		const task = baseTask({ pipeline_id: "execution", phase: "proposal" });
		const drift = computeDrift([task]);
		const entry = drift.find((d) => d.id === task.id);
		expect(entry).toBeDefined();
		expect(entry?.reason).toMatch(/proposal/);
	});

	it("does not flag a legal (pipeline_id, phase) combo", () => {
		const task = baseTask({ pipeline_id: "execution", phase: "implementing" });
		const drift = computeDrift([task]);
		expect(drift.find((d) => d.id === task.id)).toBeUndefined();
	});

	it("flags a status-terminal / phase-non-terminal divergence even when the combo is individually legal", () => {
		const divergent = baseTask({ id: "task-1", pipeline_id: "execution", phase: "needs-human", status: "Basic: Done" });
		const agreed = baseTask({ id: "task-2", pipeline_id: "execution", phase: "done", status: "Basic: Done" });

		const drift = computeDrift([divergent, agreed]);

		const entry = drift.find((d) => d.id === divergent.id);
		expect(entry).toBeDefined();
		expect(entry?.reason).toMatch(/terminal/i);
		expect(drift.find((d) => d.id === agreed.id)).toBeUndefined();
	});
});

describe("engine drift-lint (CLI)", () => {
	let TEST_DIR: string;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-engine-drift-lint");
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		const core = new Core(TEST_DIR);
		await initializeTestProject(core, "Drift Lint Test", true);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// ignore
		}
	});

	it("exits non-zero and lists a drifted task", async () => {
		const core = new Core(TEST_DIR);
		const { task } = await core.createTaskFromInput({ title: "Drifted", status: "To Do" }, false);
		await core.filesystem.saveTask({ ...task, status: "Basic: Proposal", pipeline_id: "execution", phase: "proposal" });

		const result = await $`bun ${CLI_PATH} engine drift-lint`.cwd(TEST_DIR).nothrow();
		expect(result.exitCode).not.toBe(0);
		expect(result.stdout.toString() + result.stderr.toString()).toContain(task.id);
	});

	it("exits zero on a clean board", async () => {
		const core = new Core(TEST_DIR);
		await core.createTaskFromInput({ title: "Clean task", pipeline_id: "execution", phase: "implementing" }, false);

		const result = await $`bun ${CLI_PATH} engine drift-lint`.cwd(TEST_DIR).nothrow();
		expect(result.exitCode).toBe(0);
	});
});
