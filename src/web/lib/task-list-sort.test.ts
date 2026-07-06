import { describe, expect, it } from "bun:test";
import type { Task } from "../../types";
import type { ClaimState } from "./coordinator-claims";
import { DRIVER_INDICATOR_ICON } from "./driver-indicator";
import {
	canShowGateActions,
	driverPriorityRank,
	filterVisibleTasks,
	getTaskDriverIndicator,
	isTaskTerminal,
	sortTasksByDriverPriority,
} from "./task-list-sort";

// BACK-653 AC#7: fixtures covering the three driver-indicator scenarios named in the
// task, plus a terminal (actor=none) task and a "no pipeline info yet" legacy task so
// the full priority ladder (👤 > ⚠️ > 🤖 > ⏳ > [no-indicator] > ✓) can be exercised.
function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
	return {
		id: overrides.id,
		title: overrides.title ?? `Task ${overrides.id}`,
		status: overrides.status ?? "To Do",
		assignee: overrides.assignee ?? [],
		createdDate: overrides.createdDate ?? "2026-07-01 00:00",
		labels: overrides.labels ?? [],
		dependencies: overrides.dependencies ?? [],
		pipeline_id: overrides.pipeline_id,
		phase: overrides.phase,
	};
}

// Scenario 1 (AC#7): pipeline_id=execution, phase=needs-human -> actor=human -> 👤.
const humanGateTask = makeTask({ id: "task-101", pipeline_id: "execution", phase: "needs-human" });

// Scenario 2 (AC#7): actor=machine with an active Coordinator claim -> 🤖.
const activeClaimTask = makeTask({ id: "task-102", pipeline_id: "execution", phase: "ready" });

// Scenario 3 (AC#7): actor=machine with an expired/orphaned (stale) claim -> ⚠️.
const orphanedClaimTask = makeTask({ id: "task-103", pipeline_id: "execution", phase: "ready" });

// Extra fixtures to exercise the rest of the priority ladder.
const queuedTask = makeTask({ id: "task-104", pipeline_id: "execution", phase: "ready" });
const noPipelineTask = makeTask({ id: "task-105", status: "To Do" });
const terminalPhaseTask = makeTask({ id: "task-106", pipeline_id: "execution", phase: "done" });
const terminalStatusTask = makeTask({ id: "task-107", status: "Done" });

const claimStates: Record<string, ClaimState> = {
	[activeClaimTask.id]: "claimed",
	[orphanedClaimTask.id]: "stale",
	[queuedTask.id]: "unclaimed",
};

const availableStatuses = ["To Do", "In Progress", "Done"];

describe("getTaskDriverIndicator (BACK-653 fixtures)", () => {
	it("actor=human (execution/needs-human) -> human-gate, regardless of claim state", () => {
		expect(getTaskDriverIndicator(humanGateTask, claimStates)).toBe("human-gate");
		expect(DRIVER_INDICATOR_ICON["human-gate"]).toBe("👤");
	});

	it("actor=machine with an active Coordinator claim -> agent-active", () => {
		expect(getTaskDriverIndicator(activeClaimTask, claimStates)).toBe("agent-active");
		expect(DRIVER_INDICATOR_ICON["agent-active"]).toBe("🤖");
	});

	it("actor=machine with an expired/orphaned claim -> stale", () => {
		expect(getTaskDriverIndicator(orphanedClaimTask, claimStates)).toBe("stale");
		expect(DRIVER_INDICATOR_ICON.stale).toBe("⚠️");
	});

	it("actor=machine, unclaimed (no active/expired claim) -> queued", () => {
		expect(getTaskDriverIndicator(queuedTask, claimStates)).toBe("queued");
		expect(DRIVER_INDICATOR_ICON.queued).toBe("⏳");
	});

	it("actor=none (terminal phase), or no pipeline/phase info -> no indicator", () => {
		expect(getTaskDriverIndicator(terminalPhaseTask, claimStates)).toBeNull();
		expect(getTaskDriverIndicator(noPipelineTask, claimStates)).toBeNull();
	});
});

describe("isTaskTerminal (BACK-653 AC#3)", () => {
	it("is terminal when the pipeline declares the phase's actor as none", () => {
		expect(isTaskTerminal(terminalPhaseTask, availableStatuses)).toBe(true);
	});

	it("is terminal when there's no pipeline/phase but status is the last configured status", () => {
		expect(isTaskTerminal(terminalStatusTask, availableStatuses)).toBe(true);
	});

	it("is not terminal for active human/machine phases", () => {
		expect(isTaskTerminal(humanGateTask, availableStatuses)).toBe(false);
		expect(isTaskTerminal(activeClaimTask, availableStatuses)).toBe(false);
		expect(isTaskTerminal(queuedTask, availableStatuses)).toBe(false);
	});

	it("is not terminal for a legacy task with no pipeline info and a non-terminal status", () => {
		expect(isTaskTerminal(noPipelineTask, availableStatuses)).toBe(false);
	});
});

describe("sortTasksByDriverPriority (BACK-653 AC#4)", () => {
	it("orders 👤 > ⚠️ > 🤖 > ⏳ > [no indicator] > ✓, regardless of input order", () => {
		const shuffled = [
			terminalPhaseTask,
			queuedTask,
			noPipelineTask,
			activeClaimTask,
			terminalStatusTask,
			humanGateTask,
			orphanedClaimTask,
		];

		const sorted = sortTasksByDriverPriority(shuffled, claimStates, availableStatuses);

		expect(sorted.map((task) => task.id)).toEqual([
			humanGateTask.id,
			orphanedClaimTask.id,
			activeClaimTask.id,
			queuedTask.id,
			noPipelineTask.id,
			// Terminal tasks tie-break by newest id first, like the rest of the list.
			terminalStatusTask.id,
			terminalPhaseTask.id,
		]);
	});

	it("never changes which tasks are present -- only their order", () => {
		const input = [queuedTask, humanGateTask, orphanedClaimTask];
		const sorted = sortTasksByDriverPriority(input, claimStates, availableStatuses);
		expect(new Set(sorted.map((t) => t.id))).toEqual(new Set(input.map((t) => t.id)));
	});
});

describe("filterVisibleTasks (BACK-653 AC#3: default-hide terminal tasks + toggle)", () => {
	const all = [humanGateTask, activeClaimTask, orphanedClaimTask, queuedTask, terminalPhaseTask, terminalStatusTask];

	it("hides terminal (actor=none-equivalent) tasks by default", () => {
		const visible = filterVisibleTasks(all, availableStatuses, false);
		expect(visible.map((t) => t.id)).not.toContain(terminalPhaseTask.id);
		expect(visible.map((t) => t.id)).not.toContain(terminalStatusTask.id);
		expect(visible).toHaveLength(4);
	});

	it("shows terminal tasks again once the 'show completed' toggle is on", () => {
		const visible = filterVisibleTasks(all, availableStatuses, true);
		expect(visible).toHaveLength(all.length);
	});
});

describe("canShowGateActions (BACK-646 inline gate-review: visibility/clickability gating)", () => {
	it("shows approve/reject/escalate only for actor=human rows", () => {
		expect(canShowGateActions(humanGateTask)).toBe(true);
	});

	it("hides approve/reject/escalate for actor=machine rows (active claim, orphaned claim, or queued)", () => {
		expect(canShowGateActions(activeClaimTask)).toBe(false);
		expect(canShowGateActions(orphanedClaimTask)).toBe(false);
		expect(canShowGateActions(queuedTask)).toBe(false);
	});

	it("hides approve/reject/escalate for terminal (actor=none) rows", () => {
		expect(canShowGateActions(terminalPhaseTask)).toBe(false);
	});
});

describe("driverPriorityRank (BACK-653 AC#4 numeric ladder)", () => {
	it("assigns strictly increasing ranks matching the required priority order", () => {
		const ranks = [
			humanGateTask,
			orphanedClaimTask,
			activeClaimTask,
			queuedTask,
			noPipelineTask,
			terminalStatusTask,
		].map((task) => driverPriorityRank(task, claimStates, availableStatuses));

		for (let i = 1; i < ranks.length; i++) {
			expect(ranks[i] as number).toBeGreaterThan(ranks[i - 1] as number);
		}
	});
});
