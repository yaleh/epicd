/**
 * BACK-605.5 — epic-decompose INTEGRATION tests (real Core, real child creation).
 *
 * These tests exercise the REAL create/scan path, not a fake that bypasses it:
 *   - the decomposer worker only *proposes* children as JSON (fake spawn returns output);
 *   - the ENGINE creates them via core.createTaskFromInput with engine fields;
 *   - children are asserted engine-visible (queryTasks: pipeline_id/phase/parent_id);
 *   - idempotency is asserted against BOARD TRUTH (parent_id), not task.subtasks.
 *
 * This is the gate that would have caught the earlier DoD-green stub: a fake that
 * returns success without creating children now fails the child-count assertions.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import type { CompletionResult } from "../engine/complete.ts";
import { makeDecomposer, parseProposedChildren } from "../harness/decomposer.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

/** Create a compound epic on the real board, enrolled in the execution pipeline. */
async function createEpic(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const epic: Task = { ...task, role: "compound", pipeline_id: "execution", phase: "decomposing" };
	await core.updateTask(epic, false);
	return epic;
}

const CHILDREN_JSON = `Some worker preamble...
[{"title": "Child Alpha", "description": "delivers alpha"}, {"title": "Child Beta", "description": "delivers beta"}]`;

describe("makeDecomposer (integration, real Core)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-decompose");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-decompose-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("engine creates proposed children with engine fields; epic → awaiting-children", async () => {
		const epic = await createEpic(core, "Epic to decompose");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		// Children are actually on the board and engine-visible.
		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		for (const child of children) {
			expect(child.pipeline_id).toBe("execution");
			expect(child.phase).toBe("ready");
			expect(child.parent_id).toBe(epic.id);
		}
		expect(children.map((c) => c.title).sort()).toEqual(["Child Alpha", "Child Beta"]);

		// Epic advanced to awaiting-children.
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
	});

	it("idempotent: re-run does not create duplicate children and does not re-spawn", async () => {
		const epic = await createEpic(core, "Epic decomposed twice");

		let spawnCalls = 0;
		const fakeSpawn = async (): Promise<CompletionResult> => {
			spawnCalls++;
			return { success: true, output: CHILDREN_JSON };
		};
		const decompose = makeDecomposer(fakeSpawn, core);

		await decompose(epic, projectRoot);
		await decompose(epic, projectRoot); // second run must be a no-op for creation

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2); // not 4
		expect(spawnCalls).toBe(1); // worker not spawned again
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
	});

	it("worker failure → epic needs-human, no children created", async () => {
		const epic = await createEpic(core, "Epic decompose fails");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: false, error: "worker crashed" });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(0);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});

	it("no parseable children → epic needs-human, no children created", async () => {
		const epic = await createEpic(core, "Epic decompose empty");

		const fakeSpawn = async (): Promise<CompletionResult> => ({
			success: true,
			output: "I could not find any subtasks.",
		});
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(0);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});
});

describe("parseProposedChildren", () => {
	it("extracts a JSON array embedded in worker prose", () => {
		const children = parseProposedChildren(CHILDREN_JSON);
		expect(children).toEqual([
			{ title: "Child Alpha", description: "delivers alpha" },
			{ title: "Child Beta", description: "delivers beta" },
		]);
	});

	it("returns [] for missing/invalid output", () => {
		expect(parseProposedChildren(undefined)).toEqual([]);
		expect(parseProposedChildren("no json here")).toEqual([]);
		expect(parseProposedChildren("[not valid json]")).toEqual([]);
	});

	it("drops entries without a title", () => {
		expect(parseProposedChildren('[{"title": "Keep"}, {"description": "no title"}, {"title": "  "}]')).toEqual([
			{ title: "Keep" },
		]);
	});
});
