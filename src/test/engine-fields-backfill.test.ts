/**
 * BACK-612 (BACK-601.5) — in-place idempotent backfill of engine structural
 * fields (pipeline_id/phase/parent_id/role) on existing task files.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { computeBackfillFields, deriveBarePhase, runBackfill } from "../core/engine-fields-backfill.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { type MergeLockFs, withMergeLock } from "../engine/safety.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

/** Real MergeLockFs backed by node:fs (same shape used across engine safety tests). */
const realLockFs: MergeLockFs = {
	mkdir: (dir, opts) => mkdir(dir, opts).then(() => {}),
	writeFile: (p, d) => writeFile(p, d),
	exists: (p) => existsSync(p),
	join: (...parts) => join(...parts),
};

function baseTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "A task",
		status: "To Do",
		assignee: [],
		createdDate: "2026-01-01 00:00",
		labels: [],
		dependencies: [],
		rawContent: "",
		...overrides,
	} as Task;
}

describe("deriveBarePhase", () => {
	it("derives bare phase from a role-prefixed status", () => {
		expect(deriveBarePhase("Basic: In Progress")).toBe("in-progress");
	});

	it("derives bare phase for legacy unprefixed status", () => {
		expect(deriveBarePhase("To Do")).toBe("to-do");
	});
});

describe("computeBackfillFields", () => {
	it("defaults pipeline_id to the execution pipeline id when missing", () => {
		const task = baseTask();
		const patch = computeBackfillFields(task, new Map());
		expect(patch.pipeline_id).toBe(executionPipeline.id);
	});

	it("derives phase from status when missing", () => {
		const task = baseTask({ status: "Basic: In Progress" });
		const patch = computeBackfillFields(task, new Map());
		expect(patch.phase).toBe("in-progress");
	});

	it("derives parent_id from legacy parentTaskId when parent_id is blank", () => {
		const task = baseTask({ parentTaskId: "back-600" });
		const patch = computeBackfillFields(task, new Map());
		expect(patch.parent_id).toBe("back-600");
	});

	it("derives role from tree position (compound when task has children)", () => {
		const parent = baseTask({ id: "back-600" });
		const childIdsByParent = new Map<string, string[]>([["back-600", ["back-601"]]]);
		const patch = computeBackfillFields(parent, childIdsByParent);
		expect(patch.role).toBe("compound");
	});

	it("derives role: primitive for a leaf task with no children", () => {
		const task = baseTask();
		const patch = computeBackfillFields(task, new Map());
		expect(patch.role).toBe("primitive");
	});

	it("returns no changes (empty object) when all four fields are already present", () => {
		const task = baseTask({
			pipeline_id: "execution",
			phase: "to-do",
			parent_id: "back-600",
			role: "primitive",
		});
		const patch = computeBackfillFields(task, new Map());
		expect(patch).toEqual({});
	});

	it("never touches dod or cap", () => {
		const task = baseTask();
		const patch = computeBackfillFields(task, new Map());
		expect(patch).not.toHaveProperty("dod");
		expect(patch).not.toHaveProperty("cap");
	});
});

describe("runBackfill", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-backfill");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-backfill-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("backfills blank structural fields across all task files and reports which ids changed", async () => {
		const { task: parent } = await core.createTaskFromInput({ title: "Parent", status: "To Do" }, false);
		const { task: child } = await core.createTaskFromInput(
			{ title: "Child", status: "To Do", parentTaskId: parent.id },
			false,
		);

		const { updated } = await runBackfill(core);

		expect(updated.sort()).toEqual([child.id, parent.id].sort());

		const reloadedParent = await core.getTask(parent.id);
		const reloadedChild = await core.getTask(child.id);

		expect(reloadedParent?.pipeline_id).toBe("execution");
		expect(reloadedParent?.phase).toBe("to-do");
		expect(reloadedParent?.role).toBe("compound");

		expect(reloadedChild?.pipeline_id).toBe("execution");
		expect(reloadedChild?.phase).toBe("to-do");
		expect(reloadedChild?.parent_id).toBe(parent.id);
		expect(reloadedChild?.role).toBe("primitive");
	});

	it("does not move or rename any files", async () => {
		await core.createTaskFromInput({ title: "Task A", status: "To Do" }, false);
		const filesBefore = await Array.fromAsync(new Bun.Glob("**/*.md").scan({ cwd: core.filesystem.tasksDir }));

		await runBackfill(core);

		const filesAfter = await Array.fromAsync(new Bun.Glob("**/*.md").scan({ cwd: core.filesystem.tasksDir }));
		expect(filesAfter.sort()).toEqual(filesBefore.sort());
	});

	it("second run is a true no-op", async () => {
		const { task } = await core.createTaskFromInput({ title: "Task A", status: "To Do" }, false);

		const first = await runBackfill(core);
		expect(first.updated).toContain(task.id);

		const path = await getTaskFilePath(core, task.id);
		const mtimeBefore = statSync(path).mtimeMs;

		const second = await runBackfill(core);
		expect(second.updated).toEqual([]);

		const mtimeAfter = statSync(path).mtimeMs;
		expect(mtimeAfter).toBe(mtimeBefore);
	});

	it("is safe to run concurrently with itself (lock-guarded)", async () => {
		const { task: a } = await core.createTaskFromInput({ title: "Task A", status: "To Do" }, false);
		const { task: b } = await core.createTaskFromInput({ title: "Task B", status: "In Progress" }, false);

		const backlogDir = core.filesystem.backlogDir;

		const runLockedBackfill = () => withMergeLock(backlogDir, () => runBackfill(core), realLockFs);

		await Promise.all([runLockedBackfill(), runLockedBackfill()]);

		const reloadedA = await core.getTask(a.id);
		const reloadedB = await core.getTask(b.id);

		expect(reloadedA?.pipeline_id).toBe("execution");
		expect(reloadedA?.role).toBe("primitive");
		expect(reloadedB?.pipeline_id).toBe("execution");
		expect(reloadedB?.phase).toBe("in-progress");
	});
});

async function getTaskFilePath(core: Core, taskId: string): Promise<string> {
	const files = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: core.filesystem.tasksDir }));
	const file = files.find((f) => f.toLowerCase().startsWith(`${taskId.toLowerCase()} -`));
	if (!file) throw new Error(`task file for ${taskId} not found`);
	return join(core.filesystem.tasksDir, file);
}
