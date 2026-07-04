import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Core } from "../core/backlog.js";
import { type DecomposeHandler, Driver, type SafetyConfig, type WorktreeOps } from "./driver.js";
import { executionPipeline } from "./pipeline.js";
import { makeBoardStore } from "./store.js";

/**
 * Name of the flag file written by the old loop-backlog to signal an active
 * agent session.  Presence of this file triggers the single-active-driver guard.
 */
export const ACTIVE_AGENTS_FILE = ".active-agents";

/**
 * Guard: return true when another driver or the legacy loop-backlog is already
 * running.  Checks for the shared `.active-agents` file in `backlogDir`.
 */
export function isDriverActive(backlogDir: string): boolean {
	return existsSync(join(backlogDir, ACTIVE_AGENTS_FILE));
}

/**
 * Returns true if any task in the list is in a machine-actor phase of the
 * execution pipeline.  Used to detect fixpoint (no remaining work).
 */
function hasPendingWork(tasks: Array<{ pipeline_id?: string; phase?: string }>): boolean {
	for (const task of tasks) {
		if (!task.pipeline_id || !task.phase) continue;
		if (task.pipeline_id === executionPipeline.id) {
			const state = executionPipeline.states.find((s) => s.name === task.phase);
			if (state?.actor === "machine") return true;
		}
	}
	return false;
}

export interface RunEngineOptions {
	/** Max number of ticks before giving up (default 100). */
	maxTicks?: number;
	/** Optional safety config; omit for in-memory/test usage. */
	safety?: SafetyConfig;
	/** Optional decompose handler for compound/epic tasks (injected by the harness). */
	decompose?: DecomposeHandler;
	/** Called after each tick with the current tick count (optional, useful for logging). */
	onTick?: (tick: number) => void;
}

/**
 * Run the execution pipeline against the real board until fixpoint.
 *
 * Single-active-driver guard: if the `.active-agents` file exists in
 * `backlogDir`, throws immediately so the caller knows to back off.
 */
export async function runEngine(
	core: Core,
	worktree: WorktreeOps,
	options: RunEngineOptions = {},
): Promise<{ ticks: number }> {
	const backlogDir = core.filesystem.backlogDir;

	if (isDriverActive(backlogDir)) {
		throw new Error(
			`Single-active-driver guard: another driver or loop-backlog is active (${join(backlogDir, ACTIVE_AGENTS_FILE)} exists). Refusing to start.`,
		);
	}

	const store = makeBoardStore(core);
	const driver = new Driver([executionPipeline], store, worktree, options.safety, options.decompose);
	const { maxTicks = 100, onTick } = options;

	let ticks = 0;
	while (ticks < maxTicks) {
		const tasks = await core.queryTasks({});
		if (!hasPendingWork(tasks)) break;

		const engineTasks = tasks.filter((t) => t.pipeline_id === executionPipeline.id);
		await driver.tick(engineTasks);
		ticks++;
		onTick?.(ticks);
	}

	return { ticks };
}
