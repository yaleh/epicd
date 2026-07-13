import { describe, expect, it } from "bun:test";
import type { TaskAction } from "../../types";
import { visibleTaskActions } from "./task-actions";

describe("visibleTaskActions (BACK-695 AC #3)", () => {
	const dispatch: TaskAction = {
		id: "dispatch",
		label: "Dispatch to worker",
		command: "manda-dispatch submit $TASK_ID",
		whenStatus: ["To Do", "In Progress"],
	};
	const reviewDiff: TaskAction = { id: "review", label: "Review diff", command: "gh pr diff $TASK_ID" };

	it("shows an action with no whenStatus on every task", () => {
		expect(visibleTaskActions([reviewDiff], { status: "Done" })).toEqual([reviewDiff]);
		expect(visibleTaskActions([reviewDiff], { status: "To Do" })).toEqual([reviewDiff]);
	});

	it("shows a whenStatus-scoped action only on matching statuses", () => {
		expect(visibleTaskActions([dispatch], { status: "To Do" })).toEqual([dispatch]);
		expect(visibleTaskActions([dispatch], { status: "In Progress" })).toEqual([dispatch]);
		expect(visibleTaskActions([dispatch], { status: "Done" })).toEqual([]);
	});

	it("mixes scoped and unscoped actions independently", () => {
		expect(visibleTaskActions([dispatch, reviewDiff], { status: "Done" })).toEqual([reviewDiff]);
		expect(visibleTaskActions([dispatch, reviewDiff], { status: "To Do" })).toEqual([dispatch, reviewDiff]);
	});

	it("returns an empty array when taskActions is undefined or empty", () => {
		expect(visibleTaskActions(undefined, { status: "To Do" })).toEqual([]);
		expect(visibleTaskActions([], { status: "To Do" })).toEqual([]);
	});
});
