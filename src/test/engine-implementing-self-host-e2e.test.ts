/**
 * Phase F — BACK-686.3 AC#8: bootstrap self-hosting meter.
 *
 * Drives one real epic task end to end through the engine's own mechanism only
 * (`runEngine`/`Driver.tick` + `makeDecomposer` + `advanceAwaitingChildrenToAdjudicating`,
 * the same pieces `engine scan`/`primitive-executor`/`engine complete` wire together
 * in production) — no monitor, no scan-loop daemon, no external driver process:
 *
 *   implementing (judges compound) -> makeDecomposer creates children -> awaiting-children
 *   -> (children resolve to done) -> advanceAwaitingChildrenToAdjudicating -> adjudicating
 *   -> Driver.tick's adjudicating gate (light path, no risky label/IA) -> done.
 *
 * Modeled directly on `engine-autonomous-e2e.test.ts`'s `runEngine` + `realSpawn` seam
 * + `WorkerRunner` test-double pattern (same harness seam, no real Claude Code agent or
 * git worktree required for the primitive-executor step; the epic's own compound branch
 * has no worktree of its own per the primitive-executor skill's own contract).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import type { CompletionResult } from "../engine/complete.ts";
import { Driver } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import { runEngine } from "../engine/run.ts";
import { makeBoardStore } from "../engine/store.ts";
import { makeDecomposer } from "../harness/decomposer.ts";
import { advanceAwaitingChildrenToAdjudicating } from "../harness/evaluator.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CHILDREN_JSON = JSON.stringify([
	{ title: "Child A", description: "delivers A" },
	{ title: "Child B", description: "delivers B" },
]);

/** Create a compound epic on the real board, promoted straight to `implementing` (BACK-686.3 de-fork). */
async function createEpic(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const epic: Task = {
		...task,
		labels: [...(task.labels ?? []), "kind:epic"],
		pipeline_id: "execution",
		phase: "implementing",
	};
	await core.updateTask(epic, false);
	return epic;
}

describe("BACK-686.3 AC#8 — self-host bootstrap meter: implementing -> awaiting-children -> adjudicating -> done", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-implementing-self-host");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-implementing-self-host-test");

		const config = await core.filesystem.loadConfig();
		if (config) {
			config.statuses = [...(config.statuses ?? []), "Implementing"];
			await core.filesystem.saveConfig(config);
		}
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("drives a real epic through the full implementing-centric mechanism with only engine-owned pieces", async () => {
		const epic = await createEpic(core, "Self-host epic");

		// Step 1: implementing judges compound -> decompose creates children -> awaiting-children.
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);

		const { ticks: decomposeTicks } = await runEngine(
			core,
			{ spawn: async () => ({ success: true }), merge: async () => {} },
			{ decompose },
		);
		expect(decomposeTicks).toBeGreaterThan(0);

		const afterDecompose = await core.getTask(epic.id);
		expect(afterDecompose?.phase).toBe("awaiting-children");

		// Step 2: the same `runEngine` run already drove each child through its own
		// implementing -> adjudicating (light path) -> done, using only the injected
		// primitive spawn (no monitor/external driver) — the same engine mechanism,
		// not a separate one, self-hosting the children too.
		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children).toHaveLength(2);
		for (const child of children) {
			expect(child.pipeline_id).toBe("execution");
			expect(child.phase).toBe("done");
		}

		// Step 3: engine-owned advance (the same call `engine scan` makes) -> adjudicating.
		const advanced = await advanceAwaitingChildrenToAdjudicating(core);
		expect(advanced).toEqual([epic.id]);
		const afterAdvance = await core.getTask(epic.id);
		expect(afterAdvance?.phase).toBe("adjudicating");

		// Step 4: Driver.tick's adjudicating gate (light path: no area:engine/security label,
		// no Integration Acceptance section) resolves straight to done from all-done children.
		const store = makeBoardStore(core);
		const driver = new Driver([executionPipeline], store, {
			spawn: async () => ({ success: true }),
			merge: async () => {},
		});
		const tasks = await core.queryTasks({});
		await driver.tick(tasks);

		const finalEpic = await core.getTask(epic.id);
		expect(finalEpic?.phase).toBe("done");
	});
});
