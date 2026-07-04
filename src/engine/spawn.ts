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
import type { CompletionResult, DodResult } from "./complete.js";
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
 * Harness-injected DoD runner (ENG-8).  Called inside the worktree *after*
 * the worker finishes but *before* the worktree is torn down so every command
 * executes against the worker's actual output.
 *
 * Lives in src/harness/ (shells out); injected here so engine core stays
 * free of subprocess calls.
 */
export type DodRunner = (task: Task, worktreePath: string) => Promise<DodResult[]>;

/**
 * Creates an isolated git worktree for `task`, calls `runner.run()` inside it,
 * optionally runs `dodRunner` in the same worktree before teardown, then
 * removes the worktree unconditionally (try/finally).
 *
 * Engine core has no knowledge of *how* the runner works — it only receives
 * the CompletionResult back for adjudication.
 *
 * @param dodRunner  Optional harness-injected DoD runner (ENG-8).  When
 *                   omitted the call behaves identically to the pre-ENG-8
 *                   4-argument form — existing callers are unaffected.
 */
export async function realSpawn(
	task: Task,
	repoPath: string,
	runner: WorkerRunner,
	worktreeRunner: WorktreeRunner,
	dodRunner?: DodRunner,
): Promise<CompletionResult> {
	return withWorktree(
		repoPath,
		task.id,
		async (worktreePath) => {
			const workerResult = await runner.run(task, worktreePath);
			if (!dodRunner) return workerResult;
			const dodResults = await dodRunner(task, worktreePath);
			return { ...workerResult, dodResults };
		},
		worktreeRunner,
	);
}
