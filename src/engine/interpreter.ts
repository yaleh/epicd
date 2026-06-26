import type { Task } from "../types/index.js";
import type { Pipeline } from "./pipeline.js";

export type ItemReadyEvent = string; // "item-ready: <pipeline_id>:<state>:<task_id>"
export type Handler = (event: ItemReadyEvent, task: Task) => void | Promise<void>;

export class Interpreter {
	private pipelines: Map<string, Pipeline> = new Map();
	private registry: Map<string, Handler> = new Map();

	register(pipeline: Pipeline, state: string, handler: Handler): void {
		this.pipelines.set(pipeline.id, pipeline);
		this.registry.set(`${pipeline.id}:${state}`, handler);
	}

	scan(tasks: Task[]): ItemReadyEvent[] {
		const events: ItemReadyEvent[] = [];
		for (const task of tasks) {
			if (!task.pipeline_id || !task.state) continue;
			const pipeline = this.pipelines.get(task.pipeline_id);
			if (!pipeline) continue;
			const pstate = pipeline.states.find((s) => s.name === task.state);
			if (!pstate?.actionable) continue;
			events.push(`item-ready: ${task.pipeline_id}:${task.state}:${task.id}`);
		}
		return events;
	}

	async dispatch(events: ItemReadyEvent[], tasks: Task[]): Promise<void> {
		for (const event of events) {
			// parse: "item-ready: <pipeline_id>:<state>:<task_id>"
			const rest = event.replace("item-ready: ", "");
			const firstColon = rest.indexOf(":");
			const secondColon = rest.indexOf(":", firstColon + 1);
			const pipeline_id = rest.slice(0, firstColon);
			const state = rest.slice(firstColon + 1, secondColon);
			const task_id = rest.slice(secondColon + 1);
			const handler = this.registry.get(`${pipeline_id}:${state}`);
			if (handler) {
				const task = tasks.find((t) => t.id === task_id);
				if (task) await handler(event, task);
			}
		}
	}
}
