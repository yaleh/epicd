/**
 * BACK-601.5: in-place, idempotent backfill of engine structural fields
 * (pipeline_id/phase/parent_id) on existing task files.
 *
 * Only structural defaults are derived here (registry defaults + tree
 * position); `role` is 100% derived via `roleOf()` (BACK-664.2) and never
 * persisted; `dod`/`cap` are declarative content and are never populated by
 * this routine.
 */

import { isLegalPhase, pipelineById } from "../engine/pipeline.ts";
import type { Task } from "../types/index.ts";
import type { Core } from "./backlog.ts";

/**
 * Strip a leading `"<Word>: "` role-prefix (case-insensitive) from a status
 * string and kebab-case the remainder into a bare phase name. Pure inverse of
 * `titleCasePhase()` in `field-registry.ts` — there is exactly one
 * status↔phase mapping convention, not a second phase-name table.
 */
export function deriveBarePhase(status: string): string | undefined {
	const trimmed = status?.trim();
	if (!trimmed) return undefined;
	const withoutPrefix = trimmed.replace(/^[A-Za-z]+:\s*/, "");
	if (!withoutPrefix) return undefined;
	return withoutPrefix.trim().toLowerCase().split(/\s+/).join("-");
}

/**
 * The legacy-vocab table from `docs/task-lifecycle-model.md` §4.1: maps a bare
 * (role-prefix-stripped) status phase name to the `(pipeline_id, phase)` it
 * belongs to under the canonical three-pipeline model. `Proposal→draft` and
 * `Plan→refining` are the documented working assumptions; everything else is
 * a direct correspondence. `In Progress` is deliberately mapped to
 * `execution/ready` — it is a claim/runtime concept, never a persisted phase.
 */
const LEGACY_PHASE_TABLE: Record<string, { pipeline_id: string; phase: string }> = {
	proposal: { pipeline_id: "authoring", phase: "draft" },
	plan: { pipeline_id: "authoring", phase: "refining" },
	"to-do": { pipeline_id: "authoring", phase: "draft" },
	backlog: { pipeline_id: "authoring", phase: "backlog" },
	draft: { pipeline_id: "authoring", phase: "draft" },
	refining: { pipeline_id: "authoring", phase: "refining" },
	"in-progress": { pipeline_id: "execution", phase: "ready" },
	ready: { pipeline_id: "execution", phase: "ready" },
	decomposing: { pipeline_id: "execution", phase: "decomposing" },
	"awaiting-children": { pipeline_id: "execution", phase: "awaiting-children" },
	evaluating: { pipeline_id: "execution", phase: "evaluating" },
	"needs-human": { pipeline_id: "execution", phase: "needs-human" },
	done: { pipeline_id: "execution", phase: "done" },
	spike: { pipeline_id: "exploration", phase: "spike" },
};

/**
 * Resolves a task's `status` string to the `(pipeline_id, phase)` it belongs
 * to under the canonical model, per the legacy-vocab table above. Returns
 * `undefined` for a blank or unmapped status.
 */
export function resolvePipelinePhase(status: string): { pipeline_id: string; phase: string } | undefined {
	const bare = deriveBarePhase(status);
	if (!bare) return undefined;
	return LEGACY_PHASE_TABLE[bare];
}

/** actor of `(pipelineId, phase)`, or `undefined` when either is unknown. */
function phaseActor(pipelineId: string | undefined, phase: string | undefined) {
	return pipelineById(pipelineId)?.states.find((s) => s.name === phase)?.actor;
}

/** True when `status` resolves (per the legacy-vocab table) to an actor:"none" phase. */
function isStatusTerminal(status: string): boolean {
	const resolved = resolvePipelinePhase(status);
	return Boolean(resolved && phaseActor(resolved.pipeline_id, resolved.phase) === "none");
}

/**
 * Compute the structural fields a task should be backfilled with. Returns
 * only the keys that need to change — never touches `dod`/`cap`.
 *
 * `pipeline_id`/`phase` are repositioned (not just filled) when the current
 * combo is illegal or incomplete: resolved from `status` semantics via
 * `resolvePipelinePhase`, not unconditionally defaulted to the execution
 * pipeline. A combo that is already legal is left untouched, unless `status`
 * is terminal (actor:"none") while the current `phase` is not — that
 * terminal/phase divergence (BACK-655 Phase E, BACK-654 class) is also
 * repositioned to the status-implied terminal phase. Either way, once
 * `phase` agrees with `status`, the patch is empty — keeping a second run
 * byte-for-byte idempotent.
 */
export function computeBackfillFields(task: Task): Partial<Pick<Task, "pipeline_id" | "phase" | "parent_id">> {
	const patch: Partial<Pick<Task, "pipeline_id" | "phase" | "parent_id">> = {};

	const legal = Boolean(task.pipeline_id && task.phase && isLegalPhase(task.pipeline_id, task.phase));
	const resolved = resolvePipelinePhase(task.status);
	const terminalDivergence =
		legal &&
		resolved &&
		phaseActor(resolved.pipeline_id, resolved.phase) === "none" &&
		phaseActor(task.pipeline_id, task.phase) !== "none";
	if ((!legal || terminalDivergence) && resolved) {
		patch.pipeline_id = resolved.pipeline_id;
		patch.phase = resolved.phase;
	}
	if (!task.parent_id && task.parentTaskId) {
		patch.parent_id = task.parentTaskId;
	}

	return patch;
}

/**
 * Backfill every task file's structural fields in place. Skips writing a
 * task entirely when its computed patch is empty — the mechanism that makes
 * a second run byte-for-byte idempotent (avoids `Core.updateTask`'s
 * automatic `updatedDate` bump on a no-op).
 */
export async function runBackfill(core: Core): Promise<{ updated: string[] }> {
	const tasks = await core.queryTasks({});

	const changed: Task[] = [];
	const updated: string[] = [];
	for (const task of tasks) {
		const patch = computeBackfillFields(task);
		if (Object.keys(patch).length === 0) continue;
		changed.push({ ...task, ...patch });
		updated.push(task.id);
	}

	if (changed.length > 0) {
		await core.updateTasksBulk(changed, "BACK-612 backfill: engine structural fields", false);
	}

	return { updated };
}

/**
 * Detects tasks whose `status` is set but `pipeline_id`/`phase` is empty, or
 * whose `phase` is not a legal state of its `pipeline_id`. Used by `engine
 * drift-lint` (CI-usable) and mirrors the legality check `computeBackfillFields`
 * repositions against — a clean board never appears here.
 */
export function computeDrift(tasks: Task[]): { id: string; reason: string }[] {
	const drift: { id: string; reason: string }[] = [];
	for (const task of tasks) {
		if (!task.status?.trim()) continue;
		if (!task.pipeline_id || !task.phase) {
			drift.push({ id: task.id, reason: `status "${task.status}" set but pipeline_id/phase missing` });
			continue;
		}
		if (!isLegalPhase(task.pipeline_id, task.phase)) {
			drift.push({
				id: task.id,
				reason: `phase "${task.phase}" is not a legal state of pipeline "${task.pipeline_id}"`,
			});
			continue;
		}
		// Terminal/phase divergence (BACK-655 Phase E): the combo is individually
		// legal, but `status` resolves to a terminal (actor:"none") phase while the
		// persisted `phase` is not — e.g. execution/needs-human + status Done.
		if (isStatusTerminal(task.status) && phaseActor(task.pipeline_id, task.phase) !== "none") {
			drift.push({
				id: task.id,
				reason: `status "${task.status}" is terminal but phase "${task.phase}" (pipeline "${task.pipeline_id}") is not — terminal/phase divergence`,
			});
		}
	}
	return drift;
}
