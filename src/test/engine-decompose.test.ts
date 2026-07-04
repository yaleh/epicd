/**
 * Phase B tests: decomposer worker creates children + advances epic to awaiting-children.
 *
 * makeDecomposer(spawnPrimitive) returns a DecomposeHandler that:
 *   1. Calls spawnPrimitive with a brief containing the epic's plan + instructions
 *      to create children with engine fields.
 *   2. On success: advances epic phase → decomposing → awaiting-children.
 *   3. On failure (spawn returns !success): advances epic → needs-human.
 *
 * The brief is built without a worktree path (decompose uses repo root, not worktree).
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
		implementationPlan: "## Sub-Task Decomposition\n\n- Child A\n- Child B",
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

describe("makeDecomposer", () => {
	it("on spawn success: store.updateTask called with phase awaiting-children", async () => {
		const epic = makeEpicTask("epic-1", "decomposing");
		const { store, all } = makeStore([epic]);

		const briefs: string[] = [];
		const fakeSpawn = async (brief: string, _cwd: string): Promise<CompletionResult> => {
			briefs.push(brief);
			return { success: true };
		};

		const decompose = makeDecomposer(fakeSpawn, store);
		await decompose(epic, "/repo/root");

		const updated = all().find((t) => t.id === "epic-1");
		expect(updated?.phase).toBe("awaiting-children");
		expect(briefs.length).toBe(1);
	});

	it("on spawn failure: store.updateTask called with phase needs-human", async () => {
		const epic = makeEpicTask("epic-2", "decomposing");
		const { store, all } = makeStore([epic]);

		const fakeSpawn = async (_brief: string, _cwd: string): Promise<CompletionResult> => {
			return { success: false, error: "worker crashed" };
		};

		const decompose = makeDecomposer(fakeSpawn, store);
		await decompose(epic, "/repo/root");

		const updated = all().find((t) => t.id === "epic-2");
		expect(updated?.phase).toBe("needs-human");
	});

	it("brief contains epic id, title, and instruction to create children", async () => {
		const epic = makeEpicTask("epic-3", "decomposing");
		const { store } = makeStore([epic]);

		const briefs: string[] = [];
		const fakeSpawn = async (brief: string, _cwd: string): Promise<CompletionResult> => {
			briefs.push(brief);
			return { success: true };
		};

		const decompose = makeDecomposer(fakeSpawn, store);
		await decompose(epic, "/repo/root");

		const brief = briefs[0];
		expect(brief).toContain("epic-3");
		expect(brief).toContain("Epic epic-3");
		expect(brief).toContain("backlog task create");
	});

	it("spawn receives repo root as cwd (no worktree)", async () => {
		const epic = makeEpicTask("epic-4", "decomposing");
		const { store } = makeStore([epic]);

		const cwds: string[] = [];
		const fakeSpawn = async (_brief: string, cwd: string): Promise<CompletionResult> => {
			cwds.push(cwd);
			return { success: true };
		};

		const decompose = makeDecomposer(fakeSpawn, store);
		await decompose(epic, "/my/repo");

		expect(cwds).toEqual(["/my/repo"]);
	});
});
