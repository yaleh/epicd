/**
 * BACK-686.1 Phase C (AC#5) — staleness reaper: inject a claim whose lease has
 * already expired for a task sitting at some machine-actor phase, run the
 * reaper, and confirm the claim disappears while `task.phase` is left
 * untouched — a crashed agent's task frees back into "queued" automatically,
 * with no phase mutation (ties AC#5 to AC#6: claim never duplicates phase).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { acquireClaim, type ClaimRecord, listActiveClaims, readClaim, reapStaleClaims } from "../engine/claim.ts";
import type { WorktreeOps } from "../engine/driver.ts";
import { runEngine } from "../engine/run.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject } from "./test-utils.ts";

function makeRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
	return {
		taskId: "BACK-777",
		worktree: "/tmp/wt/BACK-777",
		branch: "task/BACK-777",
		entryPhase: "authoring/refining",
		leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		puller: "monitor-seat-1",
		...overrides,
	};
}

describe("reapStaleClaims (BACK-686.1 A2 AC#5)", () => {
	let backlogDir: string;

	beforeEach(() => {
		backlogDir = mkdtempSync(join(tmpdir(), "back-686-1-reaper-"));
	});

	afterEach(() => {
		rmSync(backlogDir, { recursive: true, force: true });
	});

	it("removes a claim whose lease has already expired", async () => {
		const staleRecord = makeRecord({ leaseExpiresAt: new Date(Date.now() - 60_000).toISOString() });
		await acquireClaim(backlogDir, staleRecord);

		expect(readClaim(backlogDir, staleRecord.taskId)).not.toBeNull();

		const reaped = reapStaleClaims(backlogDir);

		expect(reaped).toContain(staleRecord.taskId);
		expect(readClaim(backlogDir, staleRecord.taskId)).toBeNull();
	});

	it("leaves a claim whose lease has not expired untouched", async () => {
		const freshRecord = makeRecord({ taskId: "BACK-778", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
		await acquireClaim(backlogDir, freshRecord);

		const reaped = reapStaleClaims(backlogDir);

		expect(reaped).not.toContain(freshRecord.taskId);
		expect(readClaim(backlogDir, freshRecord.taskId)).not.toBeNull();
	});

	it("never touches task.phase — the reaper only manages the claim record, not the task", async () => {
		// The claim module has no reference to a TaskStore/Task at all — reapStaleClaims's
		// signature only takes (backlogDir, now), so it is structurally incapable of
		// mutating task.phase (AC#6: phase stays the sole progress truth).
		const staleRecord = makeRecord({ leaseExpiresAt: new Date(Date.now() - 60_000).toISOString() });
		await acquireClaim(backlogDir, staleRecord);

		reapStaleClaims(backlogDir);

		expect(listActiveClaims(backlogDir)).toHaveLength(0);
	});

	it("reaps multiple stale claims across different tasks in one pass, leaving fresh ones alone", async () => {
		const stale1 = makeRecord({ taskId: "BACK-901", leaseExpiresAt: new Date(Date.now() - 5_000).toISOString() });
		const stale2 = makeRecord({ taskId: "BACK-902", leaseExpiresAt: new Date(Date.now() - 5_000).toISOString() });
		const fresh = makeRecord({ taskId: "BACK-903", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
		await acquireClaim(backlogDir, stale1);
		await acquireClaim(backlogDir, stale2);
		await acquireClaim(backlogDir, fresh);

		const reaped = reapStaleClaims(backlogDir);

		expect(reaped.sort()).toEqual(["BACK-901", "BACK-902"]);
		expect(readClaim(backlogDir, "BACK-903")).not.toBeNull();
	});
});

describe("reapStaleClaims wired into runEngine's tick loop (BACK-686.1 A2 AC#5)", () => {
	let projectRoot: string;
	let core: Core;
	const stubWorktree: WorktreeOps = {
		spawn: async () => ({ success: true }),
		merge: async () => {},
	};

	beforeEach(async () => {
		projectRoot = createUniqueTestDir("engine-run-reaper");
		core = new Core(projectRoot);
		await initializeTestProject(core, "engine-run-reaper-test");
	});

	afterEach(async () => {
		await rmSync(projectRoot, { recursive: true, force: true });
	});

	it("a stale claim injected before runEngine starts is gone after the run, with no task.phase mutation", async () => {
		const backlogDir = core.filesystem.backlogDir;
		const { task } = await core.createTaskFromInput({ title: "Reaper wiring task", status: "To Do" }, false);
		const withPipeline: Task = { ...task, pipeline_id: "execution", phase: "done" };
		await core.updateTask(withPipeline, false);

		const staleRecord: ClaimRecord = {
			taskId: task.id,
			worktree: "/tmp/wt/stale-wiring",
			branch: `task/${task.id}`,
			entryPhase: "authoring/backlog",
			leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
			puller: "crashed-agent",
		};
		await acquireClaim(backlogDir, staleRecord);

		await runEngine(core, stubWorktree);

		expect(readClaim(backlogDir, task.id)).toBeNull();
		const reread = await core.getTask(task.id);
		expect(reread?.phase).toBe("done");
	});
});
