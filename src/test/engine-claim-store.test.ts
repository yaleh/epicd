/**
 * BACK-686.1 Phase B (AC#3/#4/#6) — the single engine-native claim module.
 *
 * A `ClaimRecord` is claim METADATA only (worktree/branch/entryPhase/lease/
 * puller) — it never carries a `phase` copy (AC#6: phase stays the sole
 * progress truth). `acquireClaim` is a mutex: a second acquire for the same
 * task id while the first is held fails.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireClaim, type ClaimRecord, readClaim, releaseClaim } from "../engine/claim.ts";

function makeRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
	return {
		taskId: "BACK-999",
		worktree: "/tmp/wt/BACK-999",
		branch: "task/BACK-999",
		entryPhase: "authoring/backlog",
		leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		puller: "monitor-seat-1",
		...overrides,
	};
}

describe("engine claim store (BACK-686.1 A2)", () => {
	let backlogDir: string;

	beforeEach(() => {
		backlogDir = mkdtempSync(join(tmpdir(), "back-686-1-claim-"));
	});

	afterEach(() => {
		rmSync(backlogDir, { recursive: true, force: true });
	});

	it("acquireClaim then readClaim roundtrips the claim metadata", async () => {
		const record = makeRecord();
		await acquireClaim(backlogDir, record);

		const read = readClaim(backlogDir, record.taskId);
		expect(read).not.toBeNull();
		expect(read?.taskId).toBe(record.taskId);
		expect(read?.worktree).toBe(record.worktree);
		expect(read?.branch).toBe(record.branch);
		expect(read?.entryPhase).toBe(record.entryPhase);
		expect(read?.leaseExpiresAt).toBe(record.leaseExpiresAt);
		expect(read?.puller).toBe(record.puller);
	});

	it("a ClaimRecord never contains a phase field (AC#6 — phase stays the sole progress truth)", async () => {
		const record = makeRecord();
		await acquireClaim(backlogDir, record);
		const read = readClaim(backlogDir, record.taskId) as unknown as Record<string, unknown>;
		expect(read).not.toBeNull();
		expect("phase" in read).toBe(false);
	});

	it("readClaim returns null when no claim exists", () => {
		expect(readClaim(backlogDir, "BACK-nonexistent")).toBeNull();
	});

	it("a second acquireClaim for the same task id while the first is held rejects (mutex)", async () => {
		const record = makeRecord();
		await acquireClaim(backlogDir, record);
		await expect(acquireClaim(backlogDir, makeRecord())).rejects.toThrow();
	});

	it("releaseClaim removes the claim so a subsequent acquireClaim succeeds", async () => {
		const record = makeRecord();
		await acquireClaim(backlogDir, record);
		releaseClaim(backlogDir, record.taskId);

		expect(readClaim(backlogDir, record.taskId)).toBeNull();
		await expect(acquireClaim(backlogDir, record)).resolves.toBeUndefined();
	});
});
