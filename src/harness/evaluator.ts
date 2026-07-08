/**
 * Epic evaluation harness (BACK-628.4): the compound-phase counterpart to
 * harness/decomposer.ts. Two data-derived steps, both keyed off `parent_id`/`phase`
 * (never a status string — BACK-622's desync class):
 *
 *  1. `advanceAwaitingChildrenToAdjudicating` — an epic sitting in `awaiting-children`
 *     (actor: none, so `Interpreter.scan` never surfaces it) whose children are ALL
 *     terminal (`done` or `needs-human`) is advanced to `adjudicating` (actor: machine),
 *     replacing scan-loop.cjs's legacy `scanEvalDueEpics` status-string predicate.
 *     BACK-686.2 (Phase D, AC#5): this used to target `evaluating`; the epic path is
 *     now `awaiting-children -> adjudicating(gate) -> done/needs-human`. BACK-686.3
 *     retires `evaluating` as a declared pipeline state entirely (it was already
 *     unreachable at runtime) — this module's IA+aggregation logic (`computeEpicVerdict`)
 *     lives on and is invoked directly by `gateAdjudicating` (`adjudicate-gate.ts`) for
 *     the epic path, and by the manual `engine evaluate` CLI debug command
 *     (`evaluateEpic`, below) — neither depends on `evaluating` being a legal phase.
 *     Once in `adjudicating`, the epic is picked up by the SAME generic
 *     `Interpreter.scan` machinery `implementing` already uses.
 *  2. `evaluateEpic` — the epic-eval-due dispatch handler. BACK-657.3 (ADR-019 gap fix):
 *     this used to ONLY aggregate children's terminal phases, never running the epic's
 *     own `## Integration Acceptance` — an epic could reach `done` with its own
 *     end-to-end acceptance never having run ("all children green but the assembled
 *     system doesn't actually work", the exact failure ADR-019 exists to prevent). Now
 *     it first extracts and spawns (via `runShellCommands`, `Bun.spawn` under the hood)
 *     every shell command in the epic Description's `## Integration Acceptance` fenced
 *     code blocks; only if ALL exit 0 does it proceed to aggregate children terminal
 *     states as before (any child needs-human → epic needs-human; all done → epic
 *     done). Any failing Integration Acceptance command routes the epic straight to
 *     `needs-human`, independent of children. An epic with no Integration Acceptance
 *     section declared has nothing to gate on and falls back to children-only
 *     aggregation, unchanged from before.
 */

import type { Core } from "../core/backlog.js";
import { extractSection } from "../markdown/parser.js";
import type { Task } from "../types/index.js";
import { runShellCommands } from "./dod-runner.js";

const TERMINAL_PHASES = new Set(["done", "needs-human"]);
const INTEGRATION_ACCEPTANCE_SECTION_TITLE = "Integration Acceptance";
const FENCED_CODE_BLOCK_RE = /```(?:[\w-]+)?\n([\s\S]*?)```/g;

function childrenOf(tasks: Task[], parentId: string): Task[] {
	return tasks.filter((t) => t.parent_id === parentId);
}

/**
 * Extract the shell commands to run for an epic's own Integration Acceptance: every
 * fenced code block found inside the Description's `## Integration Acceptance`
 * subsection, each run as one (possibly multi-line) shell script. Plain prose/inline
 * code list items outside a fence are documentation, not machine-executable gates —
 * an Integration Acceptance item that must be enforced needs a fenced shell block.
 * Returns `[]` when the epic has no such section (nothing to gate on).
 */
export function extractIntegrationAcceptanceCommands(description: string): string[] {
	const section = extractSection(description, INTEGRATION_ACCEPTANCE_SECTION_TITLE);
	if (!section) return [];

	const commands: string[] = [];
	for (const match of section.matchAll(FENCED_CODE_BLOCK_RE)) {
		const body = match[1]?.trim();
		if (body) commands.push(body);
	}
	return commands;
}

/**
 * Scan all tasks for epics in `awaiting-children` whose children are all terminal, and
 * advance each to `adjudicating` (BACK-686.2 Phase D, AC#5 — was `evaluating`; the gate
 * at `adjudicating` now folds in the same IA+aggregation logic via `gateAdjudicating`).
 * Returns the ids advanced. Read via one `queryTasks({})` call up front so
 * children-terminal checks are consistent within a single scan pass.
 */
export async function advanceAwaitingChildrenToAdjudicating(core: Core): Promise<string[]> {
	const tasks = await core.queryTasks({});
	const advanced: string[] = [];

	for (const task of tasks) {
		if (task.pipeline_id !== "execution" || task.phase !== "awaiting-children") continue;
		const children = childrenOf(tasks, task.id);
		if (children.length === 0) continue;
		if (!children.every((c) => c.phase !== undefined && TERMINAL_PHASES.has(c.phase))) continue;

		await core.updateTask({ ...task, phase: "adjudicating" }, false);
		advanced.push(task.id);
	}

	return advanced;
}

/**
 * Manually re-run an epic's IA+aggregation logic (debug/CLI entry point, `engine
 * evaluate`). BACK-657.3: first runs the epic's own `## Integration Acceptance` shell
 * commands (if the Description declares any) — any failing command routes the epic
 * straight to `needs-human`, never falling through to children aggregation. Only once
 * Integration Acceptance is all-green (or absent) does it aggregate children's
 * terminal phases into the epic's own terminal phase: any child `needs-human` → epic
 * `needs-human`; otherwise (all children `done`) → epic `done`.
 *
 * BACK-686.2: the actual verdict logic is factored into `computeEpicVerdict` below —
 * a pure-of-store function over `(task, children, repoRoot)` — so this `Core`-based
 * entry point and `gateAdjudicating`'s epic path (`src/engine/adjudicate-gate.ts`,
 * BACK-686.3) share exactly one implementation of the IA+aggregation logic. There is
 * no dedicated `evaluating` phase or dispatched skill any more — this function is a
 * manual/debug re-run, not something the engine dispatches to on its own.
 */
export async function evaluateEpic(core: Core, epicId: string): Promise<void> {
	const task = await core.getTask(epicId);
	if (!task) {
		throw new Error(`Task not found: ${epicId}`);
	}

	const children = (await core.queryTasks({})).filter((t) => t.parent_id === epicId);
	const verdict = await computeEpicVerdict(task, children, core.filesystem.rootDir);
	await core.updateTask({ ...task, phase: verdict }, false);
}

/**
 * The store-agnostic epic-verdict core (BACK-686.2): runs the epic's own
 * `## Integration Acceptance` shell commands (if any), then aggregates `children`'s
 * terminal phases. Any failing IA command, or any child `needs-human` → `needs-human`;
 * otherwise (IA green/absent AND all children `done`) → `done`. Takes `children`
 * directly (rather than querying a store itself) so a caller already holding an
 * in-memory task snapshot (e.g. `Driver.tick`) never needs a `Core`/`queryTasks` call.
 */
export async function computeEpicVerdict(
	task: Task,
	children: Task[],
	repoRoot: string,
): Promise<"done" | "needs-human"> {
	const iaCommands = extractIntegrationAcceptanceCommands(task.description ?? "");
	if (iaCommands.length > 0) {
		const iaResults = await runShellCommands(iaCommands, repoRoot);
		if (iaResults.some((r) => !r.passed)) return "needs-human";
	}

	const anyNeedsHuman = children.some((c) => c.phase === "needs-human");
	return anyNeedsHuman ? "needs-human" : "done";
}
