/**
 * BACK-686.2 Phase B (AC#2/#3/#10) — `execution/evaluating` becomes a mechanical
 * script, resolved by `Driver.tick` calling `evaluateEpic`'s logic directly and
 * synchronously (`computeEpicVerdict`, `src/harness/evaluator.ts`), never via a
 * dispatched skill/spawned session. Distinct from `execution/adjudicating`
 * (`engine-adjudicating-gate.test.ts`), which stays a gate that CAN escalate to a
 * skill dispatch — `evaluating` never does.
 */
import { describe, expect, it } from "bun:test";
import type { TaskStore } from "../engine/complete.ts";
import { Driver, type WorktreeOps } from "../engine/driver.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";

function makeEpic(overrides: Partial<Task> = {}): Task {
	return {
		id: "epic-1",
		title: "Epic",
		status: "Epic: Evaluating",
		pipeline_id: "execution",
		phase: "evaluating",
		subtasks: ["child-a", "child-b"],
		assignee: [],
		labels: [],
		dependencies: [],
		body: "",
		...overrides,
	} as unknown as Task;
}

function makeChild(id: string, phase: string, parent_id: string): Task {
	return {
		id,
		title: id,
		status: "Done",
		pipeline_id: "execution",
		phase,
		parent_id,
		assignee: [],
		labels: [],
		dependencies: [],
		body: "",
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

function noSpawnWorktree(spawnCalls: { count: number }): WorktreeOps {
	return {
		spawn: async () => {
			spawnCalls.count++;
			return { success: true };
		},
		merge: async () => {},
	};
}

describe("Driver.tick — execution/evaluating is a mechanical script (BACK-686.2 AC#2/#3)", () => {
	it("resolves an all-done-children epic to done, with zero spawn calls", async () => {
		const epic = makeEpic();
		const child1 = makeChild("child-a", "done", epic.id);
		const child2 = makeChild("child-b", "done", epic.id);
		const { store, all } = makeStore([epic, child1, child2]);

		const spawnCalls = { count: 0 };
		const driver = new Driver([executionPipeline], store, noSpawnWorktree(spawnCalls));
		await driver.tick(all());

		expect(all().find((t) => t.id === epic.id)?.phase).toBe("done");
		expect(spawnCalls.count).toBe(0);
	});

	it("resolves to needs-human when any child is needs-human, with zero spawn calls (AC#10)", async () => {
		const epic = makeEpic();
		const child1 = makeChild("child-a", "done", epic.id);
		const child2 = makeChild("child-b", "needs-human", epic.id);
		const { store, all } = makeStore([epic, child1, child2]);

		const spawnCalls = { count: 0 };
		const driver = new Driver([executionPipeline], store, noSpawnWorktree(spawnCalls));
		await driver.tick(all());

		expect(all().find((t) => t.id === epic.id)?.phase).toBe("needs-human");
		expect(spawnCalls.count).toBe(0);
	});

	it("never calls an injected adjudicateHandler for an evaluating task (mechanical, not a judgment call)", async () => {
		const epic = makeEpic();
		const child1 = makeChild("child-a", "done", epic.id);
		const { store, all } = makeStore([epic, child1]);

		let adjudicateHandlerCalls = 0;
		const driver = new Driver(
			[executionPipeline],
			store,
			{ spawn: async () => ({ success: true }), merge: async () => {} },
			undefined,
			undefined,
			async () => {
				adjudicateHandlerCalls++;
				return { verdict: "done" };
			},
		);
		await driver.tick(all());

		expect(adjudicateHandlerCalls).toBe(0);
	});
});
