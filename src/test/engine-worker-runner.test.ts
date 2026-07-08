/**
 * Phase A — WorkerRunner harness tests.
 *
 * Asserts:
 *   1. makeWorkerRunner returns a WorkerRunner; run() calls the injected SpawnPrimitive.
 *   2. Brief passed to SpawnPrimitive contains task id, title, DoD items, worktreePath.
 *   3. CompletionResult is propagated unchanged (success and failure).
 *   4. Engine core (src/engine) contains no Agent() call.
 */

import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CompletionResult } from "../engine/complete.ts";
import { buildBrief, makeWorkerRunner, type SpawnPrimitive } from "../harness/worker-runner.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "BACK-test-1",
		title: "Implement feature X",
		status: "Basic: Implementing",
		pipeline_id: "execution",
		phase: "implementing",
		filePath: "/fake/back-test-1.md",
		body: "",
		assignee: [],
		labels: [],
		dependencies: [],
		createdDate: "2026-01-01",
		...overrides,
	} as unknown as Task;
}

describe("makeWorkerRunner — SpawnPrimitive injection", () => {
	it("calls SpawnPrimitive with brief and worktreePath", async () => {
		const calls: Array<{ brief: string; worktreePath: string }> = [];
		const primitive: SpawnPrimitive = async (brief, worktreePath) => {
			calls.push({ brief, worktreePath });
			return { success: true };
		};

		const runner = makeWorkerRunner(primitive);
		const task = makeTask();
		const result = await runner.run(task, "/worktrees/BACK-test-1");

		expect(calls.length).toBe(1);
		expect(calls[0]?.worktreePath).toBe("/worktrees/BACK-test-1");
		expect(result.success).toBe(true);
	});

	it("brief contains task id and title", async () => {
		let capturedBrief = "";
		const primitive: SpawnPrimitive = async (brief) => {
			capturedBrief = brief;
			return { success: true };
		};

		const runner = makeWorkerRunner(primitive);
		const task = makeTask({ id: "BACK-42", title: "Ship the rocket" });
		await runner.run(task, "/wt/BACK-42");

		expect(capturedBrief).toContain("BACK-42");
		expect(capturedBrief).toContain("Ship the rocket");
	});

	it("brief contains DoD items from task.dod", async () => {
		let capturedBrief = "";
		const primitive: SpawnPrimitive = async (brief) => {
			capturedBrief = brief;
			return { success: true };
		};

		const runner = makeWorkerRunner(primitive);
		const task = makeTask({
			dod: [
				{ text: "bun test passes", checked: false } as unknown as import("../types/index.ts").DoDItem,
				{ text: "tsc --noEmit passes", checked: false } as unknown as import("../types/index.ts").DoDItem,
			],
		});
		await runner.run(task, "/wt/BACK-test");

		expect(capturedBrief).toContain("bun test passes");
		expect(capturedBrief).toContain("tsc --noEmit passes");
	});

	it("brief contains worktreePath", async () => {
		let capturedBrief = "";
		const primitive: SpawnPrimitive = async (brief) => {
			capturedBrief = brief;
			return { success: true };
		};

		const runner = makeWorkerRunner(primitive);
		const task = makeTask();
		await runner.run(task, "/isolated/worktree/path");

		expect(capturedBrief).toContain("/isolated/worktree/path");
	});

	it("propagates success=false and error from SpawnPrimitive", async () => {
		const primitive: SpawnPrimitive = async (): Promise<CompletionResult> => ({
			success: false,
			error: "DoD item 3 failed",
		});

		const runner = makeWorkerRunner(primitive);
		const task = makeTask();
		const result = await runner.run(task, "/wt");

		expect(result.success).toBe(false);
		expect(result.error).toBe("DoD item 3 failed");
	});
});

describe("buildBrief — content shape", () => {
	it("includes description when present", () => {
		const task = makeTask({ description: "This task implements the core loop." });
		const brief = buildBrief(task, "/wt");
		expect(brief).toContain("This task implements the core loop.");
	});

	it("includes implementationPlan when present", () => {
		const task = makeTask({ implementationPlan: "Phase 1: write tests\nPhase 2: implement" });
		const brief = buildBrief(task, "/wt");
		expect(brief).toContain("Phase 1: write tests");
	});

	it("marks unchecked DoD items with [ ]", () => {
		const task = makeTask({
			dod: [{ text: "tests pass", checked: false } as unknown as import("../types/index.ts").DoDItem],
		});
		const brief = buildBrief(task, "/wt");
		expect(brief).toContain("[ ] tests pass");
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
});
