/**
 * ADR-010 safety invariants for the epicd engine:
 *   1. Merge serialization  – withMergeLock prevents concurrent merges.
 *   2. Worktree isolation   – withWorktree creates an isolated git worktree and
 *                             removes it unconditionally (try/finally).
 *   3. Cap idempotency      – hasCapMarker/addCapMarker/withCapGuard ensure a
 *                             phase is never executed twice across restarts.
 *
 * Cross-mechanism lock (AC #1):
 *   The merge lock is stored at `<backlogDir>/.merge-lock` — the SAME path used
 *   by the old loop-backlog's complete-task.sh.  proper-lockfile creates the lock
 *   as a directory (atomic mkdir); the old loop writes a PID file there.  Each
 *   form of presence blocks the other: writing a file over a directory fails, and
 *   mkdir over a file fails.  This delivers mutual exclusion without requiring
 *   either side to know about the other's implementation.
 */

import lockfile from "proper-lockfile";
import type { Task } from "../types/index.js";
import type { TaskStore } from "./complete.js";

// ── 1. Merge serialization ─────────────────────────────────────────────────

/**
 * Name of the shared board-level merge lock file, aligned with the old
 * loop-backlog's `.merge-lock` convention so both mechanisms are mutually
 * exclusive on the same path.
 */
export const MERGE_LOCK_FILENAME = ".merge-lock";

/**
 * Minimal fs interface required by withMergeLock.  Injected so the module
 * carries no direct node/bun imports that break the project's tsc baseline.
 */
export interface MergeLockFs {
	mkdir(dir: string, options: { recursive: true }): Promise<void>;
	writeFile(path: string, data: string): Promise<void>;
	exists(path: string): boolean;
	join(...parts: string[]): string;
}

/**
 * Runs `fn` under an exclusive board-level merge lock stored at
 * `<backlogDir>/.merge-lock`.  Concurrent callers (including the old
 * loop-backlog) block until the lock is released.
 */
export async function withMergeLock<T>(backlogDir: string, fn: () => Promise<T>, fs: MergeLockFs): Promise<T> {
	await fs.mkdir(backlogDir, { recursive: true });

	// proper-lockfile needs a file to attach the lock to; use a stable sentinel.
	const sentinelPath = fs.join(backlogDir, ".merge-lock-sentinel");
	if (!fs.exists(sentinelPath)) {
		await fs.writeFile(sentinelPath, "");
	}

	const release = await lockfile.lock(sentinelPath, {
		lockfilePath: fs.join(backlogDir, MERGE_LOCK_FILENAME),
		stale: 30_000,
		retries: { retries: 20, minTimeout: 50, maxTimeout: 500 },
	});
	try {
		return await fn();
	} finally {
		await release();
	}
}

// ── 2. Worktree isolation ──────────────────────────────────────────────────

/**
 * Primitive git operations injected into withWorktree so the module does
 * not depend on bun's `$` shell helper.
 */
export interface WorktreeRunner {
	add(repoPath: string, worktreePath: string): Promise<void>;
	remove(repoPath: string, worktreePath: string): Promise<void>;
	rmrf(path: string): Promise<void>;
	join(...parts: string[]): string;
}

/**
 * Creates a detached git worktree at `<repoPath>/.worktrees/<taskId>`, calls
 * `fn` with the worktree path, then removes the worktree unconditionally in a
 * `finally` block — whether `fn` succeeds or throws.
 */
export async function withWorktree<T>(
	repoPath: string,
	taskId: string,
	fn: (worktreePath: string) => Promise<T>,
	runner: WorktreeRunner,
): Promise<T> {
	const worktreePath = runner.join(repoPath, ".worktrees", taskId);
	await runner.add(repoPath, worktreePath);
	try {
		return await fn(worktreePath);
	} finally {
		await runner.remove(repoPath, worktreePath).catch(() => {});
		await runner.rmrf(worktreePath).catch(() => {});
	}
}

// ── 3. Cap idempotency ─────────────────────────────────────────────────────

/** Returns true if the task's cap markers include a "done" entry for `phase`. */
export function hasCapMarker(task: Task, phase: string): boolean {
	return (task.cap ?? []).some(
		(m) => (m as Record<string, unknown>).phase === phase && (m as Record<string, unknown>).done === true,
	);
}

/** Returns a new Task with a done cap marker appended for `phase`. */
export function addCapMarker(task: Task, phase: string): Task {
	return {
		...task,
		cap: [...(task.cap ?? []), { phase, done: true, ts: new Date().toISOString() }],
	};
}

/**
 * Executes `fn` at most once for `(task, phase)`.
 *
 * - If a done cap marker already exists → returns `undefined` (skip).
 * - Otherwise → runs `fn`, appends the cap marker via `store.updateTask`,
 *   then returns the result.  The marker is written ONLY after `fn` succeeds,
 *   so a crash mid-execution leaves no false "done" marker.
 *
 * The cap marker is added to the CURRENT task version (re-fetched after `fn`)
 * so that any phase changes made by `fn` (e.g. ready → done) are preserved
 * rather than overwritten by a stale task snapshot.
 */
export async function withCapGuard<T>(
	task: Task,
	phase: string,
	fn: () => Promise<T>,
	store: TaskStore,
): Promise<T | undefined> {
	if (hasCapMarker(task, phase)) {
		return undefined;
	}
	const result = await fn();
	// Re-read the task so any phase changes made by fn() are not overwritten.
	const current = (await store.getTask(task.id)) ?? task;
	await store.updateTask(addCapMarker(current, phase));
	return result;
}
