import { describe, expect, it } from "bun:test";
import { auditDepthFor } from "../engine/retreat.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Ready",
		description: "",
		labels: [],
		filePath: "/fake/task-1.md",
		body: "",
		...overrides,
	} as unknown as Task;
}

describe("auditDepthFor (BACK-682 schema #5 — risk-scaled, reuses fixpoint-convergence RiskGated)", () => {
	it("is 'light' for a low-risk task with no IA, no risky paths, no risky labels", () => {
		const task = makeTask({ labels: ["kind:basic"] });
		expect(auditDepthFor(task, ["docs/readme.md"])).toBe("light");
	});

	it("is 'full' when the task Description declares an Integration Acceptance section", () => {
		const task = makeTask({
			description: "## Integration Acceptance\n\n```bash\nbun test\n```\n",
		});
		expect(auditDepthFor(task, ["docs/readme.md"])).toBe("full");
	});

	it("is 'full' when changedPaths touch src/engine/**", () => {
		const task = makeTask();
		expect(auditDepthFor(task, ["src/engine/complete.ts"])).toBe("full");
	});

	it("is 'full' when changedPaths touch src/security/**", () => {
		const task = makeTask();
		expect(auditDepthFor(task, ["src/security/auth.ts"])).toBe("full");
	});

	it("is 'full' when task labels include area:engine", () => {
		const task = makeTask({ labels: ["area:engine"] });
		expect(auditDepthFor(task, ["docs/readme.md"])).toBe("full");
	});

	it("is 'full' when task labels include area:security", () => {
		const task = makeTask({ labels: ["area:security"] });
		expect(auditDepthFor(task, ["docs/readme.md"])).toBe("full");
	});
});
