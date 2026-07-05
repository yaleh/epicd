/**
 * Exploration pipeline handlers (BACK-603 603.3).
 *
 * A `WorktreeOps` implementation for `explorationPipeline`'s single machine
 * phase ("spike"). Lives entirely at the handler/data layer — it is injected
 * into the generic `Driver` exactly the way `executionPipeline`'s worktree ops
 * are, and never requires an interpreter/driver/complete/adjudicate edit
 * (AC#3): registering a new pipeline only touches data definition (pipeline.ts)
 * + a new handler (this file).
 */

import type { Task } from "../types/index.js";
import type { CompletionResult } from "./complete.js";
import type { WorktreeOps } from "./driver.js";

export type SpikeVerdict = "kill" | "promote";

/** Runs the spike experiment itself and decides kill vs promote. */
export type SpikeRunner = (task: Task) => Promise<{ verdict: SpikeVerdict; output?: string }>;

/**
 * Creates the follow-on execution-pipeline task when a spike is promoted.
 * Must set `provenance.spawned_from` to the spike task's id — that field
 * (BACK-638) is exactly what records this cross-pipeline derivation edge.
 */
export type PromoteToExecution = (spikeTask: Task) => Promise<void>;

/**
 * Builds the `WorktreeOps` the driver spawns for exploration `spike` tasks.
 *
 * `merge` is a no-op success (BACK-603 603.3's spike/evaluate step never
 * touches a git worktree branch — it's an in-place decision, not a code
 * change to merge); the only real work happens in `spawn`.
 */
export function makeExplorationWorktreeOps(runSpike: SpikeRunner, promote: PromoteToExecution): WorktreeOps {
	return {
		async spawn(task: Task): Promise<CompletionResult> {
			const { verdict, output } = await runSpike(task);
			if (verdict === "promote") {
				await promote(task);
			}
			// No dodResults: exploration spikes aren't gated by executable DoD
			// commands the way Basic tasks are — adjudicate() falls back to the
			// (empty-by-default) checkbox scan, which passes, so both kill and
			// promote outcomes reach the shared terminal "done" phase.
			return { success: true, output: `${verdict}${output ? `: ${output}` : ""}` };
		},
		async merge() {
			return { merged: true };
		},
	};
}

/**
 * A `PromoteToExecution` implementation backed by a real `TaskStore` +
 * task-creation callback — the shape a harness caller wires in.
 */
export function makeStorePromoter(
	createExecutionTask: (input: { title: string; spawned_from: string }) => Promise<Task>,
): PromoteToExecution {
	return async (spikeTask: Task) => {
		await createExecutionTask({
			title: `Promoted from spike: ${spikeTask.title}`,
			spawned_from: spikeTask.id,
		});
	};
}
