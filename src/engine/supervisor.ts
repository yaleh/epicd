/**
 * epicd supervisor (BACK-628.2): replaces baime's Monitor+scan-loop.cjs for the
 * execution lane. A managed process that periodically scans for ready tasks and
 * emits the SAME self-contained dispatch payload (ADR-015 swap-litmus,
 * src/engine/dispatch.ts) that a Monitor seat would otherwise read and act on —
 * engine code is unchanged either way. The supervisor is transport-only: per
 * BACK-605.8 Phase D, engine/harness code never spawns a `claude` subprocess
 * itself (see no-claude-subprocess.test.ts) — the payload is consumed by an
 * in-session Agent tool call (a Claude Code seat, epicd- or baime-owned), which
 * performs the work and calls `engine complete` when done.
 *
 * Scope (per BACK-628.2's own non-goals): execution lane only, single field
 * (no authoring driver, no multi-lane coexistence — proposal §7 R1's MVD
 * recommendation).
 *
 * ENG-1/ENG-4 (cap idempotency / cold-start-safe dispatch dedup): reuses the
 * existing cap-marker mechanism (safety.ts) rather than a parallel offset file.
 * A dispatch cap marker is persisted BEFORE emitting, so a supervisor restart
 * mid-flight sees the marker and does not re-emit a task whose agent may still
 * be running. No separate "offset" concept is needed: `interpreter.scan`
 * derives ready tasks from current state each tick (not a replayed event log),
 * so idempotency is exactly the same guarantee as any other cap-guarded phase.
 *
 * ENG-6 (field-identity single instance): acquireFieldLock takes an exclusive,
 * non-blocking lock keyed by `pipeline_id`, mirroring withMergeLock's
 * proper-lockfile pattern in safety.ts. A second supervisor for the same field
 * fails fast instead of double-driving the same lane.
 */

import lockfile from "proper-lockfile";
import type { Core } from "../core/backlog.js";
import { worktreeMarkerPath } from "./claim.js";
import { renderBasicReadyDispatch } from "./dispatch.js";
import { addCapMarker, hasCapMarker } from "./safety.js";
import { scanReadyLines } from "./scan.js";

const DISPATCH_CAP_PHASE = "ready-dispatched";
const BASIC_READY_PREFIX = "basic-ready:";

/** Consumes one emitted dispatch payload (e.g. print it, hand it to a seat). Never spawns a process itself. */
export type SupervisorEmit = (taskId: string, payload: string) => Promise<void>;

/**
 * One scan→dispatch cycle: finds ready tasks not yet emitted (no cap marker),
 * persists the dispatch marker, then hands each payload to `emit`. Returns the
 * ids emitted this tick.
 */
export async function supervisorTick(core: Core, repoRoot: string, emit: SupervisorEmit): Promise<string[]> {
	const tasks = await core.queryTasks({});
	const readyIds = new Set(
		scanReadyLines(tasks)
			.filter((line) => line.startsWith(BASIC_READY_PREFIX))
			.map((line) => line.slice(BASIC_READY_PREFIX.length)),
	);

	const dispatched: string[] = [];
	for (const task of tasks) {
		if (!readyIds.has(task.id) || hasCapMarker(task, DISPATCH_CAP_PHASE)) continue;

		const payload = renderBasicReadyDispatch(
			task.id,
			task.title,
			repoRoot,
			worktreeMarkerPath(core.filesystem.backlogDir, task.id),
			core.filesystem.backlogDirName,
		);
		await core.updateTask(addCapMarker(task, DISPATCH_CAP_PHASE), false);
		await emit(task.id, payload);
		dispatched.push(task.id);
	}
	return dispatched;
}

/** Minimal fs interface for the field lock's sentinel file, mirroring safety.ts's MergeLockFs. */
export interface FieldLockFs {
	mkdir(dir: string, options: { recursive: true }): Promise<void>;
	writeFile(path: string, data: string): Promise<void>;
	exists(path: string): boolean;
	join(...parts: string[]): string;
}

/**
 * Acquires an exclusive, non-blocking lock for the (backlogDir, pipelineId) field
 * (ENG-6). Throws immediately if another supervisor already holds it — no retry,
 * since a second instance for the same field is a startup error, not a race to
 * wait out. Returns a release function.
 */
export async function acquireFieldLock(
	backlogDir: string,
	pipelineId: string,
	fs: FieldLockFs,
): Promise<() => Promise<void>> {
	await fs.mkdir(backlogDir, { recursive: true });

	const sentinelPath = fs.join(backlogDir, `.supervisor-${pipelineId}-sentinel`);
	if (!fs.exists(sentinelPath)) {
		await fs.writeFile(sentinelPath, "");
	}

	return lockfile.lock(sentinelPath, {
		lockfilePath: fs.join(backlogDir, `.supervisor-${pipelineId}.lock`),
		stale: 30_000,
		retries: 0,
	});
}
