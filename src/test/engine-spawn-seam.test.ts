/**
 * Phase A — spawn seam tests.
 *
 * Asserts:
 *   1. realSpawn creates a worktree via withWorktree and delegates to the injected WorkerRunner.
 *   2. The runner receives the task and worktree path; cleanup runs in finally.
 *   3. Absence: engine core (src/engine) contains no direct Agent() call or subprocess spawn.
 */

import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CompletionResult } from "../engine/complete.ts";
import type { WorktreeRunner } from "../engine/safety.ts";
import { realSpawn, type WorkerRunner } from "../engine/spawn.ts";
import type { Task } from "../types/index.ts";

function makeTask(id: string): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase: "ready",
		filePath: `/fake/${id}.md`,
		body: "",
	} as unknown as Task;
}

/** Fake WorktreeRunner — records calls without touching git. */
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

describe("realSpawn — worktree delegation (spawn seam)", () => {
	it("calls WorkerRunner.run with the task and worktree path", async () => {
		const task = makeTask("task-abc");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		let receivedTask: Task | undefined;
		let receivedPath = "";

		const workerRunner: WorkerRunner = {
			run: async (t, wt) => {
				receivedTask = t;
				receivedPath = wt;
				return { success: true };
			},
		};

		const result = await realSpawn(task, "/repo", workerRunner, worktreeRunner);

		expect(result.success).toBe(true);
		expect(receivedTask?.id).toBe("task-abc");
		expect(receivedPath).toContain("task-abc");
	});

	it("creates and removes the worktree (try/finally cleanup)", async () => {
		const task = makeTask("task-xyz");
		const { runner: worktreeRunner, added, removed } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async () => ({ success: true }),
		};

		await realSpawn(task, "/repo", workerRunner, worktreeRunner);

		expect(added.length).toBe(1);
		expect(added[0]).toContain("task-xyz");
		expect(removed.length).toBe(1);
		expect(removed[0]).toBe(added[0]);
	});

	it("cleans up worktree even when runner throws", async () => {
		const task = makeTask("task-err");
		const { runner: worktreeRunner, added, removed } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async () => {
				throw new Error("worker crashed");
			},
		};

		await expect(realSpawn(task, "/repo", workerRunner, worktreeRunner)).rejects.toThrow("worker crashed");

		// Cleanup must still have run
		expect(added.length).toBe(1);
		expect(removed.length).toBe(1);
	});

	it("propagates runner result (success=false)", async () => {
		const task = makeTask("task-fail");
		const { runner: worktreeRunner } = makeFakeWorktreeRunner();

		const workerRunner: WorkerRunner = {
			run: async (): Promise<CompletionResult> => ({ success: false, error: "dod failed" }),
		};

		const result = await realSpawn(task, "/repo", workerRunner, worktreeRunner);
		expect(result.success).toBe(false);
		expect(result.error).toBe("dod failed");
	});
});

describe("Absence: engine core has no direct Agent/subprocess spawn", () => {
	it("src/engine contains no Agent() call", async () => {
		const engineDir = join(import.meta.dir, "../engine");
		const files = await readdir(engineDir);
		// dispatch.ts is the invocation-prompt AUTHOR (BACK-625 / ADR-015): it embeds the literal
		// `Agent(run_in_background=true)` spawn instruction inside a payload STRING for the
		// harness/`claude -p` to execute — instruction text, not a call. Excluding it from the
		// string-scan (which the payload text trips) does NOT create a blind spot, because the
		// dedicated assertion below proves dispatch.ts is a pure data module (zero imports/require)
		// and therefore structurally cannot call Agent() or any spawn primitive at all.
		const tsFiles = files.filter((f) => f.endsWith(".ts") && f !== "dispatch.ts");

		for (const file of tsFiles) {
			const content = await Bun.file(join(engineDir, file)).text();
			expect(content).not.toMatch(/Agent\s*\(/);
		}

		// dispatch.ts must remain a pure string builder: no imports/require → no capability to
		// spawn anything, so the embedded Agent(...) payload text can never become a real call.
		const dispatch = await Bun.file(join(engineDir, "dispatch.ts")).text();
		expect(dispatch).not.toMatch(/^\s*import\s/m);
		expect(dispatch).not.toMatch(/\brequire\s*\(/);
	});

	it("src/engine contains no child_process or Bun.spawn call", async () => {
		const engineDir = join(import.meta.dir, "../engine");
		const files = await readdir(engineDir);
		const tsFiles = files.filter((f) => f.endsWith(".ts"));

		for (const file of tsFiles) {
			const content = await Bun.file(join(engineDir, file)).text();
			expect(content).not.toMatch(/child_process|Bun\.spawn/);
		}
	});
});
