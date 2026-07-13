/**
 * `engine dispatch` + scan-loop transport tests — BACK-625 / ADR-015.
 *
 * Proves the refactor's three orthogonal layers:
 *   1. Payload authority (AC #1/#8): `renderBasicReadyDispatch` (src/engine/dispatch.ts) and
 *      the `engine dispatch <id>` CLI produce a self-contained block — machine-key first line
 *      + absolute-path instruction — that is the exact input a Monitor seat OR raw `claude -p`
 *      executes with zero engine changes (swap-litmus).
 *   3. Acquisition dedup / self-clearing bridge (AC #4): scan-loop's `trackEvents` emits each
 *      machine key once on the rising edge, suppresses re-emit while the key is present, and
 *      edge-clears it when it leaves the emit set — never inspecting the payload.
 *   + engine-boundary half of the bridge: `scanReadyLines` stops emitting a task once its
 *     phase advances off `implementing` (what `engine complete` does).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import * as dispatchModule from "../engine/dispatch.ts";
import { renderBasicReadyDispatch } from "../engine/dispatch.ts";
import { scanReadyLines } from "../engine/scan.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const require = createRequire(import.meta.url);
const scanLoop = require("../../plugin/scripts/scan-loop.cjs") as {
	trackEvents: (notified: Map<string, Set<string>>, lines: string[]) => Array<{ prefix: string; id: string }>;
};

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

describe("renderBasicReadyDispatch — self-contained payload (AC #1/#8)", () => {
	// Deliberately NOT "backlog" here (BACK-701): asserts the board directory name is threaded
	// through as a parameter, not hardcoded, by using a value that would fail every assertion
	// below if renderBasicReadyDispatch silently fell back to a literal "backlog".
	const payload = renderBasicReadyDispatch(
		"BACK-999",
		"Some task title",
		"/abs/repo",
		"/abs/repo/.epicd/.caps/BACK-999.wt",
		".epicd",
	);

	it("puts the stable machine key on the first line", () => {
		expect(payload.split("\n")[0]).toBe("basic-ready:BACK-999");
	});

	it("bakes in absolute paths (no cwd/env assumed by the reader shell)", () => {
		expect(payload).toContain("/abs/repo/plugin/scripts/handle-basic-ready.sh BACK-999");
		expect(payload).toContain("/abs/repo/.epicd/.agent-done-BACK-999");
	});

	it("carries the full worktree → Agent → sentinel → engine complete flow", () => {
		expect(payload).toContain("Agent(run_in_background=true)");
		expect(payload).toContain(".agent-done-BACK-999");
		expect(payload).toContain("engine complete BACK-999 --worktree");
	});

	it("carries the anti-triage guardrails in the payload itself (not the Monitor description)", () => {
		expect(payload).toContain("Do NOT re-arm the Monitor");
		expect(payload).toContain("Do NOT ask the user for confirmation");
	});

	it("keeps the BACK-619 board-file exclusion using the resolved board directory name", () => {
		expect(payload).toContain(":!.epicd/tasks");
	});

	it("does not instruct a bare `git add -A && git commit` without excluding the board file (BACK-619)", () => {
		// Negative guard carried over from the retired template test: a future added commit line
		// that omits the exclusion must fail even though the first exclusion still satisfies the
		// positive check above.
		expect(payload).not.toMatch(/git add -A && git commit(?!.*\.epicd\/tasks)/);
	});

	it("leaves no unsubstituted template tokens", () => {
		expect(payload).not.toContain("__TASK_ID__");
		expect(payload).not.toContain("__TASK_TITLE__");
		expect(payload).not.toContain("${REPO_ROOT}");
	});
});

describe("engine dispatch <id> — CLI end-to-end", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-dispatch");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-dispatch-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("prints the self-contained dispatch block for an actionable task", async () => {
		const { task } = await core.createTaskFromInput({ title: "Dispatch me", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "implementing" } as Task, false);

		const out = execFileSync("bun", [CLI_PATH, "engine", "dispatch", task.id], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});

		expect(out.split("\n")[0]).toBe(`basic-ready:${task.id}`);
		expect(out).toContain(`handle-basic-ready.sh ${task.id}`);
		expect(out).toContain(`engine complete ${task.id} --worktree`);
		// absolute repo root is baked in
		expect(out).toContain(projectRoot);
	});
});

describe("renderEpicReadyDispatch — retired (BACK-686.3)", () => {
	it("dispatch.ts no longer exports renderEpicReadyDispatch — decompose is a runtime branch inside implementing, not a separately dispatched phase", () => {
		expect("renderEpicReadyDispatch" in dispatchModule).toBe(false);
	});
});

describe("renderEpicEvalDueDispatch — retired (BACK-686.2 AC#2/#3)", () => {
	it("dispatch.ts no longer exports renderEpicEvalDueDispatch — evaluating is retired, folded into the adjudicating gate", () => {
		expect("renderEpicEvalDueDispatch" in dispatchModule).toBe(false);
	});
});

describe("engine dispatch <id> — branches by phase (BACK-628.4)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-dispatch-epic-phase");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-dispatch-epic-phase-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("prints the basic-ready payload for an epic-labeled task in implementing (BACK-686.3 — decompose-vs-leaf is now a runtime branch, not a dispatch-time fork)", async () => {
		const { task } = await core.createTaskFromInput(
			{ title: "Epic to decompose", status: "To Do", labels: ["kind:epic"] },
			false,
		);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "implementing" } as Task, false);

		const out = execFileSync("bun", [CLI_PATH, "engine", "dispatch", task.id], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});

		// Same self-contained basic-ready payload as any other implementing task — the
		// primitive-executor skill (dispatched via this payload) is the one that judges
		// leaf vs compound and, if compound, calls `engine decompose-apply` itself.
		expect(out.split("\n")[0]).toBe(`basic-ready:${task.id}`);
	});
});

describe("scan-loop trackEvents — self-clearing bridge (AC #4)", () => {
	function seed(): Map<string, Set<string>> {
		return new Map([["basic-ready", new Set<string>()]]);
	}

	it("emits a new machine key once on the rising edge", () => {
		const notified = seed();
		const fresh = scanLoop.trackEvents(notified, ["basic-ready:T1"]);
		expect(fresh).toEqual([{ prefix: "basic-ready", id: "T1" }]);
	});

	it("suppresses re-emit while the key stays present (claimed/In-Progress window)", () => {
		const notified = seed();
		scanLoop.trackEvents(notified, ["basic-ready:T1"]);
		const again = scanLoop.trackEvents(notified, ["basic-ready:T1"]);
		expect(again).toEqual([]);
	});

	it("edge-clears a key that leaves the emit set, and re-emits if it returns", () => {
		const notified = seed();
		scanLoop.trackEvents(notified, ["basic-ready:T1"]);
		// task claimed → completed → phase off ready → drops out of the pulse:
		const cleared = scanLoop.trackEvents(notified, []);
		expect(cleared).toEqual([]);
		expect(notified.get("basic-ready")?.has("T1")).toBe(false);
		// if it ever becomes actionable again, it re-emits (no stale suppression):
		const reemit = scanLoop.trackEvents(notified, ["basic-ready:T1"]);
		expect(reemit).toEqual([{ prefix: "basic-ready", id: "T1" }]);
	});

	it("never emits a channel that was not pre-seeded for this mode", () => {
		const notified = seed(); // only basic-ready seeded
		const fresh = scanLoop.trackEvents(notified, ["epic-ready:E1", "basic-ready:T2"]);
		expect(fresh).toEqual([{ prefix: "basic-ready", id: "T2" }]);
	});
});

describe("scanReadyLines — engine-boundary self-clear (AC #4)", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-dispatch-scan");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-dispatch-scan-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("emits an implementing task, then stops once its phase advances off implementing", async () => {
		const { task } = await core.createTaskFromInput({ title: "Bridge", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "implementing" } as Task, false);

		expect(scanReadyLines(await core.queryTasks({}))).toContain(`basic-ready:${task.id}`);

		const claimed = (await core.getTask(task.id)) as Task;
		await core.updateTask({ ...claimed, phase: "done" }, false);

		expect(scanReadyLines(await core.queryTasks({}))).not.toContain(`basic-ready:${task.id}`);
	});
});
