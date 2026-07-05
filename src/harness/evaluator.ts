/**
 * Epic evaluation harness (BACK-628.4): the compound-phase counterpart to
 * harness/decomposer.ts. Two data-derived steps, both keyed off `parent_id`/`phase`
 * (never a status string — BACK-622's desync class):
 *
 *  1. `advanceAwaitingChildrenToEvaluating` — an epic sitting in `awaiting-children`
 *     (actor: none, so `Interpreter.scan` never surfaces it) whose children are ALL
 *     terminal (`done` or `needs-human`) is advanced to `evaluating` (actor: machine),
 *     replacing scan-loop.cjs's legacy `scanEvalDueEpics` status-string predicate.
 *     Once in `evaluating`, the epic is picked up by the SAME generic
 *     `Interpreter.scan` machinery `decomposing`/`ready` already use — no special-casing
 *     needed in engine/scan.ts beyond the PHASE_PREFIX entry.
 *  2. `evaluateEpic` — the epic-eval-due dispatch handler: aggregates children terminal
 *     states into the epic's own terminal phase (any child needs-human → epic
 *     needs-human; all done → epic done).
 */

import type { Core } from "../core/backlog.js";
import type { Task } from "../types/index.js";

const TERMINAL_PHASES = new Set(["done", "needs-human"]);

function childrenOf(tasks: Task[], parentId: string): Task[] {
	return tasks.filter((t) => t.parent_id === parentId);
}

/**
 * Scan all tasks for epics in `awaiting-children` whose children are all terminal, and
 * advance each to `evaluating`. Returns the ids advanced. Read via one `queryTasks({})`
 * call up front so children-terminal checks are consistent within a single scan pass.
 */
export async function advanceAwaitingChildrenToEvaluating(core: Core): Promise<string[]> {
	const tasks = await core.queryTasks({});
	const advanced: string[] = [];

	for (const task of tasks) {
		if (task.pipeline_id !== "execution" || task.phase !== "awaiting-children") continue;
		const children = childrenOf(tasks, task.id);
		if (children.length === 0) continue;
		if (!children.every((c) => c.phase !== undefined && TERMINAL_PHASES.has(c.phase))) continue;

		await core.updateTask({ ...task, phase: "evaluating" }, false);
		advanced.push(task.id);
	}

	return advanced;
}

/**
 * Evaluate an epic currently in `evaluating`: aggregate its children's terminal phases
 * into the epic's own terminal phase. Any child `needs-human` → epic `needs-human`;
 * otherwise (all children `done`) → epic `done`.
 */
export async function evaluateEpic(core: Core, epicId: string): Promise<void> {
	const task = await core.getTask(epicId);
	if (!task) {
		throw new Error(`Task not found: ${epicId}`);
	}

	const children = (await core.queryTasks({})).filter((t) => t.parent_id === epicId);
	const anyNeedsHuman = children.some((c) => c.phase === "needs-human");
	const verdict = anyNeedsHuman ? "needs-human" : "done";

	await core.updateTask({ ...task, phase: verdict }, false);
}
