/**
 * Decomposer harness — builds a DecomposeHandler that spawns a real worker to
 * create child tasks for a compound (epic) task.
 *
 * Design:
 *  - No worktree: decompose runs directly in the repo root (children are main-board artifacts).
 *  - Engine core never calls this; it is injected via the Driver's decompose parameter.
 *  - Idempotency layer: if the epic already has subtasks, skip spawning.
 *  - Phase transitions: success → awaiting-children; failure → needs-human.
 *
 * Seam invariant: engine core (src/engine) must not import this module.
 */

import type { CompletionResult, TaskStore } from "../engine/complete.js";
import type { DecomposeHandler } from "../engine/driver.js";
import type { Task } from "../types/index.js";

/** Primitive that actually runs a worker (real spawn or test double). */
export type SpawnPrimitive = (brief: string, cwd: string) => Promise<CompletionResult>;

/**
 * Build the brief text passed to the decomposer worker.
 *
 * The worker is instructed to:
 *  1. Read the epic's Sub-Task Decomposition section from its implementation plan.
 *  2. Create each child task via `backlog task create --parent <id> --status "Basic: Ready"
 *     --pipeline-id execution --phase ready`.
 */
function buildDecomposeBrief(task: Task): string {
	const lines: string[] = [];
	lines.push(`# Decompose Epic: ${task.id} — ${task.title}`);
	lines.push("", "## Your Mission");
	lines.push(
		"Read the Sub-Task Decomposition section in the implementation plan below and create",
		`each listed child task using the backlog CLI. Every child must be linked to parent ${task.id}`,
		"and enrolled in the engine execution pipeline.",
	);
	lines.push("", "## Instructions");
	lines.push(
		"For each child task in the decomposition, run:",
		"```",
		`backlog task create "<child title>" --parent ${task.id} --status "Basic: Ready" --pipeline-id execution --phase ready`,
		"```",
		"",
		"After creating all children, output a short summary of the children created.",
	);

	if (task.implementationPlan) {
		lines.push("", "## Implementation Plan (source of child tasks)", task.implementationPlan);
	}

	if (task.description) {
		lines.push("", "## Description", task.description);
	}

	return lines.join("\n");
}

/**
 * Create a DecomposeHandler backed by the given SpawnPrimitive.
 *
 * The returned handler:
 *  1. Checks for existing children (idempotency guard) — if subtasks exist, skip spawn.
 *  2. Otherwise spawns a worker with a decompose brief using cwd=repoPath (no worktree).
 *  3. Advances the epic's phase: success → awaiting-children; failure → needs-human.
 */
export function makeDecomposer(spawnPrimitive: SpawnPrimitive, store: TaskStore): DecomposeHandler {
	return async (task: Task, repoPath = "."): Promise<void> => {
		// Idempotency: if children already exist, skip spawn and stabilise phase.
		if (task.subtasks && task.subtasks.length > 0) {
			await store.updateTask({ ...task, phase: "awaiting-children" });
			return;
		}

		const brief = buildDecomposeBrief(task);
		const result = await spawnPrimitive(brief, repoPath);

		const nextPhase = result.success ? "awaiting-children" : "needs-human";
		await store.updateTask({ ...task, phase: nextPhase });
	};
}
