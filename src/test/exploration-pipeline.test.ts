/**
 * End-to-end exploration pipeline test (BACK-603 603.3): spike → done, covering
 * both the kill and the promote path, using the real generic `Driver` (the same
 * one `executionPipeline` runs on) — the pipeline and its handlers are the only
 * new surface, per AC#3.
 */

import { describe, expect, it } from "bun:test";
import { Driver } from "../engine/driver.ts";
import { makeExplorationWorktreeOps } from "../engine/exploration-handlers.ts";
import { explorationPipeline } from "../engine/pipeline.ts";
import { makeMemoryStore } from "../engine/sandbox.ts";
import type { Task } from "../types/index.ts";

function makeSpikeTask(id: string): Task {
	return {
		id,
		title: `Spike ${id}`,
		status: "Basic: Ready",
		assignee: [],
		createdDate: "2026-07-05",
		labels: [],
		dependencies: [],
		pipeline_id: "exploration",
		phase: "spiking",
	} as Task;
}

describe("exploration pipeline — spike → done (kill path)", () => {
	it("a killed spike reaches terminal 'done' and spawns nothing", async () => {
		const spike = makeSpikeTask("SPIKE-1");
		const { store, all } = makeMemoryStore([spike]);

		let promoted = false;
		const worktree = makeExplorationWorktreeOps(
			async () => ({ verdict: "kill" }),
			async () => {
				promoted = true;
			},
		);

		const driver = new Driver([explorationPipeline], store, worktree);
		await driver.tick(all());

		const reloaded = all().find((t) => t.id === "SPIKE-1");
		expect(reloaded?.phase).toBe("done");
		expect(promoted).toBe(false);
	});
});

describe("exploration pipeline — spike → done (promote path)", () => {
	it("a promoted spike reaches terminal 'done' AND spawns a new execution-pipeline task with provenance.spawned_from set", async () => {
		const spike = makeSpikeTask("SPIKE-2");
		const { store, all } = makeMemoryStore([spike]);

		const spawnedExecutionTasks: Task[] = [];
		const worktree = makeExplorationWorktreeOps(
			async () => ({ verdict: "promote", output: "worth building" }),
			async (spikeTask) => {
				spawnedExecutionTasks.push({
					id: "EXEC-FROM-SPIKE-2",
					title: `Promoted from spike: ${spikeTask.title}`,
					status: "Basic: Implementing",
					assignee: [],
					createdDate: "2026-07-05",
					labels: [],
					dependencies: [],
					pipeline_id: "execution",
					phase: "implementing",
					provenance: { spawned_from: spikeTask.id },
				} as Task);
			},
		);

		const driver = new Driver([explorationPipeline], store, worktree);
		await driver.tick(all());

		const reloaded = all().find((t) => t.id === "SPIKE-2");
		expect(reloaded?.phase).toBe("done");

		// Cross-pipeline derivation edge (BACK-638): the new execution task
		// records exactly which exploration spike it was spawned from.
		expect(spawnedExecutionTasks).toHaveLength(1);
		expect(spawnedExecutionTasks[0]?.pipeline_id).toBe("execution");
		expect(spawnedExecutionTasks[0]?.provenance).toEqual({ spawned_from: "SPIKE-2" });
	});
});

describe("exploration pipeline — fixpoint", () => {
	it("a second tick after done is a no-op (idempotent fixpoint)", async () => {
		const spike = makeSpikeTask("SPIKE-3");
		const { store, all } = makeMemoryStore([spike]);
		const worktree = makeExplorationWorktreeOps(
			async () => ({ verdict: "kill" }),
			async () => {},
		);
		const driver = new Driver([explorationPipeline], store, worktree);

		await driver.tick(all());
		expect(all().find((t) => t.id === "SPIKE-3")?.phase).toBe("done");

		// "done" is a `none`-actor terminal state — interpreter.scan emits no
		// event for it, so a second tick touches nothing.
		const before = all();
		await driver.tick(before);
		expect(all()).toEqual(before);
	});
});
