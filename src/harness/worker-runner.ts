/**
 * WorkerRunner harness — wraps a spawn primitive to build a WorkerRunner.
 *
 * Lives outside engine core (src/harness/) to keep the seam clean: engine core
 * never calls Agent() or spawns subprocesses; the spawn primitive is injected
 * here by the CLI or Monitor skill.
 *
 * SpawnPrimitive: (brief: string, worktreePath: string) => Promise<CompletionResult>
 *   - brief: a structured text prompt describing the task, DoD, and worktree path.
 *   - worktreePath: isolated git worktree where the worker should operate.
 *
 * makeWorkerRunner wraps a SpawnPrimitive to implement the WorkerRunner interface
 * expected by realSpawn in engine core.
 */

import type { CompletionResult } from "../engine/complete.js";
import type { WorkerRunner } from "../engine/spawn.js";
import type { Task } from "../types/index.js";

/**
 * Primitive that performs the actual spawn (e.g. Claude Code Agent, shell
 * script, test double).  Injected by harness/CLI; never called from engine core.
 */
export type SpawnPrimitive = (brief: string, worktreePath: string) => Promise<CompletionResult>;

/**
 * Build a brief text prompt for the worker from the task's title, description,
 * implementation plan, DoD items, and the worktree path where the worker should
 * operate.
 */
export function buildBrief(task: Task, worktreePath: string): string {
	const lines: string[] = [];
	lines.push(`# Task: ${task.id} — ${task.title}`);

	if (task.description) {
		lines.push("", "## Description", task.description);
	}

	if (task.implementationPlan) {
		lines.push("", "## Implementation Plan", task.implementationPlan);
	}

	const dod = task.dod ?? task.definitionOfDoneItems ?? [];
	if (dod.length > 0) {
		lines.push("", "## Definition of Done");
		for (const item of dod) {
			const checked = (item as { checked?: boolean }).checked ? "[x]" : "[ ]";
			const text =
				(item as { text?: string; description?: string }).text ??
				(item as { description?: string }).description ??
				String(item);
			lines.push(`- ${checked} ${text}`);
		}
	}

	lines.push("", "## Worktree", worktreePath);
	lines.push("", "Work exclusively inside the worktree path above. Commit your changes there.");

	return lines.join("\n");
}

/**
 * Create a WorkerRunner backed by the given SpawnPrimitive.
 *
 * Usage (harness / tests):
 *   const runner = makeWorkerRunner(someSpawnPrimitive);
 *   // inject into realSpawn or WorktreeOps.spawn
 *
 * Note: there is no "real" (production) SpawnPrimitive anymore — the engine
 * never spawns an agent itself. See BACK-605.8 Phase D: work is driven by the
 * epicd-run skill as an in-session Agent tool call, not by engine core.
 */
export function makeWorkerRunner(spawnPrimitive: SpawnPrimitive): WorkerRunner {
	return {
		run: async (task: Task, worktreePath: string): Promise<CompletionResult> => {
			const brief = buildBrief(task, worktreePath);
			return spawnPrimitive(brief, worktreePath);
		},
	};
}
