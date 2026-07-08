/**
 * BACK-657.3 — closes the ADR-019 evaluate gap: `evaluateEpic` (src/harness/
 * evaluator.ts) historically ONLY aggregated children's terminal phases (any child
 * needs-human → epic needs-human; all children done → epic done) and NEVER ran the
 * epic's own `## Integration Acceptance` shell commands from its Description. That let
 * an epic reach `done` even though its own end-to-end acceptance never ran — "all
 * children green but the assembled system doesn't actually work", exactly the failure
 * mode ADR-019 exists to prevent.
 *
 * This test proves the fix: an epic's Integration Acceptance commands are actually
 * spawned and checked before children are aggregated, and any failing command routes
 * the epic to `needs-human` regardless of children being all `done`.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { evaluateEpic } from "../harness/evaluator.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

async function createTask(core: Core, title: string, overrides: Partial<Task> = {}): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const withOverrides: Task = { ...task, pipeline_id: "execution", ...overrides };
	await core.updateTask(withOverrides, false);
	return withOverrides;
}

const PASSING_IA_DESCRIPTION = `## Integration Acceptance

1. Everything must pass.

\`\`\`sh
exit 0
\`\`\`
`;

const FAILING_IA_DESCRIPTION = `## Integration Acceptance

1. This command always fails.

\`\`\`sh
exit 1
\`\`\`
`;

describe("evaluateEpic runs the epic's own Integration Acceptance (ADR-019 gap fix)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("evaluate-ia");
		core = new Core(projectRoot);
		await initializeTestProject(core, "evaluate-ia-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("goes done when the epic's IA is all-green and all children are done", async () => {
		const epic = await createTask(core, "Epic", {
			phase: "adjudicating",
			description: PASSING_IA_DESCRIPTION,
		});
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "done", parent_id: epic.id });

		await evaluateEpic(core, epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("done");
	});

	it("routes to needs-human when the epic's IA has a failing command, even though all children are done", async () => {
		const epic = await createTask(core, "Epic", {
			phase: "adjudicating",
			description: FAILING_IA_DESCRIPTION,
		});
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "done", parent_id: epic.id });

		await evaluateEpic(core, epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});

	it("still routes to needs-human when IA is all-green but a child is needs-human", async () => {
		const epic = await createTask(core, "Epic", {
			phase: "adjudicating",
			description: PASSING_IA_DESCRIPTION,
		});
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "needs-human", parent_id: epic.id });

		await evaluateEpic(core, epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});

	it("falls back to today's children-only aggregation when the epic declares no Integration Acceptance section", async () => {
		const epic = await createTask(core, "Epic without IA", {
			phase: "adjudicating",
			description: "Just a plain description, no IA section.",
		});
		await createTask(core, "Child 1", { phase: "done", parent_id: epic.id });
		await createTask(core, "Child 2", { phase: "done", parent_id: epic.id });

		await evaluateEpic(core, epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("done");
	});
});
