/**
 * Real harness primitives — injected into makeWorkerRunner and the CLI.
 *
 * These live outside engine core and are the only place that touches
 * child processes or git shell commands.  Engine core (src/engine)
 * never imports this module.
 *
 * Exports:
 *   - realSpawnPrimitive: SpawnPrimitive  — launches a Claude Code agent CLI
 *   - gitWorktreeRunner: WorktreeRunner   — runs git worktree shell commands
 *   - gitMergeBranch                      — merges task/<id> branch into HEAD under cwd
 *   - realMergeLockFs: MergeLockFs        — fs adapter for merge-lock
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CompletionResult } from "../engine/complete.js";
import type { MergeLockFs, WorktreeRunner } from "../engine/safety.js";
import type { SpawnPrimitive } from "./worker-runner.js";

/**
 * Real SpawnPrimitive: runs the `claude` CLI as a subprocess inside the
 * given worktreePath, passing the brief via CLAUDE_TASK_BRIEF env var and
 * a --print flag for non-interactive single-shot execution.
 *
 * Exit code 0 → success; non-zero → failure (error captured from stderr).
 * The worker's stdout is captured into `output` (and echoed live) so the
 * decompose path can parse worker-proposed children (BACK-605.5).
 *
 * Note: true Claude Code Agent spawn cannot be verified with `bun test`;
 * this is validated by soak/manual e2e (see BACK-605.1 Constraints).
 */
export const realSpawnPrimitive: SpawnPrimitive = async (
	brief: string,
	worktreePath: string,
): Promise<CompletionResult> => {
	const proc = Bun.spawn(["claude", "--dangerously-skip-permissions", "--print", brief], {
		cwd: worktreePath,
		env: { ...process.env, CLAUDE_TASK_BRIEF: brief },
		stdout: "pipe",
		stderr: "pipe",
	});

	// Capture stdout while echoing it live so observability is preserved.
	let output = "";
	const decoder = new TextDecoder();
	const reader = proc.stdout.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const text = decoder.decode(value, { stream: true });
			output += text;
			process.stdout.write(text);
		}
	} finally {
		reader.releaseLock();
	}

	const exitCode = await proc.exited;
	if (exitCode === 0) {
		return { success: true, output };
	}

	const errText = await new Response(proc.stderr).text().catch(() => "");
	return {
		success: false,
		output,
		error: `claude exited ${exitCode}${errText ? `: ${errText.slice(0, 500)}` : ""}`,
	};
};

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
