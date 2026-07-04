/**
 * engine scan — data-derived scan authority (BACK-615; introduced BACK-605.8 Phase B, renamed from `engine watch`).
 *
 * Reuses Interpreter.scan's actionable-task predicate (pipeline_id/phase →
 * machine-actor state, driven by pipeline data, not a hardcoded status string)
 * to find actionable tasks and emit ONE minimal machine line per task:
 * "<prefix>:<task_id>" (e.g. "basic-ready:BACK-610").
 *
 * It does NOT render instruction templates — rendering + the `---EVENT---`
 * transport protocol are the scan-loop.js daemon's single responsibility
 * (BACK-614: one renderer, not two). This module only reads board state and
 * prints machine lines; it never spawns a subprocess, never invokes an
 * in-session agent tool call, never imports a harness spawn primitive.
 */

import type { Task } from "../types/index.js";
import { Interpreter } from "./interpreter.js";
import { executionPipeline } from "./pipeline.js";

/** Phase → event-channel prefix (only "ready" is in scope; others reference-only). */
const PHASE_PREFIX: Record<string, string> = {
	ready: "basic-ready",
};

/**
 * Scan tasks for actionable (machine-actor) execution-pipeline items and return
 * one "<prefix>:<task_id>" line per task. Reuses Interpreter.scan for the
 * actionable predicate — no duplicate board-scanning logic, no rendering.
 */
export function scanReadyLines(tasks: Task[]): string[] {
	const interpreter = new Interpreter();
	// register only populates the pipeline map scan() reads; no handler runs.
	interpreter.register(executionPipeline, "ready", () => {});

	const lines: string[] = [];
	for (const event of interpreter.scan(tasks)) {
		// "item-ready: <pipeline_id>:<phase>:<task_id>"
		const rest = event.replace("item-ready: ", "");
		const firstColon = rest.indexOf(":");
		const secondColon = rest.indexOf(":", firstColon + 1);
		const pipelineId = rest.slice(0, firstColon);
		const phase = rest.slice(firstColon + 1, secondColon);
		const taskId = rest.slice(secondColon + 1);

		if (pipelineId !== executionPipeline.id) continue;
		const prefix = PHASE_PREFIX[phase];
		if (!prefix) continue; // out of scope (e.g. "decomposing" → epic, reference-only)
		lines.push(`${prefix}:${taskId}`);
	}
	return lines;
}
