/**
 * BACK-605.5 — epic-decompose INTEGRATION tests (real Core, real child creation).
 *
 * These tests exercise the REAL create/scan path, not a fake that bypasses it:
 *   - the decomposer worker only *proposes* children as JSON (fake spawn returns output);
 *   - the ENGINE creates them via core.createTaskFromInput with engine fields;
 *   - children are asserted engine-visible (queryTasks: pipeline_id/phase/parent_id);
 *   - idempotency is asserted against BOARD TRUTH (parent_id), not task.subtasks.
 *
 * This is the gate that would have caught the earlier DoD-green stub: a fake that
 * returns success without creating children now fails the child-count assertions.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { displayStatus, label } from "../core/field-registry.ts";
import { type CompletionResult, completeTask } from "../engine/complete.ts";
import {
	DEFAULT_CHILD_DOD_GATES,
	findTouchesOverlaps,
	makeDecomposer,
	parseProposedChildren,
} from "../harness/decomposer.ts";
import { runDoD } from "../harness/dod-runner.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

/** Create a compound epic on the real board, enrolled in the execution pipeline. */
async function createEpic(core: Core, title: string): Promise<Task> {
	const { task } = await core.createTaskFromInput({ title, status: "To Do" }, false);
	const epic: Task = {
		...task,
		labels: [...(task.labels ?? []), "kind:epic"],
		pipeline_id: "execution",
		phase: "decomposing",
	};
	await core.updateTask(epic, false);
	return epic;
}

const CHILDREN_JSON = `Some worker preamble...
[{"title": "Child Alpha", "description": "delivers alpha"}, {"title": "Child Beta", "description": "delivers beta"}]`;

describe("makeDecomposer (integration, real Core)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-decompose");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-decompose-test");

		// Children are created with the engine-derived "Ready" status
		// (label("primitive", "ready")) — add it to the configured statuses
		// (mirroring this repo's own board, backlog/config.yml) so
		// createTaskFromInput's canonical-status validation accepts it,
		// alongside the default vocabulary createEpic's "To Do" needs.
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.statuses = [...(config.statuses ?? []), "Ready"];
			await core.filesystem.saveConfig(config);
		}
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("engine creates proposed children with engine fields; epic → awaiting-children", async () => {
		const epic = await createEpic(core, "Epic to decompose");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		// Children are actually on the board and engine-visible.
		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		for (const child of children) {
			expect(child.pipeline_id).toBe("execution");
			expect(child.phase).toBe("ready");
			expect(child.parent_id).toBe(epic.id);
		}
		expect(children.map((c) => c.title).sort()).toEqual(["Child Alpha", "Child Beta"]);

		// Epic advanced to awaiting-children.
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
	});

	it("idempotent: re-run does not create duplicate children and does not re-spawn", async () => {
		const epic = await createEpic(core, "Epic decomposed twice");

		let spawnCalls = 0;
		const fakeSpawn = async (): Promise<CompletionResult> => {
			spawnCalls++;
			return { success: true, output: CHILDREN_JSON };
		};
		const decompose = makeDecomposer(fakeSpawn, core);

		await decompose(epic, projectRoot);
		await decompose(epic, projectRoot); // second run must be a no-op for creation

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2); // not 4
		expect(spawnCalls).toBe(1); // worker not spawned again
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
	});

	it("worker failure → epic needs-human, no children created", async () => {
		const epic = await createEpic(core, "Epic decompose fails");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: false, error: "worker crashed" });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(0);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});

	it("no parseable children → epic needs-human, no children created", async () => {
		const epic = await createEpic(core, "Epic decompose empty");

		const fakeSpawn = async (): Promise<CompletionResult> => ({
			success: true,
			output: "I could not find any subtasks.",
		});
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(0);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});

	it("children-created transition sets both phase and status", async () => {
		const epic = await createEpic(core, "Epic status sync on success");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
		expect(reloaded?.status).toBe(label("compound", "awaiting-children"));
	});

	it("no-children/failure transition sets both phase and status", async () => {
		const epic = await createEpic(core, "Epic status sync on failure");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: false, error: "worker crashed" });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
		expect(reloaded?.status).toBe(label("compound", "needs-human"));
	});

	it("crash-recovery re-entry stabilisation sets both phase and status", async () => {
		const epic = await createEpic(core, "Epic status sync on re-entry");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot); // creates children, advances to awaiting-children

		// Simulate crash-recovery: phase regressed/stale relative to children already on board.
		const afterFirstRun = await core.getTask(epic.id);
		if (!afterFirstRun) throw new Error("epic not found after first decompose run");
		await core.updateTask({ ...afterFirstRun, phase: "decomposing" }, false);

		await decompose(epic, projectRoot); // re-entry: children exist, phase differs → stabilise

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
		expect(reloaded?.status).toBe(label("compound", "awaiting-children"));
	});

	it("ADR-016: overlapping touches → advisory note on epic, decompose still succeeds", async () => {
		const epic = await createEpic(core, "Epic with overlapping touches");

		const overlappingJson = JSON.stringify([
			{ title: "Child Alpha", description: "delivers alpha", touches: ["src/foo.ts", "src/shared.ts"] },
			{ title: "Child Beta", description: "delivers beta", touches: ["src/shared.ts", "src/bar.ts"] },
		]);
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: overlappingJson });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		// Non-blocking: children still created, epic still advances.
		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");

		// Advisory report attached to the epic.
		expect(reloaded?.implementationNotes).toContain("ADR-016");
		expect(reloaded?.implementationNotes).toContain("Child Alpha");
		expect(reloaded?.implementationNotes).toContain("Child Beta");
		expect(reloaded?.implementationNotes).toContain("src/shared.ts");
	});

	it("ADR-016: disjoint touches → no advisory note appended", async () => {
		const epic = await createEpic(core, "Epic with disjoint touches");

		const disjointJson = JSON.stringify([
			{ title: "Child Alpha", touches: ["src/foo.ts"] },
			{ title: "Child Beta", touches: ["src/bar.ts"] },
		]);
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: disjointJson });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
		expect(reloaded?.implementationNotes ?? "").not.toContain("ADR-016");
	});

	it("ADR-016 D2/D3: historically cochanging (but not declared-overlapping) siblings → advisory note", async () => {
		const epic = await createEpic(core, "Epic with historically coupled touches");

		const disjointJson = JSON.stringify([
			{ title: "Child Alpha", touches: ["src/a.ts"] },
			{ title: "Child Beta", touches: ["src/b.ts"] },
		]);
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: disjointJson });
		const fakeGitLog = async () =>
			[1700000000, 1700000001, 1700000002].map((ts) => [String(ts), "src/a.ts", "src/b.ts"].join("\0")).join("\0");
		const decompose = makeDecomposer(fakeSpawn, core, { gitLog: fakeGitLog, cochangeThreshold: 3 });
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
		expect(reloaded?.implementationNotes).toContain("ADR-016");
		expect(reloaded?.implementationNotes).toContain("历史强耦合");
		expect(reloaded?.implementationNotes).toContain("src/a.ts");
		expect(reloaded?.implementationNotes).toContain("src/b.ts");
	});

	it("created children get a status consistent with phase:ready", async () => {
		const epic = await createEpic(core, "Epic children status");

		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		for (const child of children) {
			expect(child.status).toBe(label("primitive", "ready"));
		}
	});

	it("BACK-634: a proposed child with dodGates gets a structured executable task.dod", async () => {
		const epic = await createEpic(core, "Epic with dod-gated child");
		const withDodGates = `[{"title": "Gated child", "dodGates": ["bunx tsc --noEmit", "bun run check ."]}]`;
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: withDodGates });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const [child] = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(child?.dod).toEqual([
			{ text: "bunx tsc --noEmit", checked: false },
			{ text: "bun run check .", checked: false },
		]);
	});

	it("BACK-649: a proposed child WITHOUT dodGates falls back to the project's standard structured dod (no more false needs-human)", async () => {
		const epic = await createEpic(core, "Epic with un-gated child");
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const [child] = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(child?.dod).toEqual(DEFAULT_CHILD_DOD_GATES.map((text) => ({ text, checked: false })));
	});

	it("BACK-649: runDoD/completeTask no longer falsely route a decompose-created child to needs-human", async () => {
		const epic = await createEpic(core, "Epic with un-gated child (runDoD)");
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const [child] = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		if (!child) throw new Error("expected a child to be created");

		// Trivially-true commands stand in for the project's real gates so this test
		// stays fast/hermetic — the point is that dod is non-empty and runDoD executes it.
		const trivialTask: Task = { ...child, dod: DEFAULT_CHILD_DOD_GATES.map(() => ({ text: "true", checked: false })) };
		const dodResults = await runDoD(trivialTask, projectRoot);
		expect(dodResults.length).toBeGreaterThan(0);
		expect(dodResults.every((r) => r.passed)).toBe(true);

		const updates: string[] = [];
		const store = {
			getTask: async () => trivialTask,
			updateTask: async (t: Task) => {
				updates.push(t.phase ?? "");
			},
		};
		await completeTask(child.id, { success: true, dodResults }, store);
		expect(updates).not.toContain("needs-human");
	});
});

describe("engine decompose-apply <taskId> — CLI end-to-end (BACK-628.4)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-decompose-apply-cli");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-decompose-apply-cli-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("creates children from stdin JSON and advances the epic to awaiting-children", async () => {
		const epic = await createEpic(core, "Epic via decompose-apply");
		const proposed = JSON.stringify([{ title: "Child A", description: "does a" }, { title: "Child B" }]);

		const out = execFileSync("bun", [CLI_PATH, "engine", "decompose-apply", epic.id], {
			cwd: projectRoot,
			input: proposed,
			encoding: "utf8",
		});

		expect(out).toContain("awaiting-children");
		expect(out).toContain("(2 children)");

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.map((c) => c.title).sort()).toEqual(["Child A", "Child B"]);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("awaiting-children");
	});

	it("empty JSON array routes the epic to needs-human, no children created", async () => {
		const epic = await createEpic(core, "Epic via decompose-apply, empty");

		const out = execFileSync("bun", [CLI_PATH, "engine", "decompose-apply", epic.id], {
			cwd: projectRoot,
			input: "[]",
			encoding: "utf8",
		});

		expect(out).toContain("needs-human");
		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(0);
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("needs-human");
	});
});

describe("engine evaluate <taskId> — CLI end-to-end (BACK-628.4)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-evaluate-cli");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-evaluate-cli-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("aggregates children into the epic's terminal phase (all done → done)", async () => {
		const epic = await createEpic(core, "Epic via evaluate");
		await core.updateTask({ ...epic, phase: "evaluating" }, false);
		const { task: c1 } = await core.createTaskFromInput({ title: "Child 1", status: "To Do" }, false);
		await core.updateTask({ ...c1, pipeline_id: "execution", phase: "done", parent_id: epic.id } as Task, false);
		const { task: c2 } = await core.createTaskFromInput({ title: "Child 2", status: "To Do" }, false);
		await core.updateTask({ ...c2, pipeline_id: "execution", phase: "done", parent_id: epic.id } as Task, false);

		const out = execFileSync("bun", [CLI_PATH, "engine", "evaluate", epic.id], {
			cwd: projectRoot,
			encoding: "utf8",
		});

		expect(out).toContain("done");
		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("done");
	});
});

describe("parseProposedChildren", () => {
	it("extracts a JSON array embedded in worker prose", () => {
		const children = parseProposedChildren(CHILDREN_JSON);
		expect(children).toEqual([
			{ title: "Child Alpha", description: "delivers alpha" },
			{ title: "Child Beta", description: "delivers beta" },
		]);
	});

	it("returns [] for missing/invalid output", () => {
		expect(parseProposedChildren(undefined)).toEqual([]);
		expect(parseProposedChildren("no json here")).toEqual([]);
		expect(parseProposedChildren("[not valid json]")).toEqual([]);
	});

	it("drops entries without a title", () => {
		expect(parseProposedChildren('[{"title": "Keep"}, {"description": "no title"}, {"title": "  "}]')).toEqual([
			{ title: "Keep" },
		]);
	});

	it("extracts touches when present as a string array (ADR-016 D1)", () => {
		expect(parseProposedChildren('[{"title": "A", "touches": ["src/a.ts", "src/b.ts"]}]')).toEqual([
			{ title: "A", touches: ["src/a.ts", "src/b.ts"] },
		]);
	});

	it("tolerates missing/malformed touches without dropping the child", () => {
		expect(
			parseProposedChildren(
				'[{"title": "A"}, {"title": "B", "touches": "not-an-array"}, {"title": "C", "touches": [1, 2]}]',
			),
		).toEqual([{ title: "A" }, { title: "B" }, { title: "C" }]);
	});

	it("extracts dodGates when present as a string array (BACK-634)", () => {
		expect(parseProposedChildren('[{"title": "A", "dodGates": ["bunx tsc --noEmit", "bun run check ."]}]')).toEqual([
			{ title: "A", dodGates: ["bunx tsc --noEmit", "bun run check ."] },
		]);
	});

	it("tolerates missing/malformed dodGates without dropping the child (BACK-634)", () => {
		expect(
			parseProposedChildren(
				'[{"title": "A"}, {"title": "B", "dodGates": "not-an-array"}, {"title": "C", "dodGates": [1, 2]}]',
			),
		).toEqual([{ title: "A" }, { title: "B" }, { title: "C" }]);
	});
});

describe("findTouchesOverlaps", () => {
	it("returns one entry per non-empty pairwise intersection", () => {
		const overlaps = findTouchesOverlaps([
			{ title: "A", touches: ["x.ts", "shared.ts"] },
			{ title: "B", touches: ["shared.ts", "y.ts"] },
			{ title: "C", touches: ["z.ts"] },
		]);
		expect(overlaps).toEqual([{ a: "A", b: "B", files: ["shared.ts"] }]);
	});

	it("returns [] when no children declare touches or none overlap", () => {
		expect(findTouchesOverlaps([{ title: "A" }, { title: "B" }])).toEqual([]);
		expect(
			findTouchesOverlaps([
				{ title: "A", touches: ["x.ts"] },
				{ title: "B", touches: ["y.ts"] },
			]),
		).toEqual([]);
	});
});

describe("BACK-627: create-path status derivation does not require board vocabulary", () => {
	let projectRoot: string;
	let core: Core;

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("decompose creates children on the DEFAULT board ([To Do, In Progress, Done]) without a canonical-status error", async () => {
		projectRoot = createUniqueTestDir("engine-decompose-default-board");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-decompose-default-board-test");
		// No config.statuses patch here — this is the regression case from finding #2:
		// a board that never declares "Ready" must not fail child creation.

		const epic = await createEpic(core, "Epic on default board");
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		for (const child of children) {
			expect(child.status).toBe("Ready");
			expect(displayStatus(child)).toBe("Ready");
		}
	});

	it("resolves phase→status against the config-declared vocabulary casing, not a title-case fallback", async () => {
		projectRoot = createUniqueTestDir("engine-decompose-custom-casing");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-decompose-custom-casing-test");

		// A board that declares off-title-case vocabulary for the "ready" phase
		// (status is phase-only now — no role prefix; only the phase casing varies).
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.statuses = [...(config.statuses ?? []), "READY"];
			await core.filesystem.saveConfig(config);
		}

		const epic = await createEpic(core, "Epic on custom-casing board");
		const fakeSpawn = async (): Promise<CompletionResult> => ({ success: true, output: CHILDREN_JSON });
		const decompose = makeDecomposer(fakeSpawn, core);
		await decompose(epic, projectRoot);

		const children = (await core.queryTasks({})).filter((t) => t.parent_id === epic.id);
		expect(children.length).toBe(2);
		for (const child of children) {
			expect(displayStatus(child, config?.statuses ?? [])).toBe("READY");
		}
	});
});

describe("BACK-627: Core.updateTask centralizes phase→status derivation", () => {
	let projectRoot: string;
	let core: Core;

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("writes task.status = displayStatus(task) whenever phase is present", async () => {
		projectRoot = createUniqueTestDir("engine-updatetask-status-sync");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-updatetask-status-sync-test");

		const epic = await createEpic(core, "Epic to close");
		await core.updateTask({ ...epic, phase: "done", status: "Epic: Done" }, false);

		const reloaded = await core.getTask(epic.id);
		// Even though the caller passed the stale/incoming status literally, the
		// persisted status is derived from phase — no desync between the two.
		expect(reloaded?.phase).toBe("done");
		expect(reloaded?.status).toBe(label("compound", "done"));
		expect(displayStatus(reloaded as Task)).toBe(label("compound", "done"));
	});

	it("leaves task.status untouched (no-op) for tasks without a phase", async () => {
		projectRoot = createUniqueTestDir("engine-updatetask-no-phase");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-updatetask-no-phase-test");

		const { task } = await core.createTaskFromInput({ title: "Plain task", status: "To Do" }, false);
		await core.updateTask({ ...task, title: "Plain task (renamed)" }, false);

		const reloaded = await core.getTask(task.id);
		expect(reloaded?.phase).toBeUndefined();
		expect(reloaded?.status).toBe("To Do");
	});
});
