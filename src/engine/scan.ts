/**
 * engine scan — data-derived scan authority (BACK-615; introduced BACK-605.8 Phase B, renamed from `engine watch`).
 *
 * Reuses Interpreter.scan's actionable-task predicate (pipeline_id/phase →
 * machine-actor state, driven by pipeline data, not a hardcoded status string)
 * to find actionable tasks and emit ONE minimal machine line per task:
 * "<prefix>:<task_id>" (e.g. "basic-ready:BACK-610").
 *
 * It does NOT render instruction templates — rendering + the `---EVENT---`
 * transport protocol are the scan-loop.cjs daemon's single responsibility
 * (BACK-614: one renderer, not two). This module only reads board state and
 * prints machine lines; it never spawns a subprocess, never invokes an
 * in-session agent tool call, never imports a harness spawn primitive.
 */

import type { Task } from "../types/index.js";
import { Interpreter } from "./interpreter.js";
import { executionPipeline, type Pipeline } from "./pipeline.js";

/**
 * Phase → event-channel prefix, keyed by pipeline id (BACK-628.4: decomposing/
 * evaluating crystallized alongside ready; BACK-603: generalized from a single
 * hardcoded execution-only map into a per-pipeline-id table so a caller can add
 * another pipeline's channel prefixes as a data change here — no interpreter/core
 * edit required, AC#3). A pipeline with no entry still scans (Interpreter.scan is
 * pipeline-agnostic) but emits no machine line for its machine-actor phases.
 */
const DEFAULT_PHASE_PREFIXES: Record<string, Record<string, string>> = {
	[executionPipeline.id]: {
		ready: "basic-ready",
		decomposing: "epic-ready",
		evaluating: "epic-eval-due",
	},
};

/**
 * Scan tasks for actionable (machine-actor) items across the given pipelines and
 * return one "<prefix>:<task_id>" line per task. Reuses Interpreter.scan for the
 * actionable predicate — no duplicate board-scanning logic, no rendering.
 *
 * `pipelines` defaults to `[executionPipeline]` (today's sole caller shape is
 * unchanged); `phasePrefixes` defaults to `DEFAULT_PHASE_PREFIXES` (execution's
 * existing three channels). Both are data parameters — registering a new pipeline's
 * channels never requires editing this function's body.
 */
export function scanReadyLines(
	tasks: Task[],
	pipelines: Pipeline[] = [executionPipeline],
	phasePrefixes: Record<string, Record<string, string>> = DEFAULT_PHASE_PREFIXES,
): string[] {
	const interpreter = new Interpreter();
	// register only populates the pipeline map scan() reads; no handler runs.
	for (const pipeline of pipelines) {
		for (const state of pipeline.states) {
			if (state.actor !== "machine") continue;
			interpreter.register(pipeline, state.name, () => {});
		}
	}

	const lines: string[] = [];
	for (const event of interpreter.scan(tasks)) {
		// "item-ready: <pipeline_id>:<phase>:<task_id>"
		const rest = event.replace("item-ready: ", "");
		const firstColon = rest.indexOf(":");
		const secondColon = rest.indexOf(":", firstColon + 1);
		const pipelineId = rest.slice(0, firstColon);
		const phase = rest.slice(firstColon + 1, secondColon);
		const taskId = rest.slice(secondColon + 1);

		const prefix = phasePrefixes[pipelineId]?.[phase];
		if (!prefix) continue; // out of scope (no registered channel prefix for this pipeline/phase)
		lines.push(`${prefix}:${taskId}`);
	}
	return lines;
}
