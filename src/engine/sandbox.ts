import type { Task } from "../types/index.js";
import type { TaskStore } from "./complete.js";
import { Driver } from "./driver.js";
import type { Pipeline } from "./pipeline.js";

export interface SandboxResult {
	tasks: Task[];
	ticks: number;
}

/** Build an in-memory TaskStore backed by a simple mutable array. */
export function makeMemoryStore(initial: Task[]): { store: TaskStore; all: () => Task[] } {
	let tasks = [...initial];
	return {
		store: {
			getTask: async (id) => tasks.find((t) => t.id === id) ?? null,
			updateTask: async (updated) => {
				tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
			},
		},
		all: () => [...tasks],
	};
}

/** Returns true if any task is currently in a machine-actor phase. */
export function hasMachineWork(tasks: Task[], pipelines: Pipeline[]): boolean {
	for (const task of tasks) {
		if (!task.pipeline_id || !task.phase) continue;
		const pipeline = pipelines.find((p) => p.id === task.pipeline_id);
		if (!pipeline) continue;
		const state = pipeline.states.find((s) => s.name === task.phase);
		if (state?.actor === "machine") return true;
	}
	return false;
}

/**
 * Run the driver on `tasks` until fixpoint (no machine-phase tasks remain)
 * or until `maxTicks` is exceeded.  Returns the final task states and tick count.
 */
export async function runToFixpoint(tasks: Task[], pipelines: Pipeline[], maxTicks = 100): Promise<SandboxResult> {
	const { store, all } = makeMemoryStore(tasks);

	const worktree = {
		spawn: async (_task: Task) => ({ success: true }),
		merge: async (_taskId: string, _result: { success: boolean }) => {},
	};

	const driver = new Driver(pipelines, store, worktree);
	let ticks = 0;

	while (hasMachineWork(all(), pipelines) && ticks < maxTicks) {
		await driver.tick(all());
		ticks++;
	}

	return { tasks: all(), ticks };
}
