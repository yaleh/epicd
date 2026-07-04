/**
 * Phase C — ENG-8 adjudicate + completeTask composite-sequence tests.
 *
 * Composite ordering (ENG-8 + 605.2 merge):
 *  (1) dodResults any fail → needs-human (skip merge).
 *  (2) dodResults all pass → attempt merge; conflict → needs-human.
 *  (3) dodResults all pass + merge ok → done.
 *
 * Additional invariants:
 *  - Worker ticking checkboxes cannot override dodResults failure.
 *  - Empty dodResults → needs-human (engine cannot verify work).
 *  - No dodResults (legacy) → falls back to checkbox scan.
 */

import { describe, expect, it } from "bun:test";
import { adjudicate } from "../engine/adjudicate.ts";
import { type CompletionResult, completeTask, type TaskStore } from "../engine/complete.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-eng8",
		title: "ENG-8 Test",
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase: "ready",
		filePath: "/fake/task-eng8.md",
		body: "",
		...overrides,
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

// ── adjudicate (ENG-8 dodResults path) ─────────────────────────────────────

describe("adjudicate — ENG-8 dodResults path", () => {
	it("returns done when dodResults all pass", () => {
		const result: CompletionResult = {
			success: true,
			dodResults: [
				{ cmd: "true", passed: true },
				{ cmd: "echo ok", passed: true },
			],
		};
		expect(adjudicate(makeTask(), result)).toBe("done");
	});

	it("returns needs-human when any dodResult fails", () => {
		const result: CompletionResult = {
			success: true,
			dodResults: [
				{ cmd: "true", passed: true },
				{ cmd: "false", passed: false },
			],
		};
		expect(adjudicate(makeTask(), result)).toBe("needs-human");
	});

	it("returns needs-human when dodResults is empty (engine cannot verify)", () => {
		const result: CompletionResult = {
			success: true,
			dodResults: [],
		};
		expect(adjudicate(makeTask(), result)).toBe("needs-human");
	});

	it("shell truth wins — checked checkbox cannot override dodResults failure", () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "false", checked: true }, // worker ticked this
			],
		});
		const result: CompletionResult = {
			success: true,
			dodResults: [{ cmd: "false", passed: false }],
		};
		expect(adjudicate(task, result)).toBe("needs-human");
	});

	it("returns needs-human when spawn failed, even with dodResults all passing", () => {
		const result: CompletionResult = {
			success: false,
			dodResults: [{ cmd: "true", passed: true }],
		};
		expect(adjudicate(makeTask(), result)).toBe("needs-human");
	});
});

// ── adjudicate — legacy fallback (no dodResults) ────────────────────────────

describe("adjudicate — legacy checkbox fallback (no dodResults)", () => {
	it("returns done when no dodResults and no DoD items", () => {
		expect(adjudicate(makeTask(), { success: true })).toBe("done");
	});

	it("returns done when no dodResults and all DoD items checked", () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "item 1", checked: true },
				{ index: 2, text: "item 2", checked: true },
			],
		});
		expect(adjudicate(task, { success: true })).toBe("done");
	});

	it("returns needs-human when no dodResults and any DoD item unchecked", () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "item 1", checked: true },
				{ index: 2, text: "item 2", checked: false },
			],
		});
		expect(adjudicate(task, { success: true })).toBe("needs-human");
	});
});

// ── completeTask — composite sequence (ENG-8 + 605.2) ──────────────────────

describe("completeTask — ENG-8 composite sequence", () => {
	it("(1) dodResults any fail → needs-human, merge is NOT called", async () => {
		const { store, getCurrent } = makeStore(makeTask());
		let mergeCalled = false;

		await completeTask("task-eng8", { success: true, dodResults: [{ cmd: "false", passed: false }] }, store, {
			merge: async () => {
				mergeCalled = true;
			},
		});

		expect(getCurrent().phase).toBe("needs-human");
		expect(mergeCalled).toBe(false);
	});

	it("(1) empty dodResults → needs-human, merge is NOT called", async () => {
		const { store, getCurrent } = makeStore(makeTask());
		let mergeCalled = false;

		await completeTask("task-eng8", { success: true, dodResults: [] }, store, {
			merge: async () => {
				mergeCalled = true;
			},
		});

		expect(getCurrent().phase).toBe("needs-human");
		expect(mergeCalled).toBe(false);
	});

	it("(2) dodResults all pass + merge conflict → needs-human", async () => {
		const { store, getCurrent } = makeStore(makeTask());

		await completeTask("task-eng8", { success: true, dodResults: [{ cmd: "true", passed: true }] }, store, {
			merge: async () => ({ conflict: true }),
		});

		expect(getCurrent().phase).toBe("needs-human");
	});

	it("(3) dodResults all pass + merge ok → done", async () => {
		const { store, getCurrent } = makeStore(makeTask());

		await completeTask("task-eng8", { success: true, dodResults: [{ cmd: "true", passed: true }] }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(getCurrent().phase).toBe("done");
	});

	it("(3) dodResults all pass + no merge option → done", async () => {
		const { store, getCurrent } = makeStore(makeTask());

		await completeTask("task-eng8", { success: true, dodResults: [{ cmd: "true", passed: true }] }, store);

		expect(getCurrent().phase).toBe("done");
	});

	it("worker self-attestation (checkbox only) cannot override dod shell failure", async () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "false", checked: true }, // worker ticked — shell says false
			],
		});
		const { store, getCurrent } = makeStore(task);

		await completeTask("task-eng8", { success: true, dodResults: [{ cmd: "false", passed: false }] }, store);

		expect(getCurrent().phase).toBe("needs-human");
	});
});
