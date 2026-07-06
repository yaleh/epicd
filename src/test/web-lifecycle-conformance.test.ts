/**
 * BACK-664.1 — web lifecycle conformance.
 *
 * Locks in the phase-only status projection (BACK-664 child 1 / BACK-665
 * AC#2) at the web surface: the human-facing status is always just the
 * title-cased phase, with no "Basic:"/"Epic:" role prefix, status is
 * rendered read-only (no editable status dropdown), and has-children is a
 * separate indicator that is never folded into the status string.
 *
 * The web bundle cannot import `core/backlog.ts` (Core) — see the comment on
 * `web/lib/lanes.ts`'s `hasChildren` — so these are lightweight source-level
 * conformance checks (mirroring the meter script's approach) plus direct
 * calls into the browser-safe projection helpers actually shipped to the
 * client (`web/lib/status-label.ts`, `web/lib/lanes.ts`).
 */

import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { label as fieldRegistryLabel } from "../core/field-registry.ts";
import type { Task } from "../types/index.ts";
import { hasChildren } from "../web/lib/lanes.ts";
import { getStatusBadgeClass } from "../web/lib/status-label.ts";

const TASK_DETAILS_MODAL_PATH = join(process.cwd(), "src", "web", "components", "TaskDetailsModal.tsx");
const TASK_LIST_PATH = join(process.cwd(), "src", "web", "components", "TaskList.tsx");

describe("phase-only status projection has no role prefix (BACK-664 child 1)", () => {
	it("label() never prefixes 'Basic:'/'Epic:' regardless of role", () => {
		for (const role of ["compound", "primitive"] as const) {
			for (const phase of ["ready", "needs-human", "done", "decomposing"]) {
				const displayed = fieldRegistryLabel(role, phase, []);
				expect(displayed).not.toMatch(/^Basic:\s*/);
				expect(displayed).not.toMatch(/^Epic:\s*/);
			}
		}
	});

	it("compound and primitive tasks in the same phase render identical status text", () => {
		const compound = fieldRegistryLabel("compound", "needs-human", []);
		const primitive = fieldRegistryLabel("primitive", "needs-human", []);
		expect(compound).toBe(primitive);
		expect(compound).toBe("Needs Human");
	});

	it("web status-badge lookup accepts bare phase-derived status strings", () => {
		// Should not throw and should resolve a class regardless of role-prefix absence.
		const cls = getStatusBadgeClass("Ready", "ready", "execution");
		expect(typeof cls).toBe("string");
		expect(cls.length).toBeGreaterThan(0);
	});
});

describe("has-children is independent of status (never concatenated into it)", () => {
	const makeTask = (overrides: Partial<Task>): Task => ({
		id: "TASK-1",
		title: "Task",
		status: "To Do",
		assignee: [],
		createdDate: "2026-01-01 00:00",
		labels: [],
		dependencies: [],
		...overrides,
	});

	it("hasChildren does not alter or depend on the task's status string", () => {
		const parent = makeTask({ id: "TASK-1", status: "Needs Human" });
		const child = makeTask({ id: "TASK-1.1", parentTaskId: "TASK-1", status: "Done" });
		expect(hasChildren(parent, [parent, child])).toBe(true);
		expect(parent.status).toBe("Needs Human");
	});
});

describe("web status surface is read-only (no editable status dropdown)", () => {
	it("TaskDetailsModal.tsx does not define or render a StatusSelect control", async () => {
		const source = await readFile(TASK_DETAILS_MODAL_PATH, "utf8");
		expect(source).not.toContain("StatusSelect");
	});

	it("TaskDetailsModal.tsx renders status as read-only text, not a <select>", async () => {
		const source = await readFile(TASK_DETAILS_MODAL_PATH, "utf8");
		// The Status section header must exist, but must not be paired with a
		// status-editing <select>/onChange in the same block that reassigns status.
		expect(source).toContain('<SectionHeader title="Status" />');
		expect(source).not.toContain("handleInlineMetaUpdate({ status:");
	});

	it("TaskDetailsModal.tsx renders an independent has-children indicator", async () => {
		const source = await readFile(TASK_DETAILS_MODAL_PATH, "utf8");
		expect(source).toContain("hasChildren(task, availableTasks)");
	});
});

describe("web TaskList renders a has-children indicator and buckets by phase (BACK-664 child 1 / AC#5)", () => {
	it("TaskList.tsx imports and uses the shared hasChildren helper", async () => {
		const source = await readFile(TASK_LIST_PATH, "utf8");
		expect(source).toContain("hasChildren");
	});

	it("TaskList.tsx uses phase-based grouping (groupTasksByPhase), not a config-status string bucket key", async () => {
		const source = await readFile(TASK_LIST_PATH, "utf8");
		expect(source).toContain("groupTasksByPhase");
	});
});
