import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { renderToString } from "react-dom/server";
import type { Root } from "react-dom/client";
import type { Task, TaskAction } from "../types/index.ts";
import { ThemeProvider } from "../web/contexts/ThemeContext";
import { TaskDetailsModal } from "../web/components/TaskDetailsModal";

let activeRoot: Root | null = null;

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as Document;
	globalThis.navigator = dom.window.navigator as Navigator;
	globalThis.localStorage = dom.window.localStorage;

	if (!window.matchMedia) {
		window.matchMedia = () =>
			({
				matches: false,
				media: "",
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as MediaQueryList;
	}
};

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
});

const task: Task = {
	id: "TASK-1",
	title: "Task with actions",
	status: "To Do",
	assignee: [],
	createdDate: "2025-01-01",
	labels: [],
	dependencies: [],
};

const taskActions: TaskAction[] = [{ id: "log-id", label: "Log Task ID", command: "echo $TASK_ID" }];

describe("Task action buttons placement in TaskDetailsModal", () => {
	it("renders the action button in the title row, to the left of Edit, not in the sidebar", () => {
		setupDom();

		const html = renderToString(
			<ThemeProvider>
				<TaskDetailsModal task={task} taskActions={taskActions} isOpen={true} onClose={() => {}} />
			</ThemeProvider>,
		);

		expect(html).toContain("Log Task ID");
		expect(html).toContain("Edit");

		const actionButtonIndex = html.indexOf("Log Task ID");
		const editButtonIndex = html.indexOf(">Edit<");
		expect(actionButtonIndex).toBeGreaterThan(-1);
		expect(editButtonIndex).toBeGreaterThan(-1);
		expect(actionButtonIndex).toBeLessThan(editButtonIndex);

		// no separate "Actions" sidebar section anymore
		expect(html).not.toContain(">Actions<");
	});
});
