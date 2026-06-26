import { describe, expect, it } from "bun:test";
import { executionPipeline } from "../engine/pipeline.js";
import { Interpreter } from "../engine/interpreter.js";
import type { Task } from "../types/index.js";

// Minimal Task factory for tests
function makeTask(id: string, pipeline_id: string, state: string): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		pipeline_id,
		state,
		filePath: `/fake/${id}.md`,
		body: "",
	} as unknown as Task;
}

describe("Pipeline definition", () => {
	it("executionPipeline has id 'execution'", () => {
		expect(executionPipeline.id).toBe("execution");
	});

	it("'ready' state is actionable", () => {
		const s = executionPipeline.states.find((s) => s.name === "ready");
		expect(s?.actionable).toBe(true);
	});

	it("'in-progress' state is not actionable", () => {
		const s = executionPipeline.states.find((s) => s.name === "in-progress");
		expect(s?.actionable).toBe(false);
	});

	it("'done' state is not actionable", () => {
		const s = executionPipeline.states.find((s) => s.name === "done");
		expect(s?.actionable).toBe(false);
	});

	it("'needs-human' state is not actionable", () => {
		const s = executionPipeline.states.find((s) => s.name === "needs-human");
		expect(s?.actionable).toBe(false);
	});
});

describe("Interpreter.scan — event emission", () => {
	it("emits item-ready for a task in an actionable state", () => {
		const interp = new Interpreter();
		interp.register(executionPipeline, "ready", async () => {});
		const tasks = [makeTask("task-1", "execution", "ready")];
		const events = interp.scan(tasks);
		expect(events).toEqual(["item-ready: execution:ready:task-1"]);
	});

	it("emits no event for 'needs-human' state", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-2", "execution", "needs-human")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits no event for 'in-progress' state", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-3", "execution", "in-progress")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits no event for 'done' state", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-4", "execution", "done")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits no event for tasks without pipeline_id", () => {
		const interp = new Interpreter();
		const task = makeTask("task-5", "execution", "ready");
		(task as unknown as Record<string, unknown>).pipeline_id = undefined;
		const events = interp.scan([task]);
		expect(events).toEqual([]);
	});

	it("emits no event for tasks without state", () => {
		const interp = new Interpreter();
		const task = makeTask("task-6", "execution", "ready");
		(task as unknown as Record<string, unknown>).state = undefined;
		const events = interp.scan([task]);
		expect(events).toEqual([]);
	});

	it("emits no event for unknown pipeline_id", () => {
		const interp = new Interpreter();
		const tasks = [makeTask("task-7", "unknown-pipeline", "ready")];
		const events = interp.scan(tasks);
		expect(events).toEqual([]);
	});

	it("emits events for multiple actionable tasks", () => {
		const interp = new Interpreter();
		interp.register(executionPipeline, "ready", async () => {});
		const tasks = [
			makeTask("task-8", "execution", "ready"),
			makeTask("task-9", "execution", "done"),
			makeTask("task-10", "execution", "ready"),
		];
		const events = interp.scan(tasks);
		expect(events).toEqual([
			"item-ready: execution:ready:task-8",
			"item-ready: execution:ready:task-10",
		]);
	});
});

describe("Interpreter — pipeline registration enables scan", () => {
	it("registers a pipeline when register() is called", () => {
		const interp = new Interpreter();
		// Before registration, unknown pipeline → no events
		const before = interp.scan([makeTask("t1", "execution", "ready")]);
		expect(before).toEqual([]);

		// After registration, known pipeline + actionable state → event
		interp.register(executionPipeline, "ready", async () => {});
		const after = interp.scan([makeTask("t1", "execution", "ready")]);
		expect(after).toEqual(["item-ready: execution:ready:t1"]);
	});
});

describe("Interpreter.dispatch — handler routing", () => {
	it("routes events to the registered handler by pipeline_id:state", async () => {
		const interp = new Interpreter();
		const received: string[] = [];
		interp.register(executionPipeline, "ready", async (event) => {
			received.push(event);
		});

		const tasks = [makeTask("task-A", "execution", "ready")];
		const events = interp.scan(tasks);
		await interp.dispatch(events, tasks);

		expect(received).toEqual(["item-ready: execution:ready:task-A"]);
	});

	it("passes the correct Task object to the handler", async () => {
		const interp = new Interpreter();
		const receivedTasks: Task[] = [];
		interp.register(executionPipeline, "ready", async (_event, task) => {
			receivedTasks.push(task);
		});

		const task = makeTask("task-B", "execution", "ready");
		const events = interp.scan([task]);
		await interp.dispatch(events, [task]);

		expect(receivedTasks).toHaveLength(1);
		expect(receivedTasks[0]?.id).toBe("task-B");
	});

	it("routes events to different handlers for different pipeline:state keys", async () => {
		// Second synthetic pipeline
		const syntheticPipeline = {
			id: "synthetic",
			states: [
				{ name: "pending", actionable: true },
				{ name: "complete", actionable: false },
			],
		};

		const interp = new Interpreter();
		const executionEvents: string[] = [];
		const syntheticEvents: string[] = [];

		interp.register(executionPipeline, "ready", async (event) => {
			executionEvents.push(event);
		});
		interp.register(syntheticPipeline, "pending", async (event) => {
			syntheticEvents.push(event);
		});

		const tasks = [
			makeTask("exec-1", "execution", "ready"),
			makeTask("syn-1", "synthetic", "pending"),
		];
		const events = interp.scan(tasks);
		expect(events).toHaveLength(2);

		await interp.dispatch(events, tasks);

		expect(executionEvents).toEqual(["item-ready: execution:ready:exec-1"]);
		expect(syntheticEvents).toEqual(["item-ready: synthetic:pending:syn-1"]);
	});

	it("is a no-op for unregistered pipeline:state key", async () => {
		const interp = new Interpreter();
		const received: string[] = [];
		interp.register(executionPipeline, "ready", async (event) => {
			received.push(event);
		});

		// Manually craft an event for a key with no handler
		const tasks = [makeTask("task-C", "execution", "ready")];
		const unregisteredEvents = ["item-ready: other-pipeline:other-state:task-C"];
		await interp.dispatch(unregisteredEvents, tasks);

		expect(received).toEqual([]);
	});

	it("invokes multiple handlers in order when multiple events exist", async () => {
		const interp = new Interpreter();
		const order: string[] = [];
		interp.register(executionPipeline, "ready", async (_event, task) => {
			order.push(task.id);
		});

		const tasks = [
			makeTask("first", "execution", "ready"),
			makeTask("second", "execution", "ready"),
		];
		const events = interp.scan(tasks);
		await interp.dispatch(events, tasks);

		expect(order).toEqual(["first", "second"]);
	});
});
