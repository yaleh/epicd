/**
 * BACK-612 (BACK-601.5) — in-place idempotent backfill of engine structural
 * fields (pipeline_id/phase/parent_id) on existing task files. `role` is
 * 100% derived via `roleOf()` (BACK-664.2) and is never backfilled/persisted.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import {
	computeBackfillFields,
	deriveBarePhase,
	resolvePipelinePhase,
	runBackfill,
} from "../core/engine-fields-backfill.ts";
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

describe("resolvePipelinePhase", () => {
	it("maps legacy Proposal → authoring/draft", () => {
		expect(resolvePipelinePhase("Basic: Proposal")).toEqual({ pipeline_id: "authoring", phase: "draft" });
	});

	it("maps legacy Plan → authoring/refining", () => {
		expect(resolvePipelinePhase("Basic: Plan")).toEqual({ pipeline_id: "authoring", phase: "refining" });
	});

	it("maps Backlog/Draft/Refining → authoring same-name phase", () => {
		expect(resolvePipelinePhase("Basic: Backlog")).toEqual({ pipeline_id: "authoring", phase: "backlog" });
		expect(resolvePipelinePhase("Basic: Draft")).toEqual({ pipeline_id: "authoring", phase: "draft" });
		expect(resolvePipelinePhase("Basic: Refining")).toEqual({ pipeline_id: "authoring", phase: "refining" });
	});

	it("maps In Progress → execution/ready (claim layer, never persisted as a phase)", () => {
		expect(resolvePipelinePhase("Basic: In Progress")).toEqual({ pipeline_id: "execution", phase: "ready" });
	});

	it("maps Ready/Decomposing/Awaiting Children/Evaluating/Needs Human/Done → execution same-name phase", () => {
		expect(resolvePipelinePhase("Basic: Ready")).toEqual({ pipeline_id: "execution", phase: "ready" });
		expect(resolvePipelinePhase("Basic: Decomposing")).toEqual({ pipeline_id: "execution", phase: "decomposing" });
		expect(resolvePipelinePhase("Basic: Awaiting Children")).toEqual({
			pipeline_id: "execution",
			phase: "awaiting-children",
		});
		expect(resolvePipelinePhase("Basic: Evaluating")).toEqual({ pipeline_id: "execution", phase: "evaluating" });
		expect(resolvePipelinePhase("Basic: Needs Human")).toEqual({ pipeline_id: "execution", phase: "needs-human" });
		expect(resolvePipelinePhase("Basic: Done")).toEqual({ pipeline_id: "execution", phase: "done" });
	});

	it("maps Spike → exploration/spike", () => {
		expect(resolvePipelinePhase("Basic: Spike")).toEqual({ pipeline_id: "exploration", phase: "spike" });
	});
});

describe("computeBackfillFields", () => {
	it("selects authoring/draft for a legacy Proposal task instead of execution", () => {
		const task = baseTask({ status: "Basic: Proposal" });
		const patch = computeBackfillFields(task);
		expect(patch.pipeline_id).toBe("authoring");
		expect(patch.phase).toBe("draft");
	});

	it("repositions a historically mis-tagged task (execution + illegal phase 'proposal') to authoring/draft", () => {
		const task = baseTask({ pipeline_id: "execution", phase: "proposal", status: "Basic: Proposal" });
		const patch = computeBackfillFields(task);
		expect(patch.pipeline_id).toBe("authoring");
		expect(patch.phase).toBe("draft");
	});

	it("leaves a legal (pipeline_id, phase) combo untouched", () => {
		const task = baseTask({ pipeline_id: "execution", phase: "ready", status: "Basic: Proposal" });
		const patch = computeBackfillFields(task);
		expect(patch.pipeline_id).toBeUndefined();
		expect(patch.phase).toBeUndefined();
	});

	it("derives phase from status when missing", () => {
		const task = baseTask({ status: "Basic: In Progress" });
		const patch = computeBackfillFields(task);
		expect(patch.pipeline_id).toBe("execution");
		expect(patch.phase).toBe("ready");
	});

	it("derives parent_id from legacy parentTaskId when parent_id is blank", () => {
		const task = baseTask({ parentTaskId: "back-600" });
		const patch = computeBackfillFields(task);
		expect(patch.parent_id).toBe("back-600");
	});

	it("repositions a legal-but-terminally-divergent task (execution/needs-human + status Done) to execution/done", () => {
		const task = baseTask({ pipeline_id: "execution", phase: "needs-human", status: "Basic: Done" });
		const patch = computeBackfillFields(task);
		expect(patch.phase).toBe("done");
		expect(patch.pipeline_id).toBe("execution");
	});

	it("returns no changes (empty object) when all structural fields are already present", () => {
		const task = baseTask({
			pipeline_id: "execution",
			phase: "ready",
			parent_id: "back-600",
		});
		const patch = computeBackfillFields(task);
		expect(patch).toEqual({});
	});

	it("never touches dod or cap", () => {
		const task = baseTask();
		const patch = computeBackfillFields(task);
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

		expect(reloadedParent?.pipeline_id).toBe("authoring");
		expect(reloadedParent?.phase).toBe("draft");

		expect(reloadedChild?.pipeline_id).toBe("authoring");
		expect(reloadedChild?.phase).toBe("draft");
		expect(reloadedChild?.parent_id).toBe(parent.id);
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

		expect(reloadedA?.pipeline_id).toBe("authoring");
		expect(reloadedB?.pipeline_id).toBe("execution");
		expect(reloadedB?.phase).toBe("ready");
	});

	it("second run over already-repositioned tasks is a true no-op", async () => {
		// Bypass create-time validation to simulate a historically mis-tagged task
		// (pipeline_id/phase illegal combo) that predates BACK-655's write-boundary checks.
		const { task } = await core.createTaskFromInput({ title: "Mislabeled", status: "To Do" }, false);
		await core.filesystem.saveTask({ ...task, status: "Basic: Proposal", pipeline_id: "execution", phase: "proposal" });

		const first = await runBackfill(core);
		expect(first.updated).toContain(task.id);

		const second = await runBackfill(core);
		expect(second.updated).toEqual([]);
	});

	it("corrupted status: in file is masked by parser — phase is canonical, backfill is a no-op", async () => {
		// Post-BACK-664/665: parser derives task.status from phase for engine tasks;
		// a corrupted status: line in the file is invisible to the backfill. Phase is
		// the authoritative truth; terminal-divergence detection via status: is dead code.
		const { task } = await core.createTaskFromInput(
			{ title: "Terminal divergence", pipeline_id: "execution", phase: "needs-human" },
			false,
		);
		// Inject corrupted status directly to simulate a pre-migration file on disk
		// (saveTask's present-gate blocks writing status for engine tasks normally).
		const filepath = await getTaskFilePath(core, task.id);
		const content = await Bun.file(filepath).text();
		const corrupted = content.replace(/^(pipeline_id:)/m, 'status: "Basic: Done"\n$1');
		await writeFile(filepath, corrupted);

		// Parser derives task.status = "Needs Human" from phase, ignoring the corrupted
		// status: field. Backfill sees a consistent state — no update needed.
		const first = await runBackfill(core);
		expect(first.updated).not.toContain(task.id);

		const reloaded = await core.getTask(task.id);
		expect(reloaded?.phase).toBe("needs-human");

		const second = await runBackfill(core);
		expect(second.updated).toEqual([]);
	});
});

async function getTaskFilePath(core: Core, taskId: string): Promise<string> {
	const files = await Array.fromAsync(new Bun.Glob("*.md").scan({ cwd: core.filesystem.tasksDir }));
	const file = files.find((f) => f.toLowerCase().startsWith(`${taskId.toLowerCase()} -`));
	if (!file) throw new Error(`task file for ${taskId} not found`);
	return join(core.filesystem.tasksDir, file);
}
