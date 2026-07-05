/**
 * BACK-601.5: in-place, idempotent backfill of engine structural fields
 * (pipeline_id/phase/parent_id/role) on existing task files.
 *
 * Only structural defaults are derived here (registry defaults + tree
 * position, per ADR-011 D-1.1 roleOf()); `dod`/`cap` are declarative content
 * and are never populated by this routine.
 */

import { executionPipeline } from "../engine/pipeline.ts";
import { roleOf, type Task } from "../types/index.ts";
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
 * Compute the currently-blank structural fields a task should be backfilled
 * with. Returns only the keys that are missing on the task — never
 * overwrites an already-present value, and never touches `dod`/`cap`.
 */
export function computeBackfillFields(
	task: Task,
	childIdsByParent: Map<string, string[]>,
): Partial<Pick<Task, "pipeline_id" | "phase" | "parent_id" | "role">> {
	const patch: Partial<Pick<Task, "pipeline_id" | "phase" | "parent_id" | "role">> = {};

	if (!task.pipeline_id) {
		patch.pipeline_id = executionPipeline.id;
	}
	if (!task.phase) {
		const derived = deriveBarePhase(task.status);
		if (derived) patch.phase = derived;
	}
	if (!task.parent_id && task.parentTaskId) {
		patch.parent_id = task.parentTaskId;
	}
	if (!task.role) {
		patch.role = roleOf(task, childIdsByParent.get(task.id) ?? task.subtasks);
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

	const childIdsByParent = new Map<string, string[]>();
	for (const task of tasks) {
		if (!task.parentTaskId) continue;
		const siblings = childIdsByParent.get(task.parentTaskId) ?? [];
		siblings.push(task.id);
		childIdsByParent.set(task.parentTaskId, siblings);
	}

	const changed: Task[] = [];
	const updated: string[] = [];
	for (const task of tasks) {
		const patch = computeBackfillFields(task, childIdsByParent);
		if (Object.keys(patch).length === 0) continue;
		changed.push({ ...task, ...patch });
		updated.push(task.id);
	}

	if (changed.length > 0) {
		await core.updateTasksBulk(changed, "BACK-612 backfill: engine structural fields", false);
	}

	return { updated };
}
