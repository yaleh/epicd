/**
 * Phase A tests: compound detection + driver branches to decompose handler.
 *
 * isCompound(task) — 100% tree/label-derived (BACK-664.2, no stored role field):
 *   - has subtasks → true
 *   - no subtasks, but kind:epic label → true (pre-decompose epic, BACK-643)
 *   - no subtasks, no kind:epic label → false (primitive)
 *
 * Driver (execution pipeline):
 *   - compound task in machine-phase → calls injected decompose handler, NOT spawn
 *   - primitive task in machine-phase → calls spawn as before
 */

import { describe, expect, it } from "bun:test";
import { displayStatus } from "../core/field-registry.ts";
import { isCompound, isPrimitive } from "../engine/adjudicate.ts";
import type { TaskStore } from "../engine/complete.ts";
import { type DecomposeHandler, Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";

function makeTask(id: string, phase: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase,
		assignee: [],
		labels: [],
		dependencies: [],
		filePath: `/fake/${id}.md`,
		createdDate: "2026-07-04",
		...overrides,
	} as unknown as Task;
}

function makeStore(initial: Task[]): { store: TaskStore; all: () => Task[] } {
	let tasks = [...initial];
	return {
		store: {
			getTask: async (id) => tasks.find((t) => t.id === id) ?? null,
			updateTask: async (updated) => {
				tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
			},
		},
		all: () => tasks,
	};
}

describe("isCompound / isPrimitive", () => {
	it("isCompound returns true when task has kind:epic label and no subtasks", () => {
		const task = makeTask("t1", "ready", { labels: ["kind:epic"] });
		expect(isCompound(task)).toBe(true);
		expect(isPrimitive(task)).toBe(false);
	});

	it("isCompound returns true when task has subtasks", () => {
		const task = makeTask("t2", "ready", { subtasks: ["t2.1", "t2.2"] });
		expect(isCompound(task)).toBe(true);
		expect(isPrimitive(task)).toBe(false);
	});

	it("isCompound returns false when task has no kind:epic label and no subtasks", () => {
		const task = makeTask("t3", "ready");
		expect(isCompound(task)).toBe(false);
		expect(isPrimitive(task)).toBe(true);
	});
});

describe("Driver compound branch", () => {
	it("compound task in machine-phase calls decompose handler, not spawn", async () => {
		const epicTask = makeTask("epic-1", "ready", { labels: ["kind:epic"] });
		const { store, all } = makeStore([epicTask]);

		const spawned: string[] = [];
		const decomposed: string[] = [];

		const worktree: WorktreeOps = {
			spawn: async (task) => {
				spawned.push(task.id);
				return { success: true };
			},
			merge: async () => {},
		};

		const decompose: DecomposeHandler = async (task) => {
			decomposed.push(task.id);
		};

		const driver = new Driver([executionPipeline], store, worktree, undefined, decompose);
		await driver.tick(all());

		expect(spawned).toEqual([]);
		expect(decomposed).toEqual(["epic-1"]);
	});

	it("primitive task in machine-phase calls spawn, not decompose", async () => {
		const primitiveTask = makeTask("prim-1", "ready"); // no kind:epic label, no subtasks → primitive
		const { store, all } = makeStore([primitiveTask]);

		const spawned: string[] = [];
		const decomposed: string[] = [];

		const worktree: WorktreeOps = {
			spawn: async (task) => {
				spawned.push(task.id);
				return { success: true };
			},
			merge: async () => {},
		};

		const decompose: DecomposeHandler = async (task) => {
			decomposed.push(task.id);
		};

		const driver = new Driver([executionPipeline], store, worktree, undefined, decompose);
		await driver.tick(all());

		expect(spawned).toEqual(["prim-1"]);
		expect(decomposed).toEqual([]);
	});

	it("compound task without injected decompose handler routes to needs-human (fallback)", async () => {
		// Old behavior: no decompose handler → needs-human stub
		const epicTask = makeTask("epic-2", "ready", { labels: ["kind:epic"] });
		const { store, all } = makeStore([epicTask]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		// No decompose handler injected
		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		const epic2 = all().find((t) => t.id === "epic-2") as Task;
		expect(epic2.phase).toBe("needs-human");
		expect(displayStatus(epic2)).toBe("Needs Human");
	});

	it("compound task in decomposing phase calls decompose handler", async () => {
		// decomposing is also a machine-actor phase
		const epicTask = makeTask("epic-3", "decomposing", { labels: ["kind:epic"] });
		const { store, all } = makeStore([epicTask]);

		const decomposed: string[] = [];

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const decompose: DecomposeHandler = async (task) => {
			decomposed.push(task.id);
		};

		const driver = new Driver([executionPipeline], store, worktree, undefined, decompose);
		await driver.tick(all());

		expect(decomposed).toEqual(["epic-3"]);
	});
});
