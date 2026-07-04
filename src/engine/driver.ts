import type { Task } from "../types/index.js";
import { type CompletionResult, complete, type TaskStore } from "./complete.js";
import { Interpreter } from "./interpreter.js";
import type { Pipeline } from "./pipeline.js";

/** Worktree operations interface; primitives are stubbed here and hardened in child 5. */
export interface WorktreeOps {
	spawn(task: Task): Promise<CompletionResult>;
	merge(taskId: string, result: CompletionResult): Promise<void>;
}

/**
 * Driver: closes the detect→spawn→merge→advance loop.
 * Wires interpreter events to worktree operations and phase advancement via pipeline data.
 */
export class Driver {
	private interpreter: Interpreter;

	constructor(pipelines: Pipeline[], store: TaskStore, worktree: WorktreeOps) {
		this.interpreter = new Interpreter();
		// Register a handler for every machine-actor phase across all pipelines
		for (const pipeline of pipelines) {
			for (const state of pipeline.states) {
				if (state.actor === "machine") {
					this.interpreter.register(pipeline, state.name, async (_event, task) => {
						const result = await worktree.spawn(task);
						await worktree.merge(task.id, result);
						await complete(task.id, result, pipelines, store);
					});
				}
			}
		}
	}

	/** One detect→spawn→merge→advance cycle over the given task list. */
	async tick(tasks: Task[]): Promise<void> {
		const events = this.interpreter.scan(tasks);
		await this.interpreter.dispatch(events, tasks);
	}
}
