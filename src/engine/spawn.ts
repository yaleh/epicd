/**
 * Spawn seam — the harness boundary between engine core and Claude Code workers.
 *
 * Engine core (driver) only orchestrates *when* and *which* task to process;
 * the actual worker spawn is delegated to an injected WorkerRunner (thin harness
 * skill).  This keeps child-process / Agent logic entirely outside engine core
 * and allows tests to inject a fake runner without forking anything.
 *
 * Invariants enforced here:
 *   - Worktree is created via safety.withWorktree (isolated, cleaned up in finally).
 *   - Engine core never calls the Agent constructor or spawns subprocesses — WorkerRunner is the seam.
 */

import type { Task } from "../types/index.js";
import type { CompletionResult } from "./complete.js";
import { type WorktreeRunner, withWorktree } from "./safety.js";

/**
 * Harness boundary: the entity that actually runs a worker (e.g. a Claude Code
 * agent, a test double, a shell script).  Lives outside engine core; injected
 * into realSpawn by the caller (harness skill or test).
 */
export interface WorkerRunner {
	/**
	 * Run the worker for `task` inside the already-created `worktreePath`.
	 * Returns a CompletionResult; the engine (not the worker) adjudicates outcome.
	 */
	run(task: Task, worktreePath: string): Promise<CompletionResult>;
}

/**
 * Creates an isolated git worktree for `task`, calls `runner.run()` inside it,
 * and removes the worktree unconditionally (try/finally).
 *
 * Engine core has no knowledge of *how* the runner works — it only receives
 * the CompletionResult back for adjudication.
 */
export async function realSpawn(
	task: Task,
	repoPath: string,
	runner: WorkerRunner,
	worktreeRunner: WorktreeRunner,
): Promise<CompletionResult> {
	return withWorktree(repoPath, task.id, (worktreePath) => runner.run(task, worktreePath), worktreeRunner);
}
