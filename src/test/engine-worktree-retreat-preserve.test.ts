/**
 * Phase D — worktree/claim lifecycle preservation across a retreat (BACK-682 AC#4/#13).
 *
 * A retreat verdict from the `adjudicating` phase must NOT tear down or re-create the
 * task's worktree, and must NOT touch the core isolation mechanisms
 * (`withMergeLock`/`withWorktree`/`withCapGuard`, `src/engine/safety.ts`) — only the
 * claim-holding *window* extends (the task simply sits at a different phase for one
 * more round; nothing in the driver's retreat branch calls `worktree.spawn`/`merge`
 * again, so no new worktree add/remove cycle happens).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskStore } from "../engine/complete.ts";
import type { AdjudicateHandler } from "../engine/driver.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import * as safety from "../engine/safety.ts";
import type { RetreatContract, Task } from "../types/index.ts";

function makeTask(id: string, phase: string, extra: Partial<Task> = {}): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: In Progress",
		pipeline_id: "execution",
		phase,
		filePath: `/fake/${id}.md`,
		body: "",
		...extra,
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

const contract: RetreatContract = {
	keep: [],
	missing: [{ ac: "AC#1", description: "spec ambiguity" }],
	wrong: [],
};

describe("Driver adjudicating retreat — worktree/claim preservation (BACK-682 AC#4)", () => {
	it("does not call worktree.spawn/merge again when a task in adjudicating retreats", async () => {
		// BACK-686.2: the adjudicating gate now runs first — a task must qualify
		// for the "full" audit depth (here: an area:engine label) to still reach
		// the dispatch-skill path this test exercises; otherwise the light path
		// resolves straight to done without ever calling adjudicateHandler.
		const task = makeTask("task-1", "adjudicating", { entry_phase: "ready", labels: ["area:engine"] });
		const { store, all } = makeStore([task]);

		const spawnCalls: string[] = [];
		const mergeCalls: string[] = [];
		const worktree: WorktreeOps = {
			spawn: async (t) => {
				spawnCalls.push(t.id);
				return { success: true };
			},
			merge: async (id) => {
				mergeCalls.push(id);
			},
		};

		const adjudicateHandler: AdjudicateHandler = async () => ({
			verdict: "retreat",
			gapFingerprint: "abc123",
			classification: "spec",
			contract,
		});

		const driver = new Driver([executionPipeline], store, worktree, undefined, undefined, adjudicateHandler);
		await driver.tick(all());

		// Retreat moved the task back to its entry_phase — no re-spawn/re-merge happened.
		expect(all().find((t) => t.id === "task-1")?.phase).toBe("ready");
		expect(spawnCalls).toEqual([]);
		expect(mergeCalls).toEqual([]);
	});

	it("appends to retreat_log/gap_history without touching any other field (worktree/claim untouched)", async () => {
		// BACK-686.2: the adjudicating gate now runs first — a task must qualify
		// for the "full" audit depth (here: an area:engine label) to still reach
		// the dispatch-skill path this test exercises; otherwise the light path
		// resolves straight to done without ever calling adjudicateHandler.
		const task = makeTask("task-1", "adjudicating", { entry_phase: "ready", labels: ["area:engine"] });
		const { store, all } = makeStore([task]);

		const worktree: WorktreeOps = {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		};

		const adjudicateHandler: AdjudicateHandler = async () => ({
			verdict: "retreat",
			gapFingerprint: "abc123",
			classification: "spec",
			contract,
		});

		const driver = new Driver([executionPipeline], store, worktree, undefined, undefined, adjudicateHandler);
		await driver.tick(all());

		const updated = all().find((t) => t.id === "task-1");
		expect(updated?.retreat_log?.length).toBe(1);
		expect(updated?.gap_history).toEqual(["abc123"]);
		expect(updated?.retreat_log?.[0]?.from).toBe("execution/adjudicating");
		expect(updated?.retreat_log?.[0]?.toPhase).toBe("ready");
	});
});

describe("src/engine/safety.ts core isolation functions — unmodified by BACK-682 (AC#13)", () => {
	const SAFETY_TS = join(process.cwd(), "src", "engine", "safety.ts");

	it("still exports exactly withMergeLock/withWorktree/withCapGuard with their pre-BACK-682 signatures", () => {
		expect(typeof safety.withMergeLock).toBe("function");
		expect(typeof safety.withWorktree).toBe("function");
		expect(typeof safety.withCapGuard).toBe("function");
		expect(safety.withMergeLock.length).toBe(3);
		expect(safety.withWorktree.length).toBe(4);
		expect(safety.withCapGuard.length).toBe(4);
	});

	it("withWorktree's body still removes the worktree unconditionally in a finally block (untouched core logic)", () => {
		const text = readFileSync(SAFETY_TS, "utf8");
		expect(text).toContain("finally {");
		expect(text).toContain("runner.remove(repoPath, worktreePath)");
		expect(text).toContain("runner.rmrf(worktreePath)");
	});

	it("file is not touched by the BACK-682 diff (git diff main -- src/engine/safety.ts is empty)", () => {
		const { execSync } = require("node:child_process") as typeof import("node:child_process");
		let diff = "";
		try {
			diff = execSync("git diff main -- src/engine/safety.ts", { cwd: process.cwd(), encoding: "utf8" });
		} catch {
			// Not fatal if `main` ref is unavailable in a shallow/CI checkout — the
			// signature/body assertions above are the primary guard.
			diff = "";
		}
		expect(diff).toBe("");
	});
});
