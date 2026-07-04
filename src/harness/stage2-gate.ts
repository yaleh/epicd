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
 * recordStage2Gate(result, appendLine) appends one structured JSON line to a log.
 *
 * The gate is parameterized to support:
 *   - toy fixtures in self-proof tests (Phase B anti-stub validation)
 *   - real MVD manifest via CLI `engine stage2-gate --rebuilt <path>` (Phase C)
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

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

export interface Stage2GateRecord {
	gate_type: "stage2";
	timestamp: string;
	passed: boolean;
	reason?: Stage2Reason;
	failures?: string;
	rebuiltRepoPath: string;
}

/**
 * Record a Stage 2 gate result as a single structured JSON line.
 * appendLine is injectable for testing (avoids real file I/O in unit tests).
 */
export function recordStage2Gate(
	result: Stage2Result,
	rebuiltRepoPath: string,
	appendLine: (line: string) => void,
	now = new Date().toISOString(),
): void {
	const record: Stage2GateRecord = {
		gate_type: "stage2",
		timestamp: now,
		passed: result.passed,
		...(result.reason !== undefined ? { reason: result.reason } : {}),
		...(result.failures !== undefined ? { failures: result.failures } : {}),
		rebuiltRepoPath,
	};
	appendLine(JSON.stringify(record));
}
