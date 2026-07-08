/**
 * BACK-686.2 Phase C/D — `execution/adjudicating` gate-script.
 *
 * `src/engine/adjudicate.ts`'s existing `adjudicate()` (ENG-8 mechanical DoD
 * verdict) and `src/engine/complete.ts`'s `completeTask`/`completeAdjudication`
 * are unchanged (AC#9) — this module sits strictly AFTER DoD verdict resolution:
 * a primitive only reaches `adjudicating` once its DoD has already gone green
 * (`completeTask` routes a "done" ENG-8 verdict to "adjudicating", never
 * "needs-human" — see `complete.ts`). `gateAdjudicating` adds one more mechanical
 * decision layer before deciding whether a session needs to be spawned at all:
 *
 *  - Primitive path (AC#4): risk-scaled `auditDepthFor` (`src/engine/retreat.ts`)
 *    decides light vs full. "light" AND all Acceptance-Criteria checkboxes
 *    checked AND all Definition-of-Done checkboxes checked -> resolves straight
 *    to `done`, no session spawn. Anything else (full audit depth, or an
 *    unchecked AC/DoD box even at light depth) -> `dispatch-skill`: the
 *    existing `adjudicate` skill's fresh-context independent audit is spawned
 *    (`Driver.tick`'s adjudicating branch, `driver.ts`).
 *  - Epic path (AC#5): folds `evaluateEpic`'s IA+child-aggregation logic
 *    (`computeEpicVerdict`, `src/harness/evaluator.ts`) in as the epic's own
 *    mechanical check — an epic's gate is ALWAYS mechanical (`done` or
 *    `needs-human`), never escalating to a skill dispatch; there is no
 *    independent judgmental audit for epic aggregation, same as before this
 *    folding (`evaluateEpic`/`advanceAwaitingChildrenToAdjudicating` never spawned
 *    a session either).
 */
import { computeEpicVerdict } from "../harness/evaluator.js";
import type { Task } from "../types/index.js";
import { isCompound } from "./adjudicate.js";
import { readClaim } from "./claim.js";
import { auditDepthFor } from "./retreat.js";

export type GateVerdict = { verdict: "done" } | { verdict: "needs-human" } | { verdict: "dispatch-skill" };

/**
 * Runs the mechanical adjudicating gate for `task`.
 *
 * `children` — the task's direct children (only meaningful when `isCompound(task)`;
 * ignored for primitives).
 * `changedPaths` — the diff's touched paths (primitives only; used by `auditDepthFor`).
 * `repoRoot` — passed through to `computeEpicVerdict`'s Integration Acceptance
 * shell-command runner (epics only).
 */
export async function gateAdjudicating(
	task: Task,
	children: Task[],
	changedPaths: string[],
	repoRoot: string,
): Promise<GateVerdict> {
	if (isCompound(task)) {
		// AC#5: the epic path is always mechanical — IA + child aggregation,
		// never escalates to a skill dispatch (no independent judgmental audit
		// for epic aggregation existed before this folding either).
		const verdict = await computeEpicVerdict(task, children, repoRoot);
		return { verdict };
	}

	const depth = auditDepthFor(task, changedPaths);
	const acItems = task.acceptanceCriteriaItems ?? [];
	const acAllChecked = acItems.every((item) => item.checked);
	const dodItems = task.definitionOfDoneItems ?? [];
	const dodAllChecked = dodItems.every((item) => item.checked);

	if (depth === "light" && acAllChecked && dodAllChecked) {
		return { verdict: "done" };
	}
	return { verdict: "dispatch-skill" };
}

/**
 * BACK-686.2 AC#7 (fresh-context): true when `dispatchIdentity` (the session/puller
 * identity the adjudicating full-path dispatch spawns) is distinct from the
 * `implementing` puller identity recorded on `taskId`'s claim — i.e. adjudication
 * never runs in the same context that produced the diff it is auditing.
 *
 * STUB DEPENDENCY (see `src/engine/claim.ts`'s file header): this consumes child
 * A's (BACK-686.1) expected `readClaim`/`puller` interface, currently backed by a
 * stub in this worktree. An unclaimed task (no recorded puller) has nothing to
 * compare against and is treated as fresh.
 */
export function isFreshAdjudicatingContext(taskId: string, dispatchIdentity: string): boolean {
	const claim = readClaim(taskId);
	if (!claim) return true;
	return claim.puller !== dispatchIdentity;
}
