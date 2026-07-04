/**
 * engine watch — data-derived emitter (BACK-605.8 Phase B).
 *
 * Reuses Interpreter.scan's actionable-task predicate (pipeline_id/phase →
 * machine-actor state, driven by pipeline data, not a hardcoded status
 * string) to find actionable tasks, then renders a per-task instruction
 * blob (port of baime scan-loop.js's renderEvent template substitution)
 * to stdout, followed by a `---EVENT---` delimiter line — matching
 * scan-loop.js's existing protocol so it can be consumed by the Monitor
 * skill (wired in a later phase, not here).
 *
 * CRITICAL: this module only reads board state and renders text. It never
 * spawns a subprocess, never invokes an in-session agent tool call, never
 * imports realSpawnPrimitive or any harness spawn primitive. That boundary
 * is what BACK-605.8 restores.
 */

import { existsSync, readFileSync } from "node:fs";
import type { Task } from "../types/index.js";
import { Interpreter } from "./interpreter.js";
import { executionPipeline } from "./pipeline.js";

export const EVENT_DELIMITER = "---EVENT---";

/** Phase → template name mapping (only "ready" is in scope; others are reference-only). */
const PHASE_TEMPLATES: Record<string, string> = {
	ready: "basic-ready",
};

/**
 * Render a task's ready-event template blob, substituting placeholders
 * the same way baime scan-loop.js's renderEvent does (__TASK_ID__,
 * __TASK_TITLE__). Falls back to a minimal "prefix:id" line if the
 * template file cannot be read (mirrors renderEvent's safe-degrade).
 */
export function renderEvent(templatePath: string, task: Task, prefix: string): string {
	try {
		const tmpl = readFileSync(templatePath, "utf8");
		return tmpl.replace(/__TASK_ID__/g, task.id).replace(/__TASK_TITLE__/g, task.title ?? "");
	} catch {
		return `${prefix}:${task.id}`;
	}
}

export interface WatchScanOptions {
	/** Directory containing event templates (e.g. basic-ready.md). */
	templatesDir?: string;
}

export interface WatchEvent {
	task: Task;
	phase: string;
	prefix: string;
	blob: string;
}

/**
 * Scan tasks for actionable (machine-actor) items in the execution pipeline
 * and render their event blobs. Reuses Interpreter.scan for the actionable
 * predicate — no duplicate board-scanning logic.
 */
export function scanForEvents(tasks: Task[], options: WatchScanOptions = {}): WatchEvent[] {
	const interpreter = new Interpreter();
	// register is only used here to populate the pipeline map that scan() reads;
	// no handler logic runs — dispatch() is never called by watch.
	interpreter.register(executionPipeline, "ready", () => {});

	const readyEvents = interpreter.scan(tasks);
	const events: WatchEvent[] = [];

	for (const event of readyEvents) {
		// "item-ready: <pipeline_id>:<phase>:<task_id>"
		const rest = event.replace("item-ready: ", "");
		const firstColon = rest.indexOf(":");
		const secondColon = rest.indexOf(":", firstColon + 1);
		const pipelineId = rest.slice(0, firstColon);
		const phase = rest.slice(firstColon + 1, secondColon);
		const taskId = rest.slice(secondColon + 1);

		if (pipelineId !== executionPipeline.id) continue;

		const prefix = PHASE_TEMPLATES[phase];
		if (!prefix) continue; // out of scope (e.g. "decomposing" → epic-ready, reference-only)

		const task = tasks.find((t) => t.id === taskId);
		if (!task) continue;

		const templatePath = options.templatesDir ? `${options.templatesDir}/${prefix}.md` : "";
		const blob =
			templatePath && existsSync(templatePath) ? renderEvent(templatePath, task, prefix) : `${prefix}:${task.id}`;

		events.push({ task, phase, prefix, blob });
	}

	return events;
}

/** Render a WatchEvent's blob + delimiter as it should appear on stdout. */
export function formatEventOutput(event: WatchEvent): string {
	return `${event.blob}\n${EVENT_DELIMITER}\n`;
}
