/**
 * Stage 2 gate runner.
 *
 * Stage 2 (§15.1): "MVD rebuilds MVD" — a rebuilt driver must pass the same
 * engine test suite AND be able to drive a tracer WorkItem to fixpoint using
 * the rebuilt code. "Suite-green" alone degenerates to Stage 1 (architect C).
 *
 * runStage2Fixpoint(opts) implements both halves of the criterion:
 *   1. All sourceFiles exist and are non-empty in rebuiltRepoPath  → else "missing-source"
 *   2. bun test <testFiles>  (cwd = rebuiltRepoPath, isolated)     → else "suite-failed"
 *   3. bun test <tracerEntry> (cwd = rebuiltRepoPath, isolated)    → else "drive-failed"
 *   4. All pass                                                     → { passed: true }
 *
 * recordStage2Gate(result, rebuiltRepoPath, path, ids) appends one GateEvent
 * (BACK-602/632's `src/core/gate-event-store.ts`) to the shared gate-event
 * log — gate="stage2", verdict=passed?"pass":"fail",
 * payload={reason,failures,rebuiltRepoPath}, actor="machine".
 *
 * The gate is parameterized to support:
 *   - toy fixtures in self-proof tests (Phase B anti-stub validation)
 *   - real MVD manifest via CLI `engine stage2-gate --rebuilt <path>` (Phase C)
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { appendGateEvent, type GateEventStoreFs, realGateEventStoreFs } from "../core/gate-event-store.ts";

export type Stage2Reason = "missing-source" | "suite-failed" | "drive-failed";

export interface Stage2Result {
	passed: boolean;
	reason?: Stage2Reason;
	/** Trimmed stderr/stdout excerpt from the failing subprocess, if available. */
	failures?: string;
}

export interface Stage2GateOptions {
	/** Absolute path to the root of the rebuilt repo tree. */
	rebuiltRepoPath: string;
	/** Source file paths relative to rebuiltRepoPath that must exist and be non-empty. */
	sourceFiles: string[];
	/** Test file paths relative to rebuiltRepoPath to run as "the same suite". */
	testFiles: string[];
	/**
	 * A single test entry (relative to rebuiltRepoPath) that exercises the rebuilt
	 * driver driving a tracer WorkItem to fixpoint — the "self-application" criterion.
	 */
	tracerEntry: string;
}

/**
 * Run the Stage 2 gate against a rebuilt repo tree.
 * Isolated: child bun processes use cwd=rebuiltRepoPath so they never
 * pick up the parent repo's bunfig.toml or test suite.
 */
export async function runStage2Fixpoint(opts: Stage2GateOptions): Promise<Stage2Result> {
	const { rebuiltRepoPath, sourceFiles, testFiles, tracerEntry } = opts;

	// 1. Check all source files exist and are non-empty
	for (const rel of sourceFiles) {
		const abs = join(rebuiltRepoPath, rel);
		if (!existsSync(abs)) {
			return { passed: false, reason: "missing-source", failures: `missing: ${rel}` };
		}
		const stat = statSync(abs);
		if (stat.size === 0) {
			return { passed: false, reason: "missing-source", failures: `empty: ${rel}` };
		}
	}

	// 2. Run the test suite (cwd = rebuiltRepoPath, isolated from parent bunfig/suite)
	const suiteProc = Bun.spawnSync(["bun", "test", ...testFiles], {
		cwd: rebuiltRepoPath,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			// Prevent Bun from walking up to parent bunfig.toml
			BUNFIG_PATH: join(rebuiltRepoPath, "bunfig.toml"),
		},
	});
	if (suiteProc.exitCode !== 0) {
		const excerpt = [suiteProc.stdout?.toString(), suiteProc.stderr?.toString()]
			.filter(Boolean)
			.join("\n")
			.slice(0, 1000);
		return { passed: false, reason: "suite-failed", failures: excerpt };
	}

	// 3. Run tracer-drive test (self-application: rebuilt driver drives tracer in rebuilt tree)
	const driveProc = Bun.spawnSync(["bun", "test", tracerEntry], {
		cwd: rebuiltRepoPath,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			BUNFIG_PATH: join(rebuiltRepoPath, "bunfig.toml"),
		},
	});
	if (driveProc.exitCode !== 0) {
		const excerpt = [driveProc.stdout?.toString(), driveProc.stderr?.toString()]
			.filter(Boolean)
			.join("\n")
			.slice(0, 1000);
		return { passed: false, reason: "drive-failed", failures: excerpt };
	}

	return { passed: true };
}

/** Identifying info for a recorded Stage 2 GateEvent (see GateEvent in gate-event-store.ts). */
export interface Stage2GateIds {
	id: string;
	itemId: string;
	pipelineId: string;
}

/**
 * Record a Stage 2 gate result as a GateEvent, appended to the log at `path`
 * via `appendGateEvent` (src/core/gate-event-store.ts). `fs` is injectable
 * for testing (avoids real file I/O in unit tests).
 */
export function recordStage2Gate(
	result: Stage2Result,
	rebuiltRepoPath: string,
	path: string,
	ids: Stage2GateIds,
	fs: GateEventStoreFs = realGateEventStoreFs,
	now = new Date().toISOString(),
): void {
	appendGateEvent(
		path,
		{
			id: ids.id,
			item_id: ids.itemId,
			pipeline_id: ids.pipelineId,
			gate: "stage2",
			actor: "machine",
			verdict: result.passed ? "pass" : "fail",
			timestamp: now,
			payload: {
				...(result.reason !== undefined ? { reason: result.reason } : {}),
				...(result.failures !== undefined ? { failures: result.failures } : {}),
				rebuiltRepoPath,
			},
		},
		fs,
	);
}
