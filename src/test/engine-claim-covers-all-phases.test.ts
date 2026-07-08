/**
 * BACK-686.1 Phase B (AC#4) — claim coverage extends to every machine-actor
 * phase across ALL_PIPELINES, including `execution/adjudicating` (today's gap:
 * no exec-lock/claim protects it at all). For every such phase, acquiring a
 * claim succeeds once and a concurrent second acquire for the same task is
 * rejected.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireClaim, type ClaimRecord } from "../engine/claim.ts";
import { machineActorPhases } from "../engine/skill-registry.ts";

function makeRecord(taskId: string, entryPhase: string): ClaimRecord {
	return {
		taskId,
		worktree: `/tmp/wt/${taskId}`,
		branch: `task/${taskId}`,
		entryPhase,
		leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		puller: "monitor-seat-1",
	};
}

describe("claim coverage across all machine-actor phases (BACK-686.1 A2 AC#4)", () => {
	let backlogDir: string;

	beforeEach(() => {
		backlogDir = mkdtempSync(join(tmpdir(), "back-686-1-claim-phases-"));
	});

	afterEach(() => {
		rmSync(backlogDir, { recursive: true, force: true });
	});

	const phases = machineActorPhases();

	it("machineActorPhases includes execution/adjudicating (today's actual gap)", () => {
		expect(phases).toContain("execution/adjudicating");
	});

	for (const phase of phases) {
		it(`claim acquire/mutex works for phase "${phase}"`, async () => {
			const taskId = `BACK-phase-${phase.replace(/\//g, "-")}`;
			const record = makeRecord(taskId, phase);

			await acquireClaim(backlogDir, record);
			await expect(acquireClaim(backlogDir, makeRecord(taskId, phase))).rejects.toThrow();
		});
	}
});
