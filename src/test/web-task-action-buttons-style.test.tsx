import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Task, TaskAction } from "../types/index.ts";
import { TaskActionButtons } from "../web/components/TaskActionButtons.tsx";

const task: Task = {
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-01-01",
};

const actions: TaskAction[] = [{ id: "log-id", label: "Log Task ID", command: "echo $TASK_ID" }];

let activeRoot: Root | null = null;

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as unknown as Document;
	globalThis.navigator = dom.window.navigator as unknown as Navigator;
	return dom;
};

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
});

describe("TaskActionButtons visual style", () => {
	it("uses a brighter, non-indigo primary color and no decorative icon", () => {
		setupDom();
		const container = document.getElementById("root") as HTMLElement;
		activeRoot = createRoot(container);
		act(() => {
			activeRoot?.render(
				<TaskActionButtons task={task} taskActions={actions} className="flex gap-1" onResult={() => {}} />,
			);
		});

		const button = container.querySelector("button") as HTMLButtonElement;
		expect(button).not.toBeNull();
		expect(button.className).not.toContain("indigo");
		expect(button.querySelector("svg")).toBeNull();
		expect(button.textContent).toBe("Log Task ID");
	});
});
