import { describe, expect, it } from "bun:test";
import { Interpreter } from "../engine/interpreter.js";
import { executionPipeline } from "../engine/pipeline.js";
import type { Task } from "../types/index.js";

// Minimal Task factory for tests
function makeTask(id: string, pipeline_id: string, phase: string): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		pipeline_id,
		phase,
		filePath: `/fake/${id}.md`,
		body: "",
	} as unknown as Task;
}

describe("Pipeline definition", () => {
	it("executionPipeline has id 'execution'", () => {
		expect(executionPipeline.id).toBe("execution");
	});

	it("'implementing' phase has actor 'machine'", () => {
		const s = executionPipeline.states.find((s) => s.name === "implementing");
		expect(s?.actor).toBe("machine");
	});

	it("'awaiting-children' phase has actor 'none'", () => {
		const s = executionPipeline.states.find((s) => s.name === "awaiting-children");
		expect(s?.actor).toBe("none");
	});

	it("'needs-human' phase has actor 'human'", () => {
		const s = executionPipeline.states.find((s) => s.name === "needs-human");
		expect(s?.actor).toBe("human");
	});

	it("'done' phase has actor 'none'", () => {
		const s = executionPipeline.states.find((s) => s.name === "done");
		expect(s?.actor).toBe("none");
	});
});

describe("Interpreter.scan — event emission", () => {
	it("emits item-ready for a task in a machine-actor phase (ready)", () => {
		const interp = new Interpreter();
		interp.register(executionPipeline, "implementing", async () => {});
		const tasks = [makeTask("task-1", "execution", "implementing")];
		const events = interp.scan(tasks);
		expect(events).toEqual(["item-ready: execution:implementing:task-1"]);
	});

	it("emits no event for 'needs-human' phase (actor=human)", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-2", "execution", "needs-human")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits no event for 'awaiting-children' phase (actor=none)", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-3", "execution", "awaiting-children")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits no event for 'done' phase (actor=none)", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-4", "execution", "done")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits no event for tasks without pipeline_id", () => {
		const interp = new Interpreter();
		const task = makeTask("task-5", "execution", "implementing");
		(task as unknown as Record<string, unknown>).pipeline_id = undefined;
		const events = interp.scan([task]);
		expect(events).toEqual([]);
	});

	it("emits no event for tasks without phase", () => {
		const interp = new Interpreter();
		const task = makeTask("task-6", "execution", "implementing");
		(task as unknown as Record<string, unknown>).phase = undefined;
		const events = interp.scan([task]);
		expect(events).toEqual([]);
	});

	it("emits no event for unknown pipeline_id", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-7", "unknown-pipeline", "implementing")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits events for multiple actionable tasks", () => {
		const interp = new Interpreter();
		interp.register(executionPipeline, "implementing", async () => {});
		const tasks = [
			makeTask("task-8", "execution", "implementing"),
			makeTask("task-9", "execution", "done"),
			makeTask("task-10", "execution", "implementing"),
		];
		const events = interp.scan(tasks);
		expect(events).toEqual(["item-ready: execution:implementing:task-8", "item-ready: execution:implementing:task-10"]);
	});
});

describe("Interpreter — pipeline registration enables scan", () => {
	it("registers a pipeline when register() is called", () => {
		const interp = new Interpreter();
		// Before registration, unknown pipeline → no events
		const before = interp.scan([makeTask("t1", "execution", "implementing")]);
		expect(before).toEqual([]);

		// After registration, known pipeline + machine-actor phase → event
		interp.register(executionPipeline, "implementing", async () => {});
		const after = interp.scan([makeTask("t1", "execution", "implementing")]);
		expect(after).toEqual(["item-ready: execution:implementing:t1"]);
	});
});

describe("Interpreter.dispatch — handler routing", () => {
	it("routes events to the registered handler by pipeline_id:phase", async () => {
		const interp = new Interpreter();
		const received: string[] = [];
		interp.register(executionPipeline, "implementing", async (event) => {
			received.push(event);
		});

		const tasks = [makeTask("task-A", "execution", "implementing")];
		const events = interp.scan(tasks);
		await interp.dispatch(events, tasks);

		expect(received).toEqual(["item-ready: execution:implementing:task-A"]);
	});

	it("passes the correct Task object to the handler", async () => {
		const interp = new Interpreter();
		const receivedTasks: Task[] = [];
		interp.register(executionPipeline, "implementing", async (_event, task) => {
			receivedTasks.push(task);
		});

		const task = makeTask("task-B", "execution", "implementing");
		const events = interp.scan([task]);
		await interp.dispatch(events, [task]);

		expect(receivedTasks).toHaveLength(1);
		expect(receivedTasks[0]?.id).toBe("task-B");
	});

	it("routes events to different handlers for different pipeline:phase keys", async () => {
		// Second synthetic pipeline with actor field
		const syntheticPipeline = {
			id: "synthetic",
			states: [
				{ name: "pending", actor: "machine" as const },
				{ name: "complete", actor: "none" as const },
			],
		};

		const interp = new Interpreter();
		const executionEvents: string[] = [];
		const syntheticEvents: string[] = [];

		interp.register(executionPipeline, "implementing", async (event) => {
			executionEvents.push(event);
		});
		interp.register(syntheticPipeline, "pending", async (event) => {
			syntheticEvents.push(event);
		});

		const tasks = [makeTask("exec-1", "execution", "implementing"), makeTask("syn-1", "synthetic", "pending")];
		const events = interp.scan(tasks);
		expect(events).toHaveLength(2);

		await interp.dispatch(events, tasks);

		expect(executionEvents).toEqual(["item-ready: execution:implementing:exec-1"]);
		expect(syntheticEvents).toEqual(["item-ready: synthetic:pending:syn-1"]);
	});

	it("is a no-op for unregistered pipeline:phase key", async () => {
		const interp = new Interpreter();
		const received: string[] = [];
		interp.register(executionPipeline, "implementing", async (event) => {
			received.push(event);
		});

		// Manually craft an event for a key with no handler
		const tasks = [makeTask("task-C", "execution", "implementing")];
		const unregisteredEvents = ["item-ready: other-pipeline:other-phase:task-C"];
		await interp.dispatch(unregisteredEvents, tasks);

		expect(received).toEqual([]);
	});

	it("invokes multiple handlers in order when multiple events exist", async () => {
		const interp = new Interpreter();
		const order: string[] = [];
		interp.register(executionPipeline, "implementing", async (_event, task) => {
			order.push(task.id);
		});

		const tasks = [makeTask("first", "execution", "implementing"), makeTask("second", "execution", "implementing")];
		const events = interp.scan(tasks);
		await interp.dispatch(events, tasks);

		expect(order).toEqual(["first", "second"]);
	});
});
