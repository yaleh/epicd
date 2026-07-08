import type { Core } from "../core/backlog.js";
import { ACTIVE_AGENTS_FILE_NAME, activeAgentsPath, isActiveAgentsPresent, reapStaleClaims } from "./claim.js";
import { type DecomposeHandler, Driver, type SafetyConfig, type WorktreeOps } from "./driver.js";
import { executionPipeline, type Pipeline } from "./pipeline.js";
import { makeBoardStore } from "./store.js";

/**
 * Name of the flag file written by the old loop-backlog to signal an active
 * agent session, re-exported from the single centralization point
 * (`src/engine/claim.ts`, BACK-686.1 A2 AC#3) so existing callers of this
 * constant keep working unchanged.
 */
export const ACTIVE_AGENTS_FILE = ACTIVE_AGENTS_FILE_NAME;

/**
 * Guard: return true when another driver or the legacy loop-backlog is already
 * running. Checks for the shared active-agents flag file in `backlogDir`
 * (path sourced from `src/engine/claim.ts`, BACK-686.1 A2 AC#3).
 */
export function isDriverActive(backlogDir: string): boolean {
	return isActiveAgentsPresent(backlogDir);
}

/**
 * Returns true if any task in the list is in a machine-actor phase of any of the
 * given pipelines.  Used to detect fixpoint (no remaining work). Generalized
 * (BACK-603) from a single hardcoded `executionPipeline` check to an arbitrary
 * `pipelines` list — registering an additional pipeline (e.g. exploration) is a
 * data change at the call site, not an edit to this function's logic.
 */
function hasPendingWork(tasks: Array<{ pipeline_id?: string; phase?: string }>, pipelines: Pipeline[]): boolean {
	for (const task of tasks) {
		if (!task.pipeline_id || !task.phase) continue;
		const pipeline = pipelines.find((p) => p.id === task.pipeline_id);
		if (!pipeline) continue;
		const state = pipeline.states.find((s) => s.name === task.phase);
		if (state?.actor === "machine") return true;
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
	/**
	 * Pipelines the driver dispatches against (BACK-603 generalization).
	 * Defaults to `[executionPipeline]` — today's sole caller shape is unchanged.
	 * Pass additional pipelines (e.g. an exploration pipeline) to drive them in
	 * the same run without editing this module's body.
	 */
	pipelines?: Pipeline[];
}

/**
 * Run the given pipelines (default: execution only) against the real board until
 * fixpoint.
 *
 * Single-active-driver guard: if the active-agents flag file exists in
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
			`Single-active-driver guard: another driver or loop-backlog is active (${activeAgentsPath(backlogDir)} exists). Refusing to start.`,
		);
	}

	const pipelines = options.pipelines ?? [executionPipeline];
	const pipelineIds = new Set(pipelines.map((p) => p.id));
	const store = makeBoardStore(core);
	const driver = new Driver(pipelines, store, worktree, options.safety, options.decompose);
	const { maxTicks = 100, onTick } = options;

	let ticks = 0;
	while (ticks < maxTicks) {
		// BACK-686.1 A2 AC#5: reap stale claims every tick, before dispatching more
		// work — a crashed agent's lease-expired claim is freed (claim gone, phase
		// untouched) so the task becomes reachable again on this same tick.
		reapStaleClaims(backlogDir);

		const tasks = await core.queryTasks({});
		if (!hasPendingWork(tasks, pipelines)) break;

		const engineTasks = tasks.filter((t) => t.pipeline_id && pipelineIds.has(t.pipeline_id));
		await driver.tick(engineTasks);
		ticks++;
		onTick?.(ticks);
	}

	return { ticks };
}
