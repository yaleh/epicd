import { describe, expect, it } from "bun:test";
import { buildKanbanStatusGroups } from "../board.ts";
import { displayStatus, label } from "../core/field-registry.ts";
import { formatTaskPlainText } from "../formatters/task-plain-text.ts";
import type { Task } from "../types/index.ts";

/**
 * BACK-611 (BACK-601.4): the single `label(role, phase)` projection is the one
 * place that computes a status *display* string. Config declares the vocabulary
 * as `"<Role>: <Phase>"`; the projection resolves a (role, bare-phase) pair to
 * the config-declared string, converging the implicit status-vs-phase split.
 */

// The real epicd status vocabulary (backlog/config.yml). label() resolves the
// canonical casing against this list.
const STATUSES = [
	"Epic: Proposal",
	"Epic: Plan",
	"Epic: Backlog",
	"Epic: Ready",
	"Epic: Decomposing",
	"Epic: Awaiting Children",
	"Epic: Evaluating",
	"Epic: Done",
	"Epic: Needs Human",
	"Epic: Draft",
	"Epic: Refining",
	"Basic: Proposal",
	"Basic: Plan",
	"Basic: Backlog",
	"Basic: Ready",
	"Basic: In Progress",
	"Basic: Done",
	"Basic: Needs Human",
	"Basic: Draft",
	"Basic: Refining",
];

function baseTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Projection Task",
		status: "Basic: Backlog",
		assignee: [],
		createdDate: "2026-07-04",
		labels: [],
		dependencies: [],
		...overrides,
	};
}

describe("label(role, phase) projection", () => {
	it("maps role → prefix (primitive⇒Basic, compound⇒Epic)", () => {
		expect(label("primitive", "ready", STATUSES)).toBe("Basic: Ready");
		expect(label("compound", "ready", STATUSES)).toBe("Epic: Ready");
	});

	it("resolves canonical casing for multi-word kebab phases against config", () => {
		expect(label("primitive", "needs-human", STATUSES)).toBe("Basic: Needs Human");
		expect(label("compound", "awaiting-children", STATUSES)).toBe("Epic: Awaiting Children");
		expect(label("compound", "decomposing", STATUSES)).toBe("Epic: Decomposing");
	});

	it("is the config-declared string exactly (no residual hand-built concat)", () => {
		// Every engine phase for a primitive must land on a real config value.
		for (const phase of ["ready", "in-progress", "done", "needs-human"]) {
			expect(STATUSES).toContain(label("primitive", phase, STATUSES));
		}
	});

	it("falls back to title-cased phase when config has no matching entry", () => {
		expect(label("primitive", "in-progress", [])).toBe("Basic: In Progress");
		expect(label("compound", "some-new-phase", [])).toBe("Epic: Some New Phase");
	});
});

describe("displayStatus(task, statuses) — the single display read", () => {
	it("derives from (role, phase) when the task carries an engine phase", () => {
		// Persisted status is stale/bare; phase is the live axis the engine advances.
		const task = baseTask({ status: "Basic: Backlog", phase: "needs-human" });
		expect(displayStatus(task, STATUSES)).toBe("Basic: Needs Human");
	});

	it("derives compound prefix from tree (children ⇒ Epic)", () => {
		const task = baseTask({ status: "Basic: Backlog", phase: "ready", subtasks: ["task-1.1"] });
		expect(displayStatus(task, STATUSES)).toBe("Epic: Ready");
	});

	it("honors a stored role over tree derivation", () => {
		const task = baseTask({ phase: "ready", role: "compound" });
		expect(displayStatus(task, STATUSES)).toBe("Epic: Ready");
	});

	it("falls back to the persisted status string when no engine phase is present", () => {
		const task = baseTask({ status: "In Progress", phase: undefined });
		expect(displayStatus(task, STATUSES)).toBe("In Progress");
	});
});

describe("display consumers repointed to the projection (Phase B)", () => {
	it("board groups an engine-advanced task by its derived display status", () => {
		// status persisted stale as "Basic: Backlog", but the engine advanced phase.
		const task = baseTask({ status: "Basic: Backlog", phase: "ready" });
		const { groupedTasks } = buildKanbanStatusGroups([task], STATUSES);
		expect(groupedTasks.get("Basic: Ready")?.map((t) => t.id)).toEqual(["task-1"]);
		expect(groupedTasks.get("Basic: Backlog") ?? []).toEqual([]);
	});

	it("CLI plain-text Status line shows the derived display status", () => {
		const task = baseTask({ status: "Basic: Backlog", phase: "needs-human" });
		const out = formatTaskPlainText(task, { statuses: STATUSES });
		expect(out).toContain("Status: ○ Basic: Needs Human");
		expect(out).not.toContain("Basic: Backlog");
	});

	it("plain-text falls back to persisted status without config/phase (no regression)", () => {
		const task = baseTask({ status: "In Progress", phase: undefined });
		expect(formatTaskPlainText(task)).toContain("Status: ◒ In Progress");
	});
});
