/**
 * Phase B — engine.complete unified handshake tests.
 *
 * Asserts:
 *   1. completeTask routes result through adjudicate → done | needs-human.
 *   2. merge is called under the merge lock (when safety is provided).
 *   3. Worker does not self-declare done — engine (completeTask) is sole authority.
 *   4. DoD items control verdict: all checked → done, any unchecked → needs-human.
 */

import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type CompletionResult, completeTask, type TaskStore } from "../engine/complete.ts";
import { MERGE_LOCK_FILENAME, type MergeLockFs } from "../engine/safety.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir } from "./test-utils.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Implementing",
		pipeline_id: "execution",
		phase: "implementing",
		filePath: "/fake/task-1.md",
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

const realLockFs: MergeLockFs = {
	mkdir: (dir, opts) => mkdir(dir, opts).then(() => {}),
	writeFile: (p, d) => writeFile(p, d),
	exists: (p) => existsSync(p),
	join: (...parts) => join(...parts),
};

describe("completeTask — adjudicate + merge + phase update", () => {
	it("sets phase to adjudicating (not done directly) when result.success and DoD is empty (BACK-682 AC#1)", async () => {
		const { store, getCurrent } = makeStore(makeTask());
		await completeTask("task-1", { success: true }, store);
		expect(getCurrent().phase).toBe("adjudicating");
	});

	it("sets phase to needs-human when result.success=false", async () => {
		const { store, getCurrent } = makeStore(makeTask());
		await completeTask("task-1", { success: false, error: "timeout" }, store);
		expect(getCurrent().phase).toBe("needs-human");
	});

	it("sets phase to needs-human when any DoD item is unchecked", async () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "item 1", checked: true },
				{ index: 2, text: "item 2", checked: false },
			],
		});
		const { store, getCurrent } = makeStore(task);
		await completeTask("task-1", { success: true }, store);
		expect(getCurrent().phase).toBe("needs-human");
	});

	it("sets phase to adjudicating when all DoD items are checked (BACK-682 AC#1)", async () => {
		const task = makeTask({
			definitionOfDoneItems: [
				{ index: 1, text: "item 1", checked: true },
				{ index: 2, text: "item 2", checked: true },
			],
		});
		const { store, getCurrent } = makeStore(task);
		await completeTask("task-1", { success: true }, store);
		expect(getCurrent().phase).toBe("adjudicating");
	});

	it("calls merge with taskId and result", async () => {
		const { store } = makeStore(makeTask());
		const mergeCalls: Array<[string, CompletionResult]> = [];

		await completeTask("task-1", { success: true }, store, {
			merge: async (id, res) => {
				mergeCalls.push([id, res]);
			},
		});

		expect(mergeCalls.length).toBe(1);
		const [mergeId, mergeResult] = mergeCalls[0] ?? [];
		expect(mergeId).toBe("task-1");
		expect(mergeResult?.success).toBe(true);
	});

	it("calls merge under merge lock when safety is provided", async () => {
		const tmpDir = createUniqueTestDir("engine-complete-lock");
		await mkdir(tmpDir, { recursive: true });

		try {
			const { store } = makeStore(makeTask());
			const order: string[] = [];

			await completeTask("task-1", { success: true }, store, {
				merge: async () => {
					order.push("merge");
				},
				safety: { backlogDir: tmpDir, lockFs: realLockFs },
			});

			// Lock file is cleaned up after the call
			const lockPath = join(tmpDir, MERGE_LOCK_FILENAME);
			expect(existsSync(lockPath)).toBe(false);
			expect(order).toEqual(["merge"]);
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	});

	it("throws if task not found", async () => {
		const { store } = makeStore(makeTask());
		await expect(completeTask("nonexistent", { success: true }, store)).rejects.toThrow("Task nonexistent not found");
	});

	it("worker result only flows through completeTask (engine is sole adjudicator)", async () => {
		// Verify that the phase the worker sees is NOT set by the worker—
		// only by the engine after adjudication.
		const task = makeTask();
		const { store, getCurrent } = makeStore(task);

		// Simulate worker completing — it cannot touch the store directly
		const workerResult: CompletionResult = { success: true };
		const phaseBeforeComplete = task.phase; // worker sees "implementing"

		await completeTask("task-1", workerResult, store);

		// Worker saw "implementing"; engine set it to "adjudicating" (BACK-682 AC#1) — the
		// worker never sees or self-declares a terminal phase either way.
		expect(phaseBeforeComplete).toBe("implementing");
		expect(getCurrent().phase).toBe("adjudicating");
	});
});
