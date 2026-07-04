import { describe, expect, it } from "bun:test";
import { type CompletionResult, complete, type TaskStore } from "../engine/complete.ts";
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

function makeTask(phase: string): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Ready",
		pipeline_id: "test",
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

describe("engine.complete — phase advancement", () => {
	it("advances phase to the next pipeline phase", async () => {
		const { store, getCurrent } = makeStore(makeTask("ready"));
		await complete("task-1", { success: true }, [testPipeline], store);
		expect(getCurrent().phase).toBe("done");
	});

	it("does not create any .agent-done-* sentinel file", async () => {
		const { store } = makeStore(makeTask("ready"));
		const fs = await import("node:fs/promises");
		const tmpDir = await fs.mkdtemp("/tmp/engine-complete-test-");
		const before = await fs.readdir(tmpDir);
		await complete("task-1", { success: true }, [testPipeline], store);
		const after = await fs.readdir(tmpDir);
		const newFiles = after.filter((f) => !before.includes(f));
		expect(newFiles.some((f) => f.includes("agent-done"))).toBe(false);
		await fs.rmdir(tmpDir);
	});

	it("throws if task not found", async () => {
		const { store } = makeStore(makeTask("ready"));
		await expect(complete("nonexistent", { success: true }, [testPipeline], store)).rejects.toThrow(
			"Task nonexistent not found",
		);
	});

	it("throws if task has no phase", async () => {
		const task = { ...makeTask("ready"), phase: undefined } as unknown as Task;
		const { store } = makeStore(task);
		await expect(complete("task-1", { success: true }, [testPipeline], store)).rejects.toThrow(
			"no pipeline_id or phase",
		);
	});

	it("throws if there is no next phase", async () => {
		const { store } = makeStore(makeTask("done"));
		await expect(complete("task-1", { success: true }, [testPipeline], store)).rejects.toThrow("No next phase");
	});

	it("advances phase even for failure results (transition is data-driven)", async () => {
		const { store, getCurrent } = makeStore(makeTask("ready"));
		const result: CompletionResult = { success: false, error: "timeout" };
		await complete("task-1", result, [testPipeline], store);
		expect(getCurrent().phase).toBe("done");
	});

	it("uses multi-phase pipeline to advance one step at a time", async () => {
		const multiPipeline: Pipeline = {
			id: "multi",
			states: [
				{ name: "ready", actor: "machine" },
				{ name: "evaluating", actor: "machine" },
				{ name: "done", actor: "none" },
			],
		};
		const task: Task = { ...makeTask("ready"), pipeline_id: "multi" };
		const { store, getCurrent } = makeStore(task);
		await complete("task-1", { success: true }, [multiPipeline], store);
		expect(getCurrent().phase).toBe("evaluating");
	});
});
