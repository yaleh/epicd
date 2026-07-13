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
	title: "A moderately long task title that takes up real header width",
	status: "Done",
	assignee: [],
	createdDate: "2025-01-01",
	labels: [],
	dependencies: [],
};

const taskActions: TaskAction[] = [{ id: "log-id", label: "Log Task ID", command: "echo $TASK_ID" }];

describe("Task detail modal header: title row vs. button row", () => {
	it("puts the close button on the title's own row, above a separate button row", () => {
		setupDom();

		const html = renderToString(
			<ThemeProvider>
				<TaskDetailsModal task={task} taskActions={taskActions} isOpen={true} onClose={() => {}} onArchive={() => {}} />
			</ThemeProvider>,
		);

		const closeButtonIndex = html.indexOf('aria-label="Close modal"');
		const actionButtonIndex = html.indexOf("Log Task ID");
		expect(closeButtonIndex).toBeGreaterThan(-1);
		expect(actionButtonIndex).toBeGreaterThan(-1);
		// close button (title row) renders before the action/Edit button row
		expect(closeButtonIndex).toBeLessThan(actionButtonIndex);
	});

	it("prevents header button labels from wrapping mid-word", () => {
		setupDom();

		const html = renderToString(
			<ThemeProvider>
				<TaskDetailsModal task={task} taskActions={taskActions} isOpen={true} onClose={() => {}} onArchive={() => {}} />
			</ThemeProvider>,
		);

		// "Log Task ID" button (TaskActionButtons) — match the text node (">Log Task ID<"), not the
		// aria-label attribute value, which also contains this text and would truncate the slice early.
		const actionButtonMarkupStart = html.lastIndexOf("<button", html.indexOf(">Log Task ID<"));
		const actionButtonMarkup = html.slice(actionButtonMarkupStart, html.indexOf(">Log Task ID<") + ">Log Task ID<".length);
		expect(actionButtonMarkup).toContain("whitespace-nowrap");

		// "Mark as completed" button (Done status)
		const completeButtonMarkupStart = html.lastIndexOf("<button", html.indexOf(">Mark as completed<"));
		const completeButtonMarkup = html.slice(completeButtonMarkupStart, html.indexOf(">Mark as completed<") + ">Mark as completed<".length);
		expect(completeButtonMarkup).toContain("whitespace-nowrap");

		// "Edit" button
		const editButtonMarkupStart = html.lastIndexOf("<button", html.indexOf(">Edit<"));
		const editButtonMarkup = html.slice(editButtonMarkupStart, html.indexOf(">Edit<") + 6);
		expect(editButtonMarkup).toContain("whitespace-nowrap");
	});
});
