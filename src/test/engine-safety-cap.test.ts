import { describe, expect, it } from "bun:test";
import { hasCapMarker, addCapMarker, withCapGuard } from "../engine/safety.ts";
import type { Task } from "../types/index.ts";
import type { TaskStore } from "../engine/complete.ts";

function makeTask(id: string, cap?: Task["cap"]): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		filePath: `/fake/${id}.md`,
		body: "",
		cap,
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

describe("hasCapMarker", () => {
	it("returns false when task has no cap markers", () => {
		expect(hasCapMarker(makeTask("t1"), "deploy")).toBe(false);
	});

	it("returns false when no marker matches the phase", () => {
		const task = makeTask("t1", [{ phase: "build", done: true }]);
		expect(hasCapMarker(task, "deploy")).toBe(false);
	});

	it("returns false when marker exists but done is false", () => {
		const task = makeTask("t1", [{ phase: "deploy", done: false }]);
		expect(hasCapMarker(task, "deploy")).toBe(false);
	});

	it("returns true when a matching done marker exists", () => {
		const task = makeTask("t1", [{ phase: "deploy", done: true }]);
		expect(hasCapMarker(task, "deploy")).toBe(true);
	});
});

describe("addCapMarker", () => {
	it("appends a done marker without mutating the original task", () => {
		const original = makeTask("t1");
		const updated = addCapMarker(original, "deploy");
		expect(hasCapMarker(updated, "deploy")).toBe(true);
		expect(original.cap).toBeUndefined(); // original unchanged
	});

	it("preserves existing markers", () => {
		const task = makeTask("t1", [{ phase: "build", done: true }]);
		const updated = addCapMarker(task, "deploy");
		expect(hasCapMarker(updated, "build")).toBe(true);
		expect(hasCapMarker(updated, "deploy")).toBe(true);
	});
});

describe("withCapGuard – cap idempotency", () => {
	it("executes fn and persists the cap marker on first call", async () => {
		const task = makeTask("t1");
		const { store, all } = makeStore([task]);
		let callCount = 0;

		const result = await withCapGuard(
			task,
			"evaluate",
			async () => {
				callCount++;
				return "result";
			},
			store,
		);

		expect(result).toBe("result");
		expect(callCount).toBe(1);
		expect(hasCapMarker(all().find((t) => t.id === "t1")!, "evaluate")).toBe(true);
	});

	it("skips fn and returns undefined when cap marker already exists (restart simulation)", async () => {
		const task = makeTask("t1", [{ phase: "evaluate", done: true }]);
		const { store } = makeStore([task]);
		let callCount = 0;

		const result = await withCapGuard(
			task,
			"evaluate",
			async () => {
				callCount++;
				return "should not run";
			},
			store,
		);

		expect(result).toBeUndefined();
		expect(callCount).toBe(0); // no double-execution
	});

	it("does not write the cap marker when fn throws", async () => {
		const task = makeTask("t1");
		const { store, all } = makeStore([task]);

		await expect(
			withCapGuard(
				task,
				"evaluate",
				async () => {
					throw new Error("phase failed");
				},
				store,
			),
		).rejects.toThrow("phase failed");

		// Marker must NOT be written – a restart should retry the phase
		expect(hasCapMarker(all().find((t) => t.id === "t1")!, "evaluate")).toBe(false);
	});

	it("multiple phases guard independently", async () => {
		const task = makeTask("t1", [{ phase: "build", done: true }]);
		const { store, all } = makeStore([task]);
		const calls: string[] = [];

		// "build" is already done – skip
		await withCapGuard(task, "build", async () => { calls.push("build"); }, store);
		// "evaluate" is new – run
		await withCapGuard(task, "evaluate", async () => { calls.push("evaluate"); }, store);

		expect(calls).toEqual(["evaluate"]);
		expect(hasCapMarker(all().find((t) => t.id === "t1")!, "evaluate")).toBe(true);
	});
});
