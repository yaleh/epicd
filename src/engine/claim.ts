/**
 * BACK-686.1 A2 — the single centralization point for `.caps`/`.active-agents`
 * reads and writes (AC#3). Today claim state is scattered across
 * `.caps/<id>.exec-lock` (flock), `.active-agents` (single-driver guard),
 * `.caps/<id>.wt`/`.signal` (capability tokens), and free-text "claimed:"
 * timestamps in Implementation Notes — none of it self-cleans after a crash
 * (`kill -9` leaves a task permanently stuck in "processing"). This module
 * upgrades claim to an engine-native, leased, one-and-only in-flight record,
 * covering every machine-actor phase (including `execution/adjudicating`,
 * which has no claim protection at all today — AC#4).
 *
 * A `ClaimRecord` stores claim METADATA ONLY — worktree/branch/entryPhase/
 * lease/puller. It never stores a `phase` copy (AC#6): `task.phase` remains
 * the single progress truth: this module answers "is someone working this
 * task right now, and until when", not "where is this task in the pipeline".
 *
 * Locking primitive: reuses the same `proper-lockfile` pattern already used
 * by `src/engine/safety.ts` (`withMergeLock`) and `src/engine/supervisor.ts`
 * (`acquireFieldLock`) — a short, non-blocking critical section around the
 * read-check-write of the claim file, rather than inventing a second locking
 * convention (AC#7 constraint). The lock is released as soon as the claim
 * file is written; the claim's lifetime is governed by its own
 * `leaseExpiresAt`, reaped by `reapStaleClaims` (Phase C), not by holding the
 * OS lock for the task's entire execution.
 *
 * `handle-basic-ready.sh` remains the OS-level flock writer for its own
 * `<id>.exec-lock` file — centralization here targets the Node/TS read/write
 * call sites, not the shell script's locking primitive.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import lockfile from "proper-lockfile";

/** Name of the directory holding all per-task capability/claim files. */
export const CAPS_DIR_NAME = ".caps";

/**
 * Name of the flag file written by the old loop-backlog to signal an active
 * agent session. Presence of this file triggers the single-active-driver guard
 * in `src/engine/run.ts`.
 */
export const ACTIVE_AGENTS_FILE_NAME = ".active-agents";

/** Claim metadata for one in-flight task. Never carries a `phase` field (AC#6). */
export interface ClaimRecord {
	taskId: string;
	/** Absolute path to the git worktree the claiming agent is working in. */
	worktree: string;
	/** Git branch the claiming agent is working on. */
	branch: string;
	/** The `pipeline_id/phase` this task entered its current pipeline from. */
	entryPhase: string;
	/** ISO timestamp: the claim's lease expires at this instant. */
	leaseExpiresAt: string;
	/** Opaque identifier for the puller/agent context holding the claim. */
	puller: string;
}

function capsDir(backlogDir: string): string {
	return join(backlogDir, CAPS_DIR_NAME);
}

/** Path to the OS-level flock file `handle-basic-ready.sh` acquires for `taskId`. */
export function execLockPath(backlogDir: string, taskId: string): string {
	return join(capsDir(backlogDir), `${taskId}.exec-lock`);
}

/** Path to the worktree-path capability token file for `taskId`. */
export function worktreeMarkerPath(backlogDir: string, taskId: string): string {
	return join(capsDir(backlogDir), `${taskId}.wt`);
}

/** Path to the signal-path capability token file for `taskId`. */
export function signalMarkerPath(backlogDir: string, taskId: string): string {
	return join(capsDir(backlogDir), `${taskId}.signal`);
}

/** Path to the JSON claim record for `taskId`. */
export function claimRecordPath(backlogDir: string, taskId: string): string {
	return join(capsDir(backlogDir), `${taskId}.claim.json`);
}

/** Path to the single-active-driver guard flag file. */
export function activeAgentsPath(backlogDir: string): string {
	return join(backlogDir, ACTIVE_AGENTS_FILE_NAME);
}

/** True when the single-active-driver guard flag file is present. */
export function isActiveAgentsPresent(backlogDir: string): boolean {
	return existsSync(activeAgentsPath(backlogDir));
}

/** Reads and parses the claim record for `taskId`, or `null` if none exists / is unreadable. */
export function readClaim(backlogDir: string, taskId: string): ClaimRecord | null {
	const path = claimRecordPath(backlogDir, taskId);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as ClaimRecord;
	} catch {
		return null;
	}
}

/**
 * Acquires an exclusive claim for `record.taskId`. Throws immediately if an
 * active claim already exists for that task id — no retry, since a second
 * concurrent claim for the same task is a mutex violation, not a race to wait
 * out (mirrors `acquireFieldLock`'s `retries: 0` semantics).
 */
export async function acquireClaim(backlogDir: string, record: ClaimRecord): Promise<void> {
	const dir = capsDir(backlogDir);
	mkdirSync(dir, { recursive: true });

	const sentinelPath = join(dir, `${record.taskId}.claim-sentinel`);
	if (!existsSync(sentinelPath)) {
		writeFileSync(sentinelPath, "");
	}

	const release = await lockfile.lock(sentinelPath, {
		lockfilePath: join(dir, `${record.taskId}.claim.lock`),
		stale: 30_000,
		retries: 0,
	});
	try {
		const existing = readClaim(backlogDir, record.taskId);
		if (existing) {
			throw new Error(
				`acquireClaim: task ${record.taskId} already has an active claim (held by ${existing.puller}, expires ${existing.leaseExpiresAt})`,
			);
		}
		writeFileSync(claimRecordPath(backlogDir, record.taskId), JSON.stringify(record, null, 2));
	} finally {
		await release();
	}
}

/** Releases the claim for `taskId`, if one exists. No-op if none exists. */
export function releaseClaim(backlogDir: string, taskId: string): void {
	const path = claimRecordPath(backlogDir, taskId);
	if (existsSync(path)) {
		unlinkSync(path);
	}
}

/** Lists every currently-recorded claim, across all task ids. */
export function listActiveClaims(backlogDir: string): ClaimRecord[] {
	const dir = capsDir(backlogDir);
	if (!existsSync(dir)) return [];
	const claims: ClaimRecord[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".claim.json")) continue;
		try {
			claims.push(JSON.parse(readFileSync(join(dir, name), "utf8")) as ClaimRecord);
		} catch {
			// skip unreadable/corrupt claim files
		}
	}
	return claims;
}

/**
 * Staleness reaper (AC#5): scans every active claim and releases any whose
 * `leaseExpiresAt` has passed. Never touches `task.phase` — a crashed agent's
 * task frees back into "queued" (claim gone, phase unchanged), it does not
 * get re-routed by this function. Returns the list of reaped task ids.
 */
export function reapStaleClaims(backlogDir: string, now: Date = new Date()): string[] {
	const reaped: string[] = [];
	for (const claim of listActiveClaims(backlogDir)) {
		if (new Date(claim.leaseExpiresAt).getTime() < now.getTime()) {
			releaseClaim(backlogDir, claim.taskId);
			reaped.push(claim.taskId);
		}
	}
	return reaped;
}
