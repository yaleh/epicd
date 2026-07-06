/**
 * BACK-654 — regression tests, Phase A/B.
 *
 * Root cause: two independent DoD-checking implementations disagree.
 *
 *   - The TS path (dod-runner.ts -> adjudicate.ts -> complete.ts) correctly
 *     checks only the STRUCTURED `task.dod[].text` gates.
 *   - The production shell path (plugin/scripts/complete-task.sh) instead
 *     awk-scans the rendered "Definition of Done:" prose section (built by
 *     buildDefinitionOfDoneItems(), which only ever contains human-facing
 *     prose sentences from task.definitionOfDoneItems, NEVER the structured
 *     task.dod gates) and executes that prose text as literal shell commands
 *     via `bash -c`.
 *
 * The fix adds a separate, machine-parseable "DoD Gates:" section (rendered
 * by the new `buildDodGateLines`) that reflects ONLY the structured
 * `task.dod[].text` gates, in a format ("- #N <cmd>", no checkbox) that is
 * visually distinct from the prose "- [ ] #N <text>" checklist lines —
 * complete-task.sh is re-pointed at this new section instead of the prose one.
 */

import { describe, expect, it } from "bun:test";
import { buildDefinitionOfDoneItems, buildDodGateLines, formatTaskPlainText } from "../formatters/task-plain-text.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Sample task",
		status: "To Do",
		assignee: [],
		createdDate: "2026-07-06",
		labels: [],
		dependencies: [],
		...overrides,
	} as Task;
}

describe("BACK-654 regression: DoD prose vs structured gates never conflated", () => {
	it("buildDodGateLines renders task.dod[].text with a checkbox-free, index-prefixed format", () => {
		const task = makeTask({
			dod: [
				{ text: "true", checked: false },
				{ text: "bunx tsc --noEmit", checked: false },
			],
		});

		expect(buildDodGateLines(task)).toEqual(["- #1 true", "- #2 bunx tsc --noEmit"]);
	});

	it("buildDodGateLines returns [] when task.dod is absent/empty", () => {
		expect(buildDodGateLines(makeTask())).toEqual([]);
		expect(buildDodGateLines(makeTask({ dod: [] }))).toEqual([]);
	});

	it("formatTaskPlainText renders a 'DoD Gates:' section reflecting only task.dod, distinct from the prose checklist format", () => {
		const task = makeTask({
			dod: [{ text: "true", checked: false }],
			definitionOfDoneItems: [{ index: 1, text: "bun test (or scoped test) passes", checked: false }],
		});

		const output = formatTaskPlainText(task);
		expect(output).toContain("DoD Gates:");
		expect(output).toContain("- #1 true");
		// The gate line must never be mistakable for a prose checklist line.
		expect(output).not.toContain("- [ ] #1 true");
	});

	it("formatTaskPlainText prints 'No DoD gates defined' when task.dod is empty (matching the existing empty-state convention)", () => {
		const task = makeTask({ dod: [] });
		const output = formatTaskPlainText(task);
		expect(output).toContain("DoD Gates:");
		expect(output).toContain("No DoD gates defined");
	});

	it("buildDefinitionOfDoneItems only ever reflects prose definitionOfDoneItems, never task.dod", () => {
		const task = makeTask({
			dod: [
				{ text: "exit 1", checked: false },
				{ text: "rm -rf /nonexistent-marker", checked: false },
			],
			definitionOfDoneItems: [{ index: 1, text: "bun test (or scoped test) passes", checked: false }],
		});

		const items = buildDefinitionOfDoneItems(task);
		expect(items).toHaveLength(1);
		expect(items[0]?.text).toContain("bun test (or scoped test) passes");
		for (const item of items) {
			expect(item.text).not.toContain("exit 1");
			expect(item.text).not.toContain("rm -rf /nonexistent-marker");
		}
	});

	it("the rendered 'Definition of Done:' section in formatTaskPlainText never contains task.dod command text", () => {
		const task = makeTask({
			dod: [{ text: "false", checked: false }],
			definitionOfDoneItems: [{ index: 1, text: "code reviewed by a human", checked: false }],
		});

		const output = formatTaskPlainText(task);
		const start = output.indexOf("Definition of Done:");
		expect(start).toBeGreaterThanOrEqual(0);
		// Section ends at the next top-level heading ("DoD Gates:").
		const nextHeadingIdx = output.indexOf("DoD Gates:", start);
		expect(nextHeadingIdx).toBeGreaterThan(start);
		const section = output.slice(start, nextHeadingIdx);

		expect(section).toContain("code reviewed by a human");
		expect(section).not.toContain("- #1 false");
	});
});
