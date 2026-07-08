/**
 * Phase B — spawn seam DoD runner integration tests (ENG-8).
 *
 * Asserts:
 *  1. realSpawn with no dodRunner behaves identically to the pre-ENG-8 4-arg form.
 *  2. realSpawn with a dodRunner calls it inside the worktree (worktree still alive).
 *  3. dodResults are merged into the returned CompletionResult.
 *  4. Worktree is cleaned up after dodRunner runs (try/finally still fires).
 *  5. Engine core (src/engine) contains no Bun.spawn or child_process calls.
 */

import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CompletionResult } from "../engine/complete.ts";
import type { WorktreeRunner } from "../engine/safety.ts";
import { type DodRunner, realSpawn, type WorkerRunner } from "../engine/spawn.ts";
import type { Task } from "../types/index.ts";

function makeTask(id = "task-spawn-dod"): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Implementing",
		pipeline_id: "execution",
		phase: "implementing",
		filePath: `/fake/${id}.md`,
		body: "",
	} as unknown as Task;
}

function makeFakeWorktreeRunner(): {
	runner: WorktreeRunner;
	added: string[];
	removed: string[];
} {
	const added: string[] = [];
	const removed: string[] = [];
	return {
		runner: {
			add: async (_repo, wt) => {
				added.push(wt);
			},
			remove: async (_repo, wt) => {
				removed.push(wt);
			},
			rmrf: async () => {},
			join: (...parts) => join(...parts),
		},
		added,
		removed,
	};
}

describe("realSpawn — optional dodRunner (Phase B / ENG-8)", () => {
	it("works without dodRunner (4-arg form); dodResults is undefined", async () => {
		const task = makeTask("no-dod");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: true }),
		};

		const result = await realSpawn(task, "/repo", workerRunner, worktreeRunner);
		expect(result.success).toBe(true);
		expect(result.dodResults).toBeUndefined();
	});

	it("calls dodRunner inside the worktree (worktree path is passed)", async () => {
		const task = makeTask("with-dod");
		const { runner: worktreeRunner, added } = makeFakeWorktreeRunner();

		let dodCalledWithPath = "";

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: true }),
		};

		const dodRunner: DodRunner = async (_task, wt) => {
			dodCalledWithPath = wt;
			return [{ cmd: "true", passed: true }];
		};

		await realSpawn(task, "/repo", workerRunner, worktreeRunner, dodRunner);
		expect(dodCalledWithPath).toBe(added[0] ?? "");
	});

	it("merges dodResults into CompletionResult", async () => {
		const task = makeTask("dod-results");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: true }),
		};

		const dodRunner: DodRunner = async () => [
			{ cmd: "true", passed: true },
			{ cmd: "false", passed: false },
		];

		const result = await realSpawn(task, "/repo", workerRunner, worktreeRunner, dodRunner);
		expect(result.dodResults).toHaveLength(2);
		expect(result.dodResults?.[0]).toEqual({ cmd: "true", passed: true });
		expect(result.dodResults?.[1]).toEqual({ cmd: "false", passed: false });
	});

	it("cleans up worktree after dodRunner runs (try/finally)", async () => {
		const task = makeTask("dod-cleanup");
		const { runner: worktreeRunner, added, removed } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: true }),
		};

		const dodRunner: DodRunner = async () => [{ cmd: "true", passed: true }];

		await realSpawn(task, "/repo", workerRunner, worktreeRunner, dodRunner);

		expect(added.length).toBe(1);
		expect(removed.length).toBe(1);
		expect(removed[0]).toBe(added[0]);
	});

	it("cleans up worktree even when dodRunner throws", async () => {
		const task = makeTask("dod-throw");
		const { runner: worktreeRunner, added, removed } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: true }),
		};

		const dodRunner: DodRunner = async () => {
			throw new Error("dod runner crashed");
		};

		await expect(realSpawn(task, "/repo", workerRunner, worktreeRunner, dodRunner)).rejects.toThrow(
			"dod runner crashed",
		);

		expect(added.length).toBe(1);
		expect(removed.length).toBe(1);
	});

	it("dodRunner receives the correct task", async () => {
		const task = makeTask("task-id-check");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		let receivedTaskId = "";

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: true }),
		};

		const dodRunner: DodRunner = async (t) => {
			receivedTaskId = t.id;
			return [];
		};

		await realSpawn(task, "/repo", workerRunner, worktreeRunner, dodRunner);
		expect(receivedTaskId).toBe("task-id-check");
	});

	it("preserves worker result fields alongside dodResults", async () => {
		const task = makeTask("preserve-fields");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: false, error: "oops" }),
		};

		const dodRunner: DodRunner = async () => [{ cmd: "true", passed: true }];

		const result = await realSpawn(task, "/repo", workerRunner, worktreeRunner, dodRunner);
		expect(result.success).toBe(false);
		expect(result.error).toBe("oops");
		expect(result.dodResults).toHaveLength(1);
	});
});

describe("Absence: engine core has no Bun.spawn or child_process", () => {
	it("src/engine contains no Bun.spawn or child_process", async () => {
		const engineDir = join(import.meta.dir, "../engine");
		const files = await readdir(engineDir);
		const tsFiles = files.filter((f) => f.endsWith(".ts"));

		for (const file of tsFiles) {
			const content = await Bun.file(join(engineDir, file)).text();
			expect(content).not.toMatch(/Bun\.spawn|child_process/);
		}
	});
});
