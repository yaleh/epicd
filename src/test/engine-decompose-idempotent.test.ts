/**
 * Phase C tests: idempotency guard for decompose.
 *
 * The driver wraps compound handlers in withCapGuard (same as primitive).
 * Additionally, if the epic already has children (subtasks.length > 0),
 * the decomposer skips re-spawning and advances to awaiting-children directly.
 *
 * Idempotency strategy (two layers):
 *   1. withCapGuard (already in driver) — prevents re-running after cap marker set.
 *   2. "already-has-children" guard inside decomposer — if subtasks exist, skip spawn.
 */

import { describe, expect, it } from "bun:test";
import type { CompletionResult, TaskStore } from "../engine/complete.ts";
import { makeDecomposer } from "../harness/decomposer.ts";
import type { Task } from "../types/index.ts";

function makeEpicTask(id: string, phase: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		title: `Epic ${id}`,
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase,
		role: "compound" as const,
		assignee: [],
		labels: [],
		dependencies: [],
		filePath: `/fake/${id}.md`,
		createdDate: "2026-07-04",
		implementationPlan: "## Sub-Task Decomposition\n\n- Child A",
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

describe("decomposer idempotency", () => {
	it("does not call spawn when epic already has subtasks (children exist)", async () => {
		// Epic already has children (decomposed in a previous run)
		const epic = makeEpicTask("epic-1", "decomposing", {
			subtasks: ["epic-1.1", "epic-1.2"],
		});
		const { store, all } = makeStore([epic]);

		let spawnCalled = 0;
		const fakeSpawn = async (_brief: string, _cwd: string): Promise<CompletionResult> => {
			spawnCalled++;
			return { success: true };
		};

		const decompose = makeDecomposer(fakeSpawn, store);
		await decompose(epic, "/repo/root");

		// spawn NOT called — idempotent skip
		expect(spawnCalled).toBe(0);
		// Phase still advances to awaiting-children (consistent state)
		expect(all().find((t) => t.id === "epic-1")?.phase).toBe("awaiting-children");
	});

	it("calls spawn when epic has no subtasks (first decompose)", async () => {
		const epic = makeEpicTask("epic-2", "decomposing");
		const { store, all } = makeStore([epic]);

		let spawnCalled = 0;
		const fakeSpawn = async (_brief: string, _cwd: string): Promise<CompletionResult> => {
			spawnCalled++;
			return { success: true };
		};

		const decompose = makeDecomposer(fakeSpawn, store);
		await decompose(epic, "/repo/root");

		expect(spawnCalled).toBe(1);
		expect(all().find((t) => t.id === "epic-2")?.phase).toBe("awaiting-children");
	});

	it("re-running decompose when children exist is safe (no duplicate children)", async () => {
		// Simulate a second driver tick on an already-decomposed epic
		const epic = makeEpicTask("epic-3", "decomposing", {
			subtasks: ["epic-3.1"],
		});
		const { store } = makeStore([epic]);

		const spawnCalls: string[] = [];
		const fakeSpawn = async (brief: string, _cwd: string): Promise<CompletionResult> => {
			spawnCalls.push(brief);
			return { success: true };
		};

		const decompose = makeDecomposer(fakeSpawn, store);

		// Call twice — both must be idempotent
		await decompose(epic, "/repo/root");
		await decompose(epic, "/repo/root");

		// Spawn never called — children already exist
		expect(spawnCalls.length).toBe(0);
	});
});
