import { describe, expect, it } from "bun:test";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import { roleOf } from "../types/index.ts";

describe("Engine fields roundtrip", () => {
	it("parses engine fields (phase + pipeline_id) from frontmatter", () => {
		const markdown = `---
id: task-1
title: Engine Test Task
status: "In Progress"
assignee: []
created_date: 2026-06-26
labels: []
dependencies: []
pipeline_id: pipe-abc
phase: ready
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
		expect(task.phase).toBe("ready");
		expect(task.parent_id).toBe("task-0");
		expect(task.dod).toEqual([
			{ text: "All tests pass", checked: false },
			{ text: "Code reviewed", checked: true },
		]);
		expect(task.cap).toEqual([{ kind: "safety", value: "L2" }]);
	});

	it("roundtrips engine fields (serialize then re-parse)", () => {
		const markdown = `---
id: task-1
title: Engine Test Task
status: "In Progress"
assignee: []
created_date: 2026-06-26
labels: []
dependencies: []
pipeline_id: pipe-abc
phase: evaluating
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
		expect(reparsed.phase).toBe(original.phase);
		expect(reparsed.parent_id).toBe(original.parent_id);
		expect(reparsed.dod).toEqual(original.dod);
		expect(reparsed.cap).toEqual(original.cap);
	});

	it("serialized output contains 'phase:' not 'state:'", () => {
		const markdown = `---
id: task-1
title: Engine Test Task
status: "In Progress"
assignee: []
created_date: 2026-06-26
labels: []
dependencies: []
pipeline_id: pipe-abc
phase: needs-human
parent_id: task-0
---

## Description

Test task with engine fields.
`;

		const task = parseTask(markdown);
		const serialized = serializeTask(task);

		expect(serialized).toContain("phase:");
		expect(serialized).not.toContain("state:");
		expect(serialized).not.toContain("role:");
	});

	it("silently ignores a legacy role: key on parse and never re-serializes it (BACK-664.2 — 100% derived)", () => {
		const markdown = `---
id: task-plain
title: Plain Task
status: Backlog
assignee: []
created_date: 2026-07-04
labels: []
dependencies: []
role: compound
---

## Description

A task with a legacy pre-BACK-664.2 pre-declared-role frontmatter key.
`;
		const task = parseTask(markdown);
		expect((task as unknown as Record<string, unknown>).role).toBeUndefined();

		const serialized = serializeTask(task);
		expect(serialized).not.toContain("role:");
	});

	describe("roleOf", () => {
		it("derives compound from subtasks", () => {
			const task = parseTask(`---
id: t1
title: T
status: Backlog
assignee: []
created_date: 2026-07-04
labels: []
dependencies: []
subtasks:
  - t1.1
  - t1.2
---
`);
			expect(roleOf(task)).toBe("compound");
		});

		it("derives primitive when no role and no subtasks", () => {
			const task = parseTask(`---
id: t1
title: T
status: Backlog
assignee: []
created_date: 2026-07-04
labels: []
dependencies: []
---
`);
			expect(roleOf(task)).toBe("primitive");
		});

		it("derives compound from provided childIds, ignoring subtasks", () => {
			const task = parseTask(`---
id: t1
title: T
status: Backlog
assignee: []
created_date: 2026-07-04
labels: []
dependencies: []
---
`);
			expect(roleOf(task, ["t1.1"])).toBe("compound");
		});
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
		expect(task.phase).toBeUndefined();
		expect(task.parent_id).toBeUndefined();
		expect(task.dod).toBeUndefined();
		expect(task.cap).toBeUndefined();

		const serialized = serializeTask(task);
		expect(serialized).not.toContain("pipeline_id");
		expect(serialized).not.toContain("phase:");
		expect(serialized).not.toContain("state:");
		expect(serialized).not.toContain("role:");
		expect(serialized).not.toContain("parent_id:");
		expect(serialized).not.toContain("\ndod:");
		expect(serialized).not.toContain("\ncap:");
	});
});
