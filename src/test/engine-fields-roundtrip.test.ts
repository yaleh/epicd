import { describe, expect, it } from "bun:test";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";

describe("Engine fields roundtrip", () => {
	it("parses all six engine fields from frontmatter", () => {
		const markdown = `---
id: task-1
title: Engine Test Task
status: "In Progress"
assignee: []
created_date: 2026-06-26
labels: []
dependencies: []
pipeline_id: pipe-abc
state: running
role: executor
parent_id: task-0
dod:
  - text: "All tests pass"
    checked: false
  - text: "Code reviewed"
    checked: true
cap:
  - kind: safety
    value: "L2"
---

## Description

Test task with engine fields.
`;

		const task = parseTask(markdown);

		expect(task.pipeline_id).toBe("pipe-abc");
		expect(task.state).toBe("running");
		expect(task.role).toBe("executor");
		expect(task.parent_id).toBe("task-0");
		expect(task.dod).toEqual([
			{ text: "All tests pass", checked: false },
			{ text: "Code reviewed", checked: true },
		]);
		expect(task.cap).toEqual([{ kind: "safety", value: "L2" }]);
	});

	it("roundtrips all six engine fields (serialize then re-parse)", () => {
		const markdown = `---
id: task-1
title: Engine Test Task
status: "In Progress"
assignee: []
created_date: 2026-06-26
labels: []
dependencies: []
pipeline_id: pipe-abc
state: running
role: executor
parent_id: task-0
dod:
  - text: "All tests pass"
    checked: false
  - text: "Code reviewed"
    checked: true
cap:
  - kind: safety
    value: "L2"
---

## Description

Test task with engine fields.
`;

		const original = parseTask(markdown);
		const serialized = serializeTask(original);
		const reparsed = parseTask(serialized);

		expect(reparsed.pipeline_id).toBe(original.pipeline_id);
		expect(reparsed.state).toBe(original.state);
		expect(reparsed.role).toBe(original.role);
		expect(reparsed.parent_id).toBe(original.parent_id);
		expect(reparsed.dod).toEqual(original.dod);
		expect(reparsed.cap).toEqual(original.cap);
	});

	it("does not introduce engine keys when absent (no churn)", () => {
		const markdown = `---
id: task-2
title: Plain Task
status: Backlog
assignee: []
created_date: 2026-06-26
labels: []
dependencies: []
---

## Description

A plain task with no engine fields.
`;

		const task = parseTask(markdown);
		expect(task.pipeline_id).toBeUndefined();
		expect(task.state).toBeUndefined();
		expect(task.role).toBeUndefined();
		expect(task.parent_id).toBeUndefined();
		expect(task.dod).toBeUndefined();
		expect(task.cap).toBeUndefined();

		const serialized = serializeTask(task);
		expect(serialized).not.toContain("pipeline_id");
		expect(serialized).not.toContain("state:");
		expect(serialized).not.toContain("role:");
		expect(serialized).not.toContain("parent_id:");
		expect(serialized).not.toContain("\ndod:");
		expect(serialized).not.toContain("\ncap:");
	});
});
