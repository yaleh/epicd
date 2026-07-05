/**
 * makeLocalIssueSource (BACK-601.1): the sole IssueSource implementation, delegating
 * to Core/FileSystem. Covers list/get/upsert per the interface contract in
 * src/engine/store.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { makeLocalIssueSource } from "../engine/store.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

async function createTask(core: Core, title: string, overrides: Partial<Task> = {}): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withOverrides: Task = { ...task, pipeline_id: "execution", ...overrides };
	await core.updateTask(withOverrides, false);
	return withOverrides;
}

describe("makeLocalIssueSource", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-store-issuesource");
		core = new Core(projectRoot);
		await initializeTestProject(core, "issuesource-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	describe("list", () => {
		it("returns all tasks when no filter is given", async () => {
			const a = await createTask(core, "A", { phase: "ready" });
			const b = await createTask(core, "B", { phase: "done" });

			const source = makeLocalIssueSource(core);
			const tasks = await source.list();

			expect(tasks.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
		});

		it("filters by pipeline_id", async () => {
			const a = await createTask(core, "A", { pipeline_id: "execution" });
			await createTask(core, "B", { pipeline_id: "other" });

			const source = makeLocalIssueSource(core);
			const tasks = await source.list({ pipeline_id: "execution" });

			expect(tasks.map((t) => t.id)).toEqual([a.id]);
		});

		it("filters by phase", async () => {
			const a = await createTask(core, "A", { phase: "ready" });
			await createTask(core, "B", { phase: "done" });

			const source = makeLocalIssueSource(core);
			const tasks = await source.list({ phase: "ready" });

			expect(tasks.map((t) => t.id)).toEqual([a.id]);
		});

		it("filters by parent_id", async () => {
			const epic = await createTask(core, "Epic", { phase: "awaiting-children" });
			const child = await createTask(core, "Child", { parent_id: epic.id });
			await createTask(core, "Unrelated");

			const source = makeLocalIssueSource(core);
			const tasks = await source.list({ parent_id: epic.id });

			expect(tasks.map((t) => t.id)).toEqual([child.id]);
		});

		it("combines multiple filter fields with AND semantics", async () => {
			const epic = await createTask(core, "Epic", { phase: "awaiting-children" });
			const matching = await createTask(core, "Match", { phase: "ready", parent_id: epic.id });
			await createTask(core, "WrongPhase", { phase: "done", parent_id: epic.id });

			const source = makeLocalIssueSource(core);
			const tasks = await source.list({ phase: "ready", parent_id: epic.id });

			expect(tasks.map((t) => t.id)).toEqual([matching.id]);
		});
	});

	describe("get", () => {
		it("returns the task for an existing id", async () => {
			const a = await createTask(core, "A");

			const source = makeLocalIssueSource(core);
			const fetched = await source.get(a.id);

			expect(fetched?.id).toBe(a.id);
		});

		it("returns null for a missing id", async () => {
			const source = makeLocalIssueSource(core);
			const fetched = await source.get("TASK-999");

			expect(fetched).toBeNull();
		});
	});

	describe("upsert", () => {
		it("creates a new task when no id is given", async () => {
			const source = makeLocalIssueSource(core);
			const created = await source.upsert({ title: "New task", pipeline_id: "execution", phase: "ready" });

			expect(created.id).toBeTruthy();
			expect(created.title).toBe("New task");

			const reloaded = await core.getTask(created.id);
			expect(reloaded?.phase).toBe("ready");
		});

		it("updates an existing task when an id is given", async () => {
			const a = await createTask(core, "A", { phase: "ready" });

			const source = makeLocalIssueSource(core);
			const updated = await source.upsert({ id: a.id, phase: "done" });

			expect(updated.phase).toBe("done");

			const reloaded = await core.getTask(a.id);
			expect(reloaded?.phase).toBe("done");
		});

		it("derives status from phase on update, per BACK-627's centralized derivation", async () => {
			const a = await createTask(core, "A", { phase: "ready" });

			const source = makeLocalIssueSource(core);
			const updated = await source.upsert({ id: a.id, phase: "done" });

			expect(updated.status).toBe("Basic: Done");
		});
	});
});
