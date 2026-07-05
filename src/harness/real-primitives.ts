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
 * The correct mechanism is `engine scan` (emit-only) driving the epicd-run
 * skill, which performs the work as an in-session Agent tool call and then
 * calls `engine complete` (wrapping `completeTask`) to adjudicate + merge.
 *
 * Exports:
 *   - gitWorktreeRunner: WorktreeRunner   — runs git worktree shell commands
 *   - gitMergeBranch                      — merges task/<id> branch into HEAD under cwd
 *   - gitCommitBoardChange                — commits completeTask's post-merge board phase write
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

	// Failure: check whether every unmerged path is a board file under
	// backlog/tasks/ — if so, the collision is the structural engine-owns-
	// the-board-file conflict (BACK-619), not a genuine code conflict.
	// Resolve those paths in favor of main and finish the merge. Any other
	// unmerged path (including other backlog/ subtrees) still escalates.
	const unmergedProc = Bun.spawn(["git", "diff", "--name-only", "--diff-filter=U"], {
		cwd: repoPath,
		stdout: "pipe",
		stderr: "pipe",
	});
	const unmergedOut = await new Response(unmergedProc.stdout).text();
	await unmergedProc.exited;
	const unmergedPaths = unmergedOut
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const isBoardOnly = unmergedPaths.length > 0 && unmergedPaths.every((path) => path.startsWith("backlog/tasks/"));

	if (isBoardOnly) {
		const checkoutOurs = Bun.spawn(["git", "checkout", "--ours", "--", ...unmergedPaths], {
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		const checkoutCode = await checkoutOurs.exited;

		const add = Bun.spawn(["git", "add", "--", ...unmergedPaths], {
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		const addCode = await add.exited;

		const commit = Bun.spawn(["git", "commit", "--no-edit"], {
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		const commitCode = await commit.exited;

		if (checkoutCode === 0 && addCode === 0 && commitCode === 0) {
			const del = Bun.spawn(["git", "branch", "-d", branchName], {
				cwd: repoPath,
				stdout: "pipe",
				stderr: "pipe",
			});
			await del.exited; // best-effort
			return { merged: true };
		}

		// Resolution attempt itself failed unexpectedly — fall through to abort.
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
 * Commits the board-file phase write that `completeTask` makes after a merge
 * (BACK-616) — without this, `store.updateTask`'s write lands on disk but is
 * never part of git history, leaving the repo dirty after every `engine
 * complete` run. Scoped to `backlog/` so it never stages unrelated
 * working-tree changes. No-ops (does not commit) when nothing is staged —
 * safe to call even if the phase write happened to match what was already
 * committed.
 */
export async function gitCommitBoardChange(repoPath: string, taskId: string, verdict: string): Promise<void> {
	const add = Bun.spawn(["git", "add", "-A", "--", "backlog"], {
		cwd: repoPath,
		stdout: "pipe",
		stderr: "inherit",
	});
	await add.exited;

	const diff = Bun.spawn(["git", "diff", "--cached", "--quiet"], { cwd: repoPath });
	const diffCode = await diff.exited;
	if (diffCode === 0) return; // nothing staged — nothing to commit

	const commit = Bun.spawn(["git", "commit", "-m", `board: ${taskId} -> ${verdict}`], {
		cwd: repoPath,
		stdout: "inherit",
		stderr: "inherit",
	});
	await commit.exited;
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
