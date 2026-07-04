/**
 * Phase A — Tracer bullet: sandbox board fixpoint
 *
 * Verifies Stage 1 fixpoint discipline:
 *   1. The driver runs a synthetic board to terminal state (no errors).
 *   2. A second identical run is a no-op (idempotent fixpoint).
 */

import { describe, expect, it } from "bun:test";
import type { Pipeline } from "../engine/pipeline.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { hasMachineWork, makeMemoryStore, runToFixpoint } from "../engine/sandbox.ts";
import type { Task } from "../types/index.ts";

// Minimal two-phase pipeline for sandbox tests: ready → done
const sandboxPipeline: Pipeline = {
	id: "sandbox",
	states: [
		{ name: "ready", actor: "machine" },
		{ name: "done", actor: "none" },
	],
};

function makeTask(id: string, phase: string, pipeline_id = "sandbox"): Task {
	return {
		id,
		title: `Synthetic task ${id}`,
		status: "Basic: Ready",
		pipeline_id,
		phase,
		filePath: `/sandbox/${id}.md`,
		body: "",
	} as unknown as Task;
}

describe("engine-tracer-fixpoint — Stage 1 sandbox convergence", () => {
	it("drives a single task to terminal state with no errors", async () => {
		const result = await runToFixpoint([makeTask("s-1", "ready")], [sandboxPipeline]);

		expect(result.ticks).toBeGreaterThan(0);
		const task = result.tasks.find((t) => t.id === "s-1");
		expect(task?.phase).toBe("done");
	});

	it("drives all tasks to terminal state — no machine-phase tasks remain", async () => {
		const tasks = [makeTask("s-1", "ready"), makeTask("s-2", "ready"), makeTask("s-3", "ready")];

		const result = await runToFixpoint(tasks, [sandboxPipeline]);

		const remaining = hasMachineWork(result.tasks, [sandboxPipeline]);
		expect(remaining).toBe(false);
		for (const t of result.tasks) {
			expect(t.phase).toBe("done");
		}
	});

	it("second run is a no-op — idempotent fixpoint (Stage 1)", async () => {
		const tasks = [makeTask("s-1", "ready"), makeTask("s-2", "ready")];

		const first = await runToFixpoint(tasks, [sandboxPipeline]);
		// All tasks are now in terminal state
		const second = await runToFixpoint(first.tasks, [sandboxPipeline]);

		// No additional ticks: no machine work was found
		expect(second.ticks).toBe(0);
		// Task states are unchanged
		expect(second.tasks.map((t) => t.phase)).toEqual(first.tasks.map((t) => t.phase));
	});

	it("routes primitive task to done via role branching (not linear advance)", async () => {
		// Primitive task (no subtasks) + stub spawn success:
		//   ready(machine) → adjudicate → done(none)
		// Role-based routing skips decomposing/evaluating for primitive tasks.
		const task = makeTask("e-1", "ready", "execution");
		const result = await runToFixpoint([task], [executionPipeline]);

		const finalTask = result.tasks.find((t) => t.id === "e-1");
		// Primitive + success → adjudicate → done (not awaiting-children)
		expect(finalTask?.phase).toBe("done");
	});

	it("hasMachineWork returns false when all tasks are in terminal phases", () => {
		const tasks = [makeTask("s-1", "done"), makeTask("s-2", "done")];
		expect(hasMachineWork(tasks, [sandboxPipeline])).toBe(false);
	});

	it("hasMachineWork returns true when any task is in a machine phase", () => {
		const tasks = [makeTask("s-1", "done"), makeTask("s-2", "ready")];
		expect(hasMachineWork(tasks, [sandboxPipeline])).toBe(true);
	});

	it("makeMemoryStore getTask returns null for unknown id", async () => {
		const { store } = makeMemoryStore([makeTask("s-1", "ready")]);
		const result = await store.getTask("nonexistent");
		expect(result).toBeNull();
	});

	it("makeMemoryStore updateTask replaces the task in place", async () => {
		const task = makeTask("s-1", "ready");
		const { store, all } = makeMemoryStore([task]);

		const updated = { ...task, phase: "done" } as unknown as Task;
		await store.updateTask(updated);

		expect(all().find((t) => t.id === "s-1")?.phase).toBe("done");
	});
});
