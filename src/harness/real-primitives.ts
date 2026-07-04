/**
 * Real harness primitives — used by the CLI's `engine complete` command and by
 * anything needing real git worktree/merge behavior.
 *
 * These live outside engine core and are the only place that touches
 * child processes or git shell commands.  Engine core (src/engine)
 * never imports this module.
 *
 * The old `realSpawnPrimitive` (a claude-CLI subprocess spawn that "did the
 * work" for a ready task) has been retired — see BACK-605.8 Phase D.
 * The correct mechanism is `engine watch` (emit-only) driving the epicd-run
 * skill, which performs the work as an in-session Agent tool call and then
 * calls `engine complete` (wrapping `completeTask`) to adjudicate + merge.
 *
 * Exports:
 *   - gitWorktreeRunner: WorktreeRunner   — runs git worktree shell commands
 *   - gitMergeBranch                      — merges task/<id> branch into HEAD under cwd
 *   - realMergeLockFs: MergeLockFs        — fs adapter for merge-lock
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { MergeLockFs, WorktreeRunner } from "../engine/safety.js";

/**
 * Real WorktreeRunner: delegates to git shell commands via Bun.spawn.
 *
 * `add` creates a branch `task/<taskId>` (derived from the basename of
 * worktreePath) so the worker's commits are preserved on a named branch
 * that `gitMergeBranch` can later merge into the main branch.  Any
 * pre-existing `task/<taskId>` branch (crash residue) is removed first.
 */
export const gitWorktreeRunner: WorktreeRunner = {
	add: async (repoPath: string, worktreePath: string): Promise<void> => {
		const taskId = basename(worktreePath);
		const branchName = `task/${taskId}`;

		// Best-effort: remove crash-residue branch before creating the worktree
		const cleanup = Bun.spawn(["git", "branch", "-D", branchName], {
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		await cleanup.exited; // ignore exit code — branch may not exist

		const proc = Bun.spawn(["git", "worktree", "add", "-b", branchName, worktreePath], {
			cwd: repoPath,
			stdout: "inherit",
			stderr: "inherit",
		});
		const code = await proc.exited;
		if (code !== 0) throw new Error(`git worktree add failed (exit ${code})`);
	},
	remove: async (repoPath: string, worktreePath: string): Promise<void> => {
		const proc = Bun.spawn(["git", "worktree", "remove", "--force", worktreePath], {
			cwd: repoPath,
			stdout: "inherit",
			stderr: "inherit",
		});
		await proc.exited; // best-effort; rmrf follows
	},
	rmrf: async (path: string): Promise<void> => {
		const proc = Bun.spawn(["rm", "-rf", path], { stdout: "inherit", stderr: "inherit" });
		await proc.exited; // best-effort cleanup
	},
	join: (...parts: string[]): string => join(...parts),
};

/**
 * Merge the task's branch (`task/<taskId>`) into the current HEAD of repoPath
 * using `git merge --no-ff`.
 *
 * On success: deletes the branch and returns `{merged: true}`.
 * On conflict/failure: aborts the merge and returns `{merged: false, conflict: true}`.
 */
export async function gitMergeBranch(
	repoPath: string,
	taskId: string,
): Promise<{ merged: boolean; conflict?: boolean }> {
	const branchName = `task/${taskId}`;

	const mergeProc = Bun.spawn(["git", "merge", "--no-ff", branchName], {
		cwd: repoPath,
		stdout: "inherit",
		stderr: "inherit",
	});
	const mergeCode = await mergeProc.exited;

	if (mergeCode === 0) {
		// Success: clean up the branch
		const del = Bun.spawn(["git", "branch", "-d", branchName], {
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		await del.exited; // best-effort
		return { merged: true };
	}

	// Failure: abort any partial merge so the repo stays clean
	const abort = Bun.spawn(["git", "merge", "--abort"], {
		cwd: repoPath,
		stdout: "pipe",
		stderr: "pipe",
	});
	await abort.exited; // best-effort
	return { merged: false, conflict: true };
}

/**
 * Real MergeLockFs adapter for production use.
 */
export const realMergeLockFs: MergeLockFs = {
	mkdir: (dir: string, options: { recursive: true }): Promise<void> => mkdir(dir, options).then(() => {}),
	writeFile: (path: string, data: string): Promise<void> => writeFile(path, data),
	exists: (path: string): boolean => existsSync(path),
	join: (...parts: string[]): string => join(...parts),
};
