/**
 * Phase B — Role branching + DoD adjudication tests
 *
 * Asserts:
 *   1. isPrimitive correctly identifies leaf vs compound tasks.
 *   2. adjudicate() returns done on success (no DoD items / all checked).
 *   3. adjudicate() returns needs-human on failure or unchecked DoD items.
 *   4. Driver routes primitive tasks: success → done, failure → needs-human.
 *   5. Driver routes compound tasks (has subtasks) → needs-human (stub).
 */

import { describe, expect, it } from "bun:test";
import { adjudicate, isPrimitive } from "../engine/adjudicate.ts";
import type { TaskStore } from "../engine/complete.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase: "ready",
		assignee: [],
		labels: [],
		dependencies: [],
		body: "",
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

// ── isPrimitive ─────────────────────────────────────────────────────────────

describe("isPrimitive", () => {
	it("returns true when task has no subtasks field", () => {
		expect(isPrimitive(makeTask())).toBe(true);
	});

	it("returns true when subtasks is an empty array", () => {
		expect(isPrimitive(makeTask({ subtasks: [] }))).toBe(true);
	});

	it("returns false when task has subtasks", () => {
		expect(isPrimitive(makeTask({ subtasks: ["child-1", "child-2"] }))).toBe(false);
	});
});

// ── adjudicate ──────────────────────────────────────────────────────────────

describe("adjudicate", () => {
	it("returns done when result is success and no DoD items", () => {
		expect(adjudicate(makeTask(), { success: true })).toBe("done");
	});

	it("returns done when result is success and all DoD items are checked", () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "tests pass", checked: true },
				{ index: 2, text: "lint passes", checked: true },
			],
		});
		expect(adjudicate(task, { success: true })).toBe("done");
	});

	it("returns needs-human when result is failure", () => {
		expect(adjudicate(makeTask(), { success: false, error: "timeout" })).toBe("needs-human");
	});

	it("returns needs-human when any DoD item is unchecked", () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "tests pass", checked: true },
				{ index: 2, text: "lint passes", checked: false },
			],
		});
		expect(adjudicate(task, { success: true })).toBe("needs-human");
	});

	it("failure takes precedence over DoD items (even if all checked, failure wins)", () => {
		const task = makeTask({
			definitionOfDoneItems: [{ index: 1, text: "done", checked: true }],
		});
		expect(adjudicate(task, { success: false })).toBe("needs-human");
	});

	it("returns done for empty DoD items array", () => {
		expect(adjudicate(makeTask({ definitionOfDoneItems: [] }), { success: true })).toBe("done");
	});
});

// ── Driver role branching ────────────────────────────────────────────────────

describe("Driver – role branching + DoD adjudication", () => {
	it("routes primitive task with success result to done", async () => {
		const task = makeTask({ id: "prim-1" }); // no subtasks → primitive
		const { store, all } = makeStore([task]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "prim-1")?.phase).toBe("done");
	});

	it("routes primitive task with failure result to needs-human", async () => {
		const task = makeTask({ id: "prim-2" });
		const { store, all } = makeStore([task]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: false, error: "agent crashed" }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "prim-2")?.phase).toBe("needs-human");
	});

	it("routes primitive task with unchecked DoD to needs-human despite spawn success", async () => {
		const task = makeTask({
			id: "prim-3",
			definitionOfDoneItems: [
				{ index: 1, text: "tests pass", checked: true },
				{ index: 2, text: "docs updated", checked: false },
			],
		});
		const { store, all } = makeStore([task]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "prim-3")?.phase).toBe("needs-human");
	});

	it("routes compound task (has subtasks) to needs-human without calling spawn", async () => {
		const task = makeTask({
			id: "comp-1",
			subtasks: ["child-a", "child-b"],
		});
		const { store, all } = makeStore([task]);

		let spawnCalled = false;
		const worktree: WorktreeOps = {
			spawn: async () => {
				spawnCalled = true;
				return { success: true };
			},
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "comp-1")?.phase).toBe("needs-human");
		expect(spawnCalled).toBe(false);
	});

	it("leaves done task unchanged on re-tick (non-machine phase)", async () => {
		const task = makeTask({ id: "done-1", phase: "done" });
		const { store, all } = makeStore([task]);

		let spawnCalled = false;
		const worktree: WorktreeOps = {
			spawn: async () => {
				spawnCalled = true;
				return { success: true };
			},
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "done-1")?.phase).toBe("done");
		expect(spawnCalled).toBe(false);
	});

	it("complete() is NOT called — driver updates phase directly (no linear advance)", async () => {
		// Verify: primitive success goes straight to done, skipping decomposing/evaluating
		const task = makeTask({ id: "prim-direct" });
		const { store, all } = makeStore([task]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		const result = all().find((t) => t.id === "prim-direct");
		// Must jump to done, NOT to the linearly-next phase (decomposing)
		expect(result?.phase).toBe("done");
		expect(result?.phase).not.toBe("decomposing");
		expect(result?.phase).not.toBe("evaluating");
	});
});
