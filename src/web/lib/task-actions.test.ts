import { describe, expect, it } from "bun:test";
import type { TaskAction } from "../../types";
import { visibleTaskActions } from "./task-actions";

describe("visibleTaskActions (BACK-695 AC #3, BACK-706 whenPhase rename)", () => {
	const dispatch: TaskAction = {
		id: "dispatch",
		label: "Dispatch to worker",
		command: "manda-dispatch submit $TASK_ID",
		whenPhase: ["drafting", "backlog", "needs-human"],
	};
	const reviewDiff: TaskAction = { id: "review", label: "Review diff", command: "gh pr diff $TASK_ID" };

	it("shows an action with no whenPhase on every task", () => {
		expect(visibleTaskActions([reviewDiff], { phase: "done" })).toEqual([reviewDiff]);
		expect(visibleTaskActions([reviewDiff], { phase: "drafting" })).toEqual([reviewDiff]);
		expect(visibleTaskActions([reviewDiff], { phase: undefined })).toEqual([reviewDiff]);
	});

	it("shows a whenPhase-scoped action only on matching phases", () => {
		expect(visibleTaskActions([dispatch], { phase: "drafting" })).toEqual([dispatch]);
		expect(visibleTaskActions([dispatch], { phase: "backlog" })).toEqual([dispatch]);
		expect(visibleTaskActions([dispatch], { phase: "needs-human" })).toEqual([dispatch]);
		expect(visibleTaskActions([dispatch], { phase: "done" })).toEqual([]);
		expect(visibleTaskActions([dispatch], { phase: "implementing" })).toEqual([]);
	});

	it("mixes scoped and unscoped actions independently", () => {
		expect(visibleTaskActions([dispatch, reviewDiff], { phase: "done" })).toEqual([reviewDiff]);
		expect(visibleTaskActions([dispatch, reviewDiff], { phase: "backlog" })).toEqual([dispatch, reviewDiff]);
	});

	it("returns an empty array when taskActions is undefined or empty", () => {
		expect(visibleTaskActions(undefined, { phase: "backlog" })).toEqual([]);
		expect(visibleTaskActions([], { phase: "backlog" })).toEqual([]);
	});

	it("hides a whenPhase-scoped action on pure legacy tasks with no phase (BACK-706 AC #5)", () => {
		expect(visibleTaskActions([dispatch], { phase: undefined })).toEqual([]);
	});
});
