/**
 * Phase D — `renderAdjudicatingDispatch()` (BACK-682 AC#7): the self-contained
 * dispatch block for a task sitting in `execution/adjudicating`. Spawns a
 * fresh-context independent leaf audit agent (never the implementer's own
 * context), same style as `renderEpicEvalDueDispatch`/`renderEpicReadyDispatch`
 * (`src/engine/dispatch.ts`).
 */
import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { renderAdjudicatingDispatch } from "../engine/dispatch.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

describe("renderAdjudicatingDispatch — self-contained payload (BACK-682)", () => {
	const payload = renderAdjudicatingDispatch("BACK-999", "Some task title");

	it("puts the stable machine key on the first line", () => {
		expect(payload.split("\n")[0]).toBe("adjudicating-due:BACK-999");
	});

	it("instructs a fresh-context Agent spawn, never the implementer's own context", () => {
		expect(payload).toMatch(/fresh-context/i);
		expect(payload).toContain("never the context that implemented BACK-999");
	});

	it("instructs reading AC/Description and the merged diff, not the implementer's self-report", () => {
		expect(payload).toContain("Acceptance Criteria");
		expect(payload).toContain("merged diff");
		expect(payload).toMatch(/do NOT accept the implementer's own Implementation/);
	});

	it("references the adjudicate skill methodology, not an inlined audit method", () => {
		expect(payload).toContain("plugin/skills/adjudicate/SKILL.md");
	});

	it("carries the anti-triage guardrails in the payload itself", () => {
		expect(payload).toContain("Do NOT re-arm the Monitor");
		expect(payload).toContain("Do NOT ask the user for confirmation");
	});

	it("does not hand-edit phase directly for a retreat verdict", () => {
		expect(payload).toContain("do not hand-edit `phase` directly for a `retreat` verdict");
	});
});

describe("engine dispatch <id> — adjudicating phase branch (BACK-682)", () => {
	it("prints the adjudicating-due payload for a task in the adjudicating phase", async () => {
		const projectRoot = createUniqueTestDir("engine-dispatch-adjudicating");
		const core = new Core(projectRoot);
		await initializeTestProject(core, "engine-dispatch-adjudicating-test");
		try {
			const { task } = await core.createTaskFromInput({ title: "Adjudicate me", status: "To Do" }, false);
			await core.updateTask({ ...task, pipeline_id: "execution", phase: "adjudicating" } as Task, false);

			const out = execFileSync("bun", [CLI_PATH, "engine", "dispatch", task.id], {
				cwd: projectRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});

			expect(out.split("\n")[0]).toBe(`adjudicating-due:${task.id}`);
			expect(out).toContain("plugin/skills/adjudicate/SKILL.md");
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});

	it("rejects a concurrent second dispatch of the same adjudicating task (BACK-686.1 A2 AC#4 mutex)", async () => {
		const projectRoot = createUniqueTestDir("engine-dispatch-adjudicating-mutex");
		const core = new Core(projectRoot);
		await initializeTestProject(core, "engine-dispatch-adjudicating-mutex-test");
		try {
			const { task } = await core.createTaskFromInput({ title: "Adjudicate me twice", status: "To Do" }, false);
			await core.updateTask(
				{ ...task, pipeline_id: "execution", phase: "adjudicating", entry_phase: "authoring/refining" } as Task,
				false,
			);

			const first = execFileSync("bun", [CLI_PATH, "engine", "dispatch", task.id], {
				cwd: projectRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			expect(first.split("\n")[0]).toBe(`adjudicating-due:${task.id}`);

			expect(() =>
				execFileSync("bun", [CLI_PATH, "engine", "dispatch", task.id], {
					cwd: projectRoot,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				}),
			).toThrow();
		} finally {
			await rm(projectRoot, { recursive: true, force: true });
		}
	});
});
