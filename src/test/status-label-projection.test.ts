import { describe, expect, it } from "bun:test";
import { buildKanbanStatusGroups } from "../board.ts";
import { displayStatus, label } from "../core/field-registry.ts";
import { formatTaskPlainText } from "../formatters/task-plain-text.ts";
import type { Task } from "../types/index.ts";

/**
 * BACK-611 (BACK-601.4), collapsed to phase-only by BACK-664 child 1 /
 * BACK-665 AC#2: the single `label(role, phase)` projection is the one place
 * that computes a status *display* string, and it is purely a function of
 * `phase` — there is no `Basic:`/`Epic:` role prefix. Whether a task is
 * compound (has children) is a separate has-children indicator, never
 * concatenated into the status string.
 */

// The real epicd status vocabulary, phase-only (no role prefix). label()
// resolves the canonical casing against this list.
const STATUSES = [
	"Proposal",
	"Plan",
	"Backlog",
	"Ready",
	"Decomposing",
	"Awaiting Children",
	"Evaluating",
	"Done",
	"Needs Human",
	"Draft",
	"Refining",
	"In Progress",
];

function baseTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Projection Task",
		status: "Backlog",
		assignee: [],
		createdDate: "2026-07-04",
		labels: [],
		dependencies: [],
		...overrides,
	};
}

describe("label(role, phase) projection — phase-only, no role prefix", () => {
	it("is purely a function of phase — role never affects the output", () => {
		expect(label("primitive", "ready", STATUSES)).toBe("Ready");
		expect(label("compound", "ready", STATUSES)).toBe("Ready");
		expect(label("primitive", "needs-human", STATUSES)).toBe(label("compound", "needs-human", STATUSES));
	});

	it("resolves canonical casing for multi-word kebab phases against config", () => {
		expect(label("primitive", "needs-human", STATUSES)).toBe("Needs Human");
		expect(label("compound", "awaiting-children", STATUSES)).toBe("Awaiting Children");
		expect(label("compound", "decomposing", STATUSES)).toBe("Decomposing");
	});

	it("is the config-declared string exactly (no residual hand-built concat)", () => {
		for (const phase of ["ready", "in-progress", "done", "needs-human"]) {
			expect(STATUSES).toContain(label("primitive", phase, STATUSES));
		}
	});

	it("falls back to title-cased phase when config has no matching entry", () => {
		expect(label("primitive", "in-progress", [])).toBe("In Progress");
		expect(label("compound", "some-new-phase", [])).toBe("Some New Phase");
	});

	it("never generates a Basic:/Epic: prefix", () => {
		expect(label("primitive", "needs-human")).not.toMatch(/^(Basic|Epic):/);
		expect(label("compound", "needs-human")).not.toMatch(/^(Basic|Epic):/);
	});
});

describe("displayStatus(task, statuses) — the single display read", () => {
	it("derives from phase when the task carries an engine phase", () => {
		// Persisted status is stale/bare; phase is the live axis the engine advances.
		const task = baseTask({ status: "Backlog", phase: "needs-human" });
		expect(displayStatus(task, STATUSES)).toBe("Needs Human");
	});

	it("is unaffected by compound-ness (children present or kind:epic label)", () => {
		const withChildren = baseTask({ status: "Backlog", phase: "ready", subtasks: ["task-1.1"] });
		const withEpicLabel = baseTask({ phase: "ready", labels: ["kind:epic"] });
		expect(displayStatus(withChildren, STATUSES)).toBe("Ready");
		expect(displayStatus(withEpicLabel, STATUSES)).toBe("Ready");
	});

	it("falls back to the persisted status string when no engine phase is present", () => {
		const task = baseTask({ status: "In Progress", phase: undefined });
		expect(displayStatus(task, STATUSES)).toBe("In Progress");
	});
});

describe("display consumers repointed to the projection (Phase B)", () => {
	it("board groups an engine-advanced task by its derived display status", () => {
		// status persisted stale as "Backlog", but the engine advanced phase.
		const task = baseTask({ status: "Backlog", phase: "ready" });
		const { groupedTasks } = buildKanbanStatusGroups([task], STATUSES);
		expect(groupedTasks.get("Ready")?.map((t) => t.id)).toEqual(["task-1"]);
		expect(groupedTasks.get("Backlog") ?? []).toEqual([]);
	});

	it("CLI plain-text Status line shows the derived display status", () => {
		const task = baseTask({ status: "Backlog", phase: "needs-human" });
		const out = formatTaskPlainText(task, { statuses: STATUSES });
		expect(out).toContain("Status: ○ Needs Human");
		expect(out).not.toContain("Backlog");
	});

	it("plain-text falls back to persisted status without config/phase (no regression)", () => {
		const task = baseTask({ status: "In Progress", phase: undefined });
		expect(formatTaskPlainText(task)).toContain("Status: ◒ In Progress");
	});
});
