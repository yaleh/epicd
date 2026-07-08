/**
 * BACK-686.2 Phase C (AC#7) — fresh-context assertion: the session/puller
 * identity that adjudicating's full-path dispatch spawns must be distinct from
 * the `implementing` puller identity recorded on the task's claim.
 *
 * Consumes child A's (BACK-686.1) real `src/engine/claim.ts` module —
 * `acquireClaim`/`readClaim` against a real (temp-dir) backlogDir.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isFreshAdjudicatingContext } from "../engine/adjudicate-gate.ts";
import { acquireClaim, type ClaimRecord } from "../engine/claim.ts";

function makeRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
	return {
		taskId: "BACK-999",
		worktree: "/tmp/wt/BACK-999",
		branch: "task/BACK-999",
		entryPhase: "execution/implementing",
		leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		puller: "agent-session-A",
		...overrides,
	};
}

describe("isFreshAdjudicatingContext — dispatch identity != implementing puller identity (AC#7)", () => {
	let backlogDir: string;

	beforeEach(() => {
		backlogDir = mkdtempSync(join(tmpdir(), "back-686-2-fresh-context-"));
	});

	afterEach(() => {
		rmSync(backlogDir, { recursive: true, force: true });
	});

	it("is NOT fresh when the dispatch identity equals the recorded implementing puller", async () => {
		await acquireClaim(backlogDir, makeRecord());
		expect(isFreshAdjudicatingContext(backlogDir, "BACK-999", "agent-session-A")).toBe(false);
	});

	it("IS fresh when the dispatch identity differs from the recorded implementing puller", async () => {
		await acquireClaim(backlogDir, makeRecord());
		expect(isFreshAdjudicatingContext(backlogDir, "BACK-999", "agent-session-B")).toBe(true);
	});

	it("treats an unclaimed task as fresh (nothing to compare against)", () => {
		expect(isFreshAdjudicatingContext(backlogDir, "BACK-000-unclaimed", "any-session")).toBe(true);
	});
});
