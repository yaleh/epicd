/**
 * Engine-field-aware child task creation (BACK-605.7)
 *
 * Asserts:
 *   1. createTaskFromInput with pipeline_id/phase/parent_id produces a task
 *      that, when loaded back from disk, has those engine fields set.
 *   2. interpreter.scan() identifies the created child task as engine-ready.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { Interpreter } from "../engine/interpreter.ts";
import { executionPipeline } from "../engine/pipeline.ts";
import type { McpServer } from "../mcp/server.ts";
import { TaskHandlers } from "../mcp/tools/tasks/handlers.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

describe("engine-field-aware child task creation", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-child-create");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-child-create-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("created child has pipeline_id, phase, and parent_id after load", async () => {
		// Create an epic (parent) task first
		const { task: epic } = await core.createTaskFromInput({ title: "Epic task", status: "To Do" }, false);

		// Create child with engine fields set inline — no separate updateTask needed
		const { task: child } = await core.createTaskFromInput(
			{
				title: "Child task",
				status: "To Do",
				pipeline_id: "execution",
				phase: "implementing",
				parent_id: epic.id,
			},
			false,
		);

		// Reload from disk to verify persistence
		const loaded = await core.getTask(child.id);
		expect(loaded).toBeDefined();
		expect(loaded?.pipeline_id).toBe("execution");
		expect(loaded?.phase).toBe("implementing");
		expect(loaded?.parent_id).toBe(epic.id);
	});

	it("interpreter.scan() identifies engine-aware child task as ready event", async () => {
		const { task: epic } = await core.createTaskFromInput({ title: "Epic task", status: "To Do" }, false);

		const { task: child } = await core.createTaskFromInput(
			{
				title: "Child task",
				status: "To Do",
				pipeline_id: "execution",
				phase: "implementing",
				parent_id: epic.id,
			},
			false,
		);

		// Reload to get the persisted version
		const loaded = await core.getTask(child.id);
		if (!loaded) throw new Error("child task not found after create");

		// interpreter.scan should emit an item-ready event for this task
		const interpreter = new Interpreter();
		interpreter.register(executionPipeline, "implementing", async () => {});

		const events = interpreter.scan([loaded]);
		expect(events.length).toBe(1);
		expect(events[0]).toBe(`item-ready: execution:implementing:${child.id}`);
	});

	it("task without engine fields is not visible to interpreter.scan()", async () => {
		const { task } = await core.createTaskFromInput({ title: "Plain task", status: "To Do" }, false);

		const loaded = await core.getTask(task.id);
		if (!loaded) throw new Error("task not found after create");

		const interpreter = new Interpreter();
		interpreter.register(executionPipeline, "implementing", async () => {});

		const events = interpreter.scan([loaded]);
		expect(events.length).toBe(0);
	});

	it("TaskHandlers.createTask forwards pipeline_id/phase/parent_id/dodGates to core.createTaskFromInput (MCP handler-forwarding gap)", async () => {
		const { task: epic } = await core.createTaskFromInput({ title: "Epic task", status: "To Do" }, false);

		const handlers = new TaskHandlers(core as unknown as McpServer);
		await handlers.createTask({
			title: "MCP child task",
			status: "To Do",
			pipeline_id: "execution",
			phase: "implementing",
			parent_id: epic.id,
			dodGates: ["echo ok"],
		});

		const loaded = await core.getTask("task-2");
		expect(loaded).toBeDefined();
		expect(loaded?.pipeline_id).toBe("execution");
		expect(loaded?.phase).toBe("implementing");
		expect(loaded?.parent_id).toBe(epic.id);
		expect(loaded?.dod).toEqual([{ text: "echo ok", checked: false }]);
	});
});
