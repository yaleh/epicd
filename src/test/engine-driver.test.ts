import { describe, expect, it } from "bun:test";
import type { TaskStore } from "../engine/complete.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import type { Pipeline } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";

// Minimal two-phase test pipeline: ready(machine) → done(none)
const testPipeline: Pipeline = {
	id: "test",
	states: [
		{ name: "ready", actor: "machine" },
		{ name: "done", actor: "none" },
	],
};

function makeTask(id: string, phase: string): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		pipeline_id: "test",
		phase,
		filePath: `/fake/${id}.md`,
		body: "",
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

describe("Driver detect→spawn→merge→advance loop", () => {
	it("drives a ready task to done via stub worktree", async () => {
		const { store, all } = makeStore([makeTask("task-1", "ready")]);
		const mergedIds: string[] = [];

		const worktree: WorktreeOps = {
			spawn: async (_task) => ({ success: true }),
			merge: async (taskId, _result) => {
				mergedIds.push(taskId);
			},
		};

		const driver = new Driver([testPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "task-1")?.phase).toBe("done");
		expect(mergedIds).toEqual(["task-1"]);
	});

	it("does not spawn tasks in non-machine phases", async () => {
		const { store, all } = makeStore([makeTask("task-1", "done")]);
		const spawned: string[] = [];

		const worktree: WorktreeOps = {
			spawn: async (task) => {
				spawned.push(task.id);
				return { success: true };
			},
			merge: async () => {},
		};

		const driver = new Driver([testPipeline], store, worktree);
		await driver.tick(all());

		expect(spawned).toEqual([]);
		expect(all().find((t) => t.id === "task-1")?.phase).toBe("done"); // unchanged
	});

	it("handles multiple ready tasks in a single tick", async () => {
		const { store, all } = makeStore([
			makeTask("task-a", "ready"),
			makeTask("task-b", "ready"),
			makeTask("task-c", "done"),
		]);

		const worktree: WorktreeOps = {
			spawn: async (_task) => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([testPipeline], store, worktree);
		await driver.tick(all());

		expect(all().find((t) => t.id === "task-a")?.phase).toBe("done");
		expect(all().find((t) => t.id === "task-b")?.phase).toBe("done");
		expect(all().find((t) => t.id === "task-c")?.phase).toBe("done"); // already terminal
	});

	it("reaches a terminal state with no errors for a success result", async () => {
		const { store, all } = makeStore([makeTask("task-1", "ready")]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true, output: "finished" }),
			merge: async () => {},
		};

		const driver = new Driver([testPipeline], store, worktree);
		await expect(driver.tick(all())).resolves.toBeUndefined();
		expect(all().find((t) => t.id === "task-1")?.phase).toBe("done");
	});

	it("adjudicates to done for a primitive task with success result", async () => {
		// Primitive task (no subtasks) in "ready" → spawn (success) → adjudicate → done
		const { executionPipeline } = await import("../engine/pipeline.ts");
		const task: Task = {
			...makeTask("task-1", "ready"),
			pipeline_id: "execution",
		};
		const { store, all } = makeStore([task]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const driver = new Driver([executionPipeline], store, worktree);
		await driver.tick(all());

		// primitive + success → adjudicate → done (role-based routing, not linear complete)
		expect(all().find((t) => t.id === "task-1")?.phase).toBe("done");
	});
});
