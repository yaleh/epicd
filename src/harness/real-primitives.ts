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
 *   - realMergeLockFs: MergeLockFs        — fs adapter for merge-lock
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompletionResult } from "../engine/complete.js";
import type { MergeLockFs, WorktreeRunner } from "../engine/safety.js";
import type { SpawnPrimitive } from "./worker-runner.js";

/**
 * Real SpawnPrimitive: runs the `claude` CLI as a subprocess inside the
 * given worktreePath, passing the brief via CLAUDE_TASK_BRIEF env var and
 * a --print flag for non-interactive single-shot execution.
 *
 * Exit code 0 → success; non-zero → failure (error captured from stderr).
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
		stdout: "inherit",
		stderr: "pipe",
	});

	const exitCode = await proc.exited;
	if (exitCode === 0) {
		return { success: true };
	}

	const errText = await new Response(proc.stderr).text().catch(() => "");
	return { success: false, error: `claude exited ${exitCode}${errText ? `: ${errText.slice(0, 500)}` : ""}` };
};

/**
 * Real WorktreeRunner: delegates to git shell commands via Bun.spawn.
 */
export const gitWorktreeRunner: WorktreeRunner = {
	add: async (repoPath: string, worktreePath: string): Promise<void> => {
		const proc = Bun.spawn(["git", "worktree", "add", "--detach", worktreePath], {
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
 * Real MergeLockFs adapter for production use.
 */
export const realMergeLockFs: MergeLockFs = {
	mkdir: (dir: string, options: { recursive: true }): Promise<void> => mkdir(dir, options).then(() => {}),
	writeFile: (path: string, data: string): Promise<void> => writeFile(path, data),
	exists: (path: string): boolean => existsSync(path),
	join: (...parts: string[]): string => join(...parts),
};
