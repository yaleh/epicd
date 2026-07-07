/**
 * BACK-682 schema #1/#2/#3/#5 — the retreat edge, gap-fingerprint dedup guard,
 * three-way retreat contract validation, and risk-scaled audit depth. All of
 * this is written ONLY from `execution/adjudicating` (the single phase
 * allowed to author a retreat edge — AC#1) and always targets exactly one
 * step back: the task's own `entry_phase` (never a cross-level jump).
 *
 * Naming-collision note (see the task's Implementation Plan): this file's
 * concerns are entirely separate from `src/engine/adjudicate.ts`'s `adjudicate()`
 * (ENG-8 mechanical DoD verdict) — that function's signature/behavior is
 * unchanged (AC#12). The independent judgmental audit that produces the
 * `AdjudicationVerdict` consumed here lives in the `adjudicate` skill
 * (Phase B), not in `adjudicate.ts`.
 */

import { createHash } from "node:crypto";
import { extractIntegrationAcceptanceCommands } from "../harness/evaluator.ts";
import type { RetreatContract, RetreatEntry, Task } from "../types/index.ts";

/** The only phase allowed to write a retreat edge. */
export const ADJUDICATING_PHASE_KEY = "execution/adjudicating";

/** Composite `pipeline_id/phase` key for a task, the same shape as `ADJUDICATING_PHASE_KEY`. */
function phaseKey(task: Task): string {
	return `${task.pipeline_id ?? ""}/${task.phase ?? ""}`;
}

/**
 * Guards the "one step, never cross-level" retreat rule (schema #1):
 *  - only callable when `task` is currently AT `execution/adjudicating`;
 *  - `toPhase` must equal `task.entry_phase` exactly (the phase this task
 *    entered its current pipeline from) — retreating anywhere else would be
 *    a cross-level jump and is rejected.
 */
export function assertSingleStepRetreat(task: Task, toPhase: string): void {
	if (phaseKey(task) !== ADJUDICATING_PHASE_KEY) {
		throw new Error(
			`assertSingleStepRetreat: only callable from "${ADJUDICATING_PHASE_KEY}", task ${task.id} is at "${phaseKey(task)}"`,
		);
	}
	if (!task.entry_phase) {
		throw new Error(`assertSingleStepRetreat: task ${task.id} has no entry_phase recorded — cannot retreat`);
	}
	if (toPhase !== task.entry_phase) {
		throw new Error(
			`assertSingleStepRetreat: retreat target "${toPhase}" must equal task.entry_phase "${task.entry_phase}" (one step, no cross-level retreat)`,
		);
	}
}

/**
 * The gap fingerprint (schema #2): a short, stable dedup key over
 * (classification, normalizedFailingCheck). Used to detect a gap resurfacing
 * a second time, which forces `needs-human` instead of a second retreat.
 */
export function gapFingerprint(
	classification: "spec" | "decomposition" | "goal",
	normalizedFailingCheck: string,
): string {
	const normalized = normalizedFailingCheck.trim().replace(/\s+/g, " ");
	return createHash("sha256").update(`${classification}|${normalized}`).digest("hex").slice(0, 16);
}

/** True when `fingerprint` already appears in `task.gap_history` (second-occurrence dedup guard). */
export function isDuplicateGap(task: Task, fingerprint: string): boolean {
	return (task.gap_history ?? []).includes(fingerprint);
}

/**
 * Validates the three-way retreat contract (schema #3): every `wrong` entry
 * MUST name the obsolete implementation block it retires. `keep`/`missing`
 * carry no such requirement.
 */
export function validateRetreatContract(contract: RetreatContract): void {
	for (const w of contract.wrong) {
		const block = w.obsoleteBlock;
		if (!block || !block.file || !block.lines || !block.reason) {
			throw new Error(
				`validateRetreatContract: "wrong" entry for AC "${w.ac}" is missing an explicit obsoleteBlock (file/lines/reason)`,
			);
		}
	}
}

/**
 * Records one retreat edge on `task` — validates the single-step guard, the
 * gap-fingerprint dedup guard, and the three-way contract, then appends to
 * both append-only logs and moves phase back to `entry_phase`. Never mutates
 * or truncates prior `retreat_log`/`gap_history` entries.
 *
 * Throws (caller must route to needs-human instead) when:
 *  - called from anywhere other than `execution/adjudicating`;
 *  - `entry.toPhase` isn't exactly `task.entry_phase`;
 *  - `entry.gapFingerprint` already appears in `task.gap_history` (duplicate gap);
 *  - `entry.contract` fails validation (a `wrong` entry with no obsoleteBlock).
 */
export function recordRetreat(task: Task, entry: RetreatEntry): Task {
	if (entry.from !== ADJUDICATING_PHASE_KEY) {
		throw new Error(`recordRetreat: RetreatEntry.from must be "${ADJUDICATING_PHASE_KEY}", got "${entry.from}"`);
	}
	assertSingleStepRetreat(task, entry.toPhase);
	if (isDuplicateGap(task, entry.gapFingerprint)) {
		throw new Error(
			`recordRetreat: gap fingerprint "${entry.gapFingerprint}" already retreated once for task ${task.id} — route to needs-human instead of retreating again`,
		);
	}
	validateRetreatContract(entry.contract);

	return {
		...task,
		phase: entry.toPhase,
		retreat_log: [...(task.retreat_log ?? []), entry],
		gap_history: [...(task.gap_history ?? []), entry.gapFingerprint],
	};
}

/**
 * Risk-scaled audit depth (schema #5), reusing fixpoint-convergence's
 * `RiskGated` judgment: `"full"` iff the task declares its own
 * `## Integration Acceptance` section, OR the diff touches `src/engine/**`/
 * `src/security/**`, OR the task's labels include `area:engine`/`area:security`.
 * Otherwise `"light"` — a mechanical leaf only needs DoD-green + AC-checkbox
 * confirmation, not a full independent diff read.
 */
export function auditDepthFor(task: Task, changedPaths: string[]): "light" | "full" {
	const hasIntegrationAcceptance = extractIntegrationAcceptanceCommands(task.description ?? "").length > 0;
	const touchesRiskyPath = changedPaths.some((p) => p.startsWith("src/engine/") || p.startsWith("src/security/"));
	const hasRiskyLabel = (task.labels ?? []).some((l) => l === "area:engine" || l === "area:security");
	return hasIntegrationAcceptance || touchesRiskyPath || hasRiskyLabel ? "full" : "light";
}
