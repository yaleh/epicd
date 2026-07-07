import { describe, expect, it } from "bun:test";
import { completeAdjudication, completeTask, type TaskStore } from "../engine/complete.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";

function makeTask(phase: string): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase,
		filePath: "/fake/task-1.md",
		body: "",
	} as unknown as Task;
}

function makeStore(initial: Task): { store: TaskStore; getCurrent: () => Task } {
	let current = initial;
	return {
		store: {
			getTask: async (id) => (id === current.id ? current : null),
			updateTask: async (task) => {
				current = task;
			},
		},
		getCurrent: () => current,
	};
}

describe("executionPipeline — adjudicating phase (BACK-682 AC#1)", () => {
	it("declares an adjudicating machine-actor phase", () => {
		expect(executionPipeline.states).toContainEqual({ name: "adjudicating", actor: "machine" });
	});

	it("keeps needs-human and done as the final two states, adjudicating right before needs-human", () => {
		const names = executionPipeline.states.map((s) => s.name);
		const adjIdx = names.indexOf("adjudicating");
		expect(adjIdx).toBeGreaterThan(-1);
		expect(names[adjIdx + 1]).toBe("needs-human");
		expect(names[adjIdx + 2]).toBe("done");
	});

	it("primitive completion path is ready -> adjudicating -> done, not ready -> done", async () => {
		const { store, getCurrent } = makeStore(makeTask("ready"));

		// Step 1: DoD-green primitive completion — routes to "adjudicating", not "done".
		await completeTask("task-1", { success: true, dodResults: [{ cmd: "true", passed: true }] }, store);
		expect(getCurrent().phase).toBe("adjudicating");

		// Step 2: independent judgmental audit resolves adjudicating -> done.
		await completeAdjudication("task-1", "done", store);
		expect(getCurrent().phase).toBe("done");
	});

	it("a DoD-red primitive still routes straight to needs-human (unaffected by adjudicating)", async () => {
		const { store, getCurrent } = makeStore(makeTask("ready"));
		await completeTask("task-1", { success: true, dodResults: [{ cmd: "false", passed: false }] }, store);
		expect(getCurrent().phase).toBe("needs-human");
	});
});
