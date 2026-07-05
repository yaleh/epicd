/**
 * ADR-010 ENG-1..ENG-5 — explicit, consolidated invariant coverage (BACK-603 AC#4).
 *
 * Each ENG-N invariant already has *behavioral* coverage scattered across the
 * suite (engine-supervisor.test.ts for ENG-1/ENG-4, engine-merge-wire.test.ts for
 * ENG-3, engine-safety-worktree.test.ts for worktree isolation,
 * harness-evaluator.test.ts for parent reconciliation). This file does not
 * duplicate that logic — it adds one EXPLICITLY ENG-N-labeled assertion per
 * invariant so "engine test suite carries the full ADR-010 set" is verifiable by
 * grep, not just inferred from unlabeled scenario names (docs/adr/ADR-010-engine-safety-invariants.md).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { addCapMarker, hasCapMarker, type WorktreeRunner, withCapGuard, withWorktree } from "../engine/safety.ts";
import { supervisorTick } from "../engine/supervisor.ts";
import { advanceAwaitingChildrenToEvaluating } from "../harness/evaluator.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

describe("ADR-010 ENG-1: cap idempotency — phase never executes twice", () => {
	it("withCapGuard skips fn on the second call for the same (task, phase)", async () => {
		let calls = 0;
		const task = { id: "T-1", title: "t", status: "Basic: Ready", cap: [] } as unknown as Task;
		const store = {
			getTask: async () => task,
			updateTask: async () => {},
		};

		await withCapGuard(
			task,
			"ready",
			async () => {
				calls++;
			},
			store,
		);
		// Same task snapshot still has no cap marker recorded server-side in this
		// stub, so re-derive the post-marker task the way the real store would.
		const marked = addCapMarker(task, "ready");
		expect(hasCapMarker(marked, "ready")).toBe(true);

		await withCapGuard(
			marked,
			"ready",
			async () => {
				calls++;
			},
			store,
		);

		expect(calls).toBe(1);
	});
});

describe("ADR-010 ENG-2: worktree isolation — spawn runs in its own worktree, always cleaned up", () => {
	let repoDir: string;

	beforeEach(async () => {
		repoDir = createUniqueTestDir("adr010-eng2");
		await mkdir(repoDir, { recursive: true });
		await $`git init -b main`.cwd(repoDir).quiet();
		await $`git config user.email "test@test.com"`.cwd(repoDir).quiet();
		await $`git config user.name "Test"`.cwd(repoDir).quiet();
		await writeFile(join(repoDir, "README.md"), "init");
		await $`git add README.md`.cwd(repoDir).quiet();
		await $`git commit -m "init"`.cwd(repoDir).quiet();
	});

	afterEach(async () => {
		await rm(repoDir, { recursive: true, force: true });
	});

	const gitRunner: WorktreeRunner = {
		add: async (repo, wt) => {
			await $`git -C ${repo} worktree add --detach ${wt}`.quiet();
		},
		remove: async (repo, wt) => {
			await $`git -C ${repo} worktree remove --force ${wt}`.quiet();
		},
		rmrf: (path) => rm(path, { recursive: true, force: true }),
		join: (...parts) => join(...parts),
	};

	it("ENG-2: worktree exists during fn and is guaranteed removed after, even on throw", async () => {
		let pathDuringRun = "";
		await expect(
			withWorktree(
				repoDir,
				"eng2-task",
				async (wt) => {
					pathDuringRun = wt;
					expect(existsSync(wt)).toBe(true); // isolated worktree present during spawn
					throw new Error("simulated worker crash");
				},
				gitRunner,
			),
		).rejects.toThrow("simulated worker crash");

		// ENG-2 guarantee: cleanup happens even when the spawned work fails.
		expect(existsSync(pathDuringRun)).toBe(false);
	});
});

describe("ADR-010 ENG-3: merge serialization + conflict-is-not-success — see engine-merge-wire.test.ts for the full withMergeLock proof", () => {
	it("ENG-3 label present: completeTask never marks a merge conflict as done (cross-reference)", async () => {
		// Full behavioral proof lives in engine-merge-wire.test.ts (withMergeLock
		// serialization under concurrent completeTask calls). This is the explicit
		// ENG-3 label anchor so grepping "ENG-3" finds this file too.
		const { completeTask } = await import("../engine/complete.ts");
		const task = { id: "ENG3-1", title: "t", status: "Basic: Ready" } as unknown as Task;
		let updated: Task | undefined;
		const store = {
			getTask: async () => task,
			updateTask: async (t: Task) => {
				updated = t;
			},
		};

		await completeTask("ENG3-1", { success: true }, store, {
			merge: async () => ({ conflict: true }),
		});

		expect(updated?.phase).toBe("needs-human"); // conflict → needs-human, never done
	});
});

describe("ADR-010 ENG-4: event consumption idempotency — re-processing the same dispatch signal must not duplicate side effects", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("adr010-eng4");
		core = new Core(projectRoot);
		await initializeTestProject(core, "adr010-eng4-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("does not re-dispatch a task already carrying the dispatch cap marker across a simulated restart (adapted from engine-supervisor.test.ts:57)", async () => {
		const { task } = await core.createTaskFromInput({ title: "Ready task", status: "To Do" }, false);
		await core.updateTask({ ...task, pipeline_id: "execution", phase: "ready" } as Task, false);

		const firstSpawns: string[] = [];
		await supervisorTick(core, projectRoot, async (taskId) => {
			firstSpawns.push(taskId);
		});
		expect(firstSpawns).toEqual([task.id]);

		// Simulate a supervisor restart: a fresh tick against the same on-disk
		// state (task is still "ready" — the agent hasn't completed it yet).
		// ENG-4 requires this second tick to be a no-op: the dispatch cap marker
		// persisted by the first tick must prevent the side effect (spawn) from
		// firing again.
		const secondSpawns: string[] = [];
		const secondDispatched = await supervisorTick(core, projectRoot, async (taskId) => {
			secondSpawns.push(taskId);
		});

		expect(secondDispatched).toEqual([]);
		expect(secondSpawns).toEqual([]);
	});
});

describe("ADR-010 ENG-5: parent reconciliation gate — never re-fires once the epic is terminal", () => {
	let projectRoot: string;
	let core: Core;

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("adr010-eng5");
		core = new Core(projectRoot);
		await initializeTestProject(core, "adr010-eng5-test");
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("ENG-5: a done epic is never re-advanced by advanceAwaitingChildrenToEvaluating", async () => {
		const { task: epicTask } = await core.createTaskFromInput({ title: "Epic", status: "To Do" }, false);
		const epic = { ...epicTask, role: "compound" as const, pipeline_id: "execution", phase: "done" as const };
		await core.updateTask(epic, false);

		const { task: childTask } = await core.createTaskFromInput({ title: "Child", status: "To Do" }, false);
		await core.updateTask({ ...childTask, pipeline_id: "execution", phase: "done", parent_id: epic.id }, false);

		// Parent already terminal (done) — the reconciliation gate must be a no-op:
		// ENG-5 requires the gate to only fire while the parent sits in the
		// non-terminal "awaiting-children" phase, never after it has settled.
		const advanced = await advanceAwaitingChildrenToEvaluating(core);
		expect(advanced).not.toContain(epic.id);

		const reloaded = await core.getTask(epic.id);
		expect(reloaded?.phase).toBe("done");
	});
});
