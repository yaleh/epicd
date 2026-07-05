/**
 * provenance.spawned_from — cross-pipeline derivation edge (BACK-603 603.2).
 *
 * Distinct from `parent_id` (a same-pipeline decomposition-tree edge: an epic
 * to the children `engine decompose-apply` created for it): `provenance.spawned_from`
 * records that this task was spawned out of a task living in a DIFFERENT
 * pipeline (e.g. an execution task promoted out of a finished exploration
 * spike). Both can be present on the same task simultaneously and mean
 * different things — this file asserts the distinction, not just the round-trip.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { FIELD_DESCRIPTORS, serializeFields } from "../core/field-registry.ts";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

describe("provenance.spawned_from — field-registry round-trip", () => {
	it("registers a presence-gated 'provenance' descriptor", () => {
		const descriptor = FIELD_DESCRIPTORS.find((d) => d.yamlKey === "provenance");
		expect(descriptor).toBeDefined();
		expect(descriptor?.tsName).toBe("provenance");
	});

	it("round-trips parse(serialize(x)) === x through the real markdown serializer/parser", () => {
		const task = {
			id: "task-1",
			title: "t",
			status: "Backlog",
			assignee: [],
			createdDate: "2026-07-04",
			labels: [],
			dependencies: [],
			provenance: { spawned_from: "SPIKE-9" },
		} as Task;

		const frontmatter = serializeFields(task);
		expect(frontmatter.provenance).toEqual({ spawned_from: "SPIKE-9" });

		const reparsed = parseTask(serializeTask(task));
		expect(reparsed.provenance).toEqual({ spawned_from: "SPIKE-9" });
	});

	it("omits the key entirely when absent (presence-gating, no key churn)", () => {
		const task = {
			id: "task-1",
			title: "t",
			status: "Backlog",
			assignee: [],
			createdDate: "2026-07-04",
			labels: [],
			dependencies: [],
		} as Task;

		expect(Object.hasOwn(serializeFields(task), "provenance")).toBe(false);
		expect(serializeTask(task)).not.toContain("provenance");
	});
});

describe("provenance.spawned_from — Core create/update round-trip", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("provenance-core");
		core = new Core(projectRoot);
		await initializeTestProject(core, "provenance-core-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("createTaskFromInput persists provenance and getTask reloads it unchanged", async () => {
		const { task } = await core.createTaskFromInput(
			{ title: "Spawned task", status: "To Do", provenance: { spawned_from: "SPIKE-42" } },
			false,
		);

		const reloaded = await core.getTask(task.id);
		expect(reloaded?.provenance).toEqual({ spawned_from: "SPIKE-42" });
	});

	it("updateTask can set provenance on an existing task without touching parent_id", async () => {
		const { task } = await core.createTaskFromInput({ title: "Existing task", status: "To Do" }, false);
		await core.updateTask({ ...task, parent_id: "EPIC-1", provenance: { spawned_from: "SPIKE-7" } } as Task, false);

		const reloaded = await core.getTask(task.id);
		// Both edges coexist and stay distinct: parent_id is the decomposition-tree
		// edge, provenance.spawned_from is the cross-pipeline derivation edge.
		expect(reloaded?.parent_id).toBe("EPIC-1");
		expect(reloaded?.provenance).toEqual({ spawned_from: "SPIKE-7" });
	});
});
