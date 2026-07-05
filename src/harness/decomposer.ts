/**
 * Decomposer harness — builds a DecomposeHandler that spawns a real worker to
 * PROPOSE child tasks for a compound (epic) task, then has the ENGINE create them.
 *
 * Design (architect-reviewed, BACK-605.5 D1/D2/D3):
 *  - No worktree: decompose runs directly in the repo root (children are main-board artifacts).
 *  - Engine core (src/engine) never imports this; it is injected via the Driver's
 *    decompose parameter (this module lives in harness and may use Core).
 *  - The worker only *proposes* children as a JSON array; the ENGINE creates them via
 *    `core.createTaskFromInput` with engine fields (pipeline_id/phase/parent_id) so the
 *    engine scan (run.ts filters pipeline_id==='execution') can see them. The worker never
 *    runs `backlog task create` (there are no --pipeline-id/--phase CLI flags).
 *  - Idempotency reads BOARD TRUTH (queryTasks filtered by engine `parent_id`), NOT
 *    `task.subtasks` — the driver's `core.getTask` never populates `subtasks`, and children
 *    carry the engine `parent_id`, not the kanban `parentTaskId`.
 *  - Phase transition: success (>=1 child created) → awaiting-children; failure / no
 *    children proposed → needs-human. Set explicitly (ready → awaiting-children); not via
 *    complete() (which only advances one state).
 *  - ADR-016 orthogonality check: children may declare `touches` (files/modules); overlapping
 *    siblings (D1, declared) and historically-cochanging siblings (D2/D3, cochange.ts) get an
 *    advisory report appended to the epic's implementationNotes. Advisory only — never blocks
 *    decompose/dispatch — and written last so the full-record phase-advance write doesn't
 *    clobber it.
 */

import type { Core } from "../core/backlog.js";
import type { CompletionResult } from "../engine/complete.js";
import type { DecomposeHandler } from "../engine/driver.js";
import type { Task } from "../types/index.js";
import { type CochangeOverlap, findCochangeOverlaps, type GitLogPrimitive } from "./cochange.ts";

/** Primitive that actually runs a worker (real spawn or test double). Returns the
 *  worker's stdout in `output` so the engine can parse the proposed children. */
export type SpawnPrimitive = (brief: string, cwd: string) => Promise<CompletionResult>;

/**
 * Single source of truth for the standard structured DoD gates a decompose-created
 * child gets when its proposal doesn't declare its own `dodGates` (BACK-649). Reused
 * both in the brief sent to the decompose worker (buildDecomposeBrief) and as the
 * fallback in applyProposedChildren, so the two can never drift apart. Mirrors this
 * project's prose Definition of Done defaults (tsc/check/test), but expressed as
 * literally runnable shell commands — dod-runner.ts's runDoD shells these out verbatim.
 */
export const DEFAULT_CHILD_DOD_GATES: readonly string[] = [
	"bunx tsc --noEmit",
	"bun run check .",
	"bun test --parallel",
];

/** A child task proposed by the decomposer worker. */
export interface ProposedChild {
	title: string;
	description?: string;
	/** Files/modules this child is expected to touch (ADR-016 D1 orthogonality signal).
	 *  Best-effort and allowed to over-report; used only to compute sibling overlap. */
	touches?: string[];
	/** Structured executable DoD gates (BACK-613) for this child. Optional — if omitted,
	 *  the child falls back to DEFAULT_CHILD_DOD_GATES (BACK-649) so it is never created
	 *  ungated. Declaring gates here lets a child request different/additional commands
	 *  (e.g. a scoped test file) than the defaults. */
	dodGates?: string[];
}

/** One pair of sibling children whose declared `touches` intersect (ADR-016 D1). */
interface TouchesOverlap {
	a: string;
	b: string;
	files: string[];
}

/**
 * Pairwise `touches` intersection across all proposed children (ADR-016 D1): plain set
 * intersection, no globbing/normalization. Returns one entry per non-empty overlap.
 */
export function findTouchesOverlaps(children: ProposedChild[]): TouchesOverlap[] {
	const overlaps: TouchesOverlap[] = [];
	for (const [i, childA] of children.entries()) {
		if (!childA.touches || childA.touches.length === 0) continue;
		const setA = new Set(childA.touches);
		for (const childB of children.slice(i + 1)) {
			if (!childB.touches || childB.touches.length === 0) continue;
			const files = childB.touches.filter((f) => setA.has(f));
			if (files.length > 0) {
				overlaps.push({ a: childA.title, b: childB.title, files });
			}
		}
	}
	return overlaps;
}

/**
 * Render the ADR-016 D4 advisory report for declared overlaps (D1) and historical cochange
 * overlaps (D2/D3). Non-blocking: attached to the epic's implementationNotes, never gates
 * decompose/dispatch.
 */
function formatOverlapReport(overlaps: TouchesOverlap[], cochangeOverlaps: CochangeOverlap[]): string {
	const lines = ["[ADR-016 分解正交性检查] advisory，不阻塞分解/dispatch："];
	for (const overlap of overlaps) {
		lines.push(`- 声明式重叠 "${overlap.a}" ∩ "${overlap.b}": ${overlap.files.join(", ")}`);
	}
	for (const overlap of cochangeOverlaps) {
		lines.push(
			`- 历史强耦合 "${overlap.a}" ↔ "${overlap.b}": ${overlap.files.join(" , ")}（共变 ${overlap.count} 次）`,
		);
	}
	return lines.join("\n");
}

/**
 * Parse the worker's stdout into a list of proposed children.
 *
 * The worker is instructed to emit a JSON array `[{title, description?}]` as the last
 * thing in its output. Tolerant: extracts the outermost `[...]` and parses it; returns
 * `[]` on any failure (→ caller routes the epic to needs-human).
 */
export function parseProposedChildren(output: string | undefined): ProposedChild[] {
	if (!output) return [];
	const start = output.indexOf("[");
	const end = output.lastIndexOf("]");
	if (start === -1 || end === -1 || end < start) return [];
	try {
		const parsed = JSON.parse(output.slice(start, end + 1));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((c) => c && typeof c.title === "string" && c.title.trim().length > 0)
			.map((c) => ({
				title: String(c.title).trim(),
				...(typeof c.description === "string" ? { description: c.description } : {}),
				...(Array.isArray(c.touches) && c.touches.every((t: unknown) => typeof t === "string")
					? { touches: c.touches as string[] }
					: {}),
				...(Array.isArray(c.dodGates) && c.dodGates.every((t: unknown) => typeof t === "string")
					? { dodGates: c.dodGates as string[] }
					: {}),
			}));
	} catch {
		return [];
	}
}

/**
 * Build the brief text passed to the decomposer worker. The worker PROPOSES children;
 * it must NOT create them (the engine does that).
 */
function buildDecomposeBrief(task: Task): string {
	const lines: string[] = [];
	lines.push(`# Decompose Epic: ${task.id} — ${task.title}`);
	lines.push("", "## Your Mission");
	lines.push(
		"Read the Sub-Task Decomposition section in the implementation plan below and PROPOSE",
		"the child tasks. Do NOT create them yourself — the engine creates them from your output.",
	);
	lines.push("", "## Output format (REQUIRED)");
	lines.push(
		"Emit ONLY a JSON array of children as the last thing in your output:",
		"```json",
		`[{"title": "First child title", "description": "what it delivers", "touches": ["path/a.ts"], "dodGates": [${DEFAULT_CHILD_DOD_GATES.map((g) => `"${g}"`).join(", ")}, "bun test <scoped test file>"]}, {"title": "Second child title", "description": "..."}]`,
		"```",
		'"touches" is optional: the files/modules you expect this child to touch. Best-effort — ',
		"over-reporting is fine. It is used only to flag possible overlap between siblings for a",
		"human to review; it never blocks decomposition.",
		'"dodGates" is optional: structured shell commands re-run verbatim by `engine complete`',
		"to adjudicate done vs needs-human (BACK-613/634). If omitted, the child falls back to",
		`the project's standard gates (${DEFAULT_CHILD_DOD_GATES.join(", ")}; BACK-649) — so add`,
		"dodGates explicitly only when this child needs different or additional commands (e.g. a",
		"scoped test file).",
	);
	if (task.implementationPlan) {
		lines.push("", "## Implementation Plan (source of child tasks)", task.implementationPlan);
	}
	if (task.description) {
		lines.push("", "## Description", task.description);
	}
	return lines.join("\n");
}

/**
 * Apply a list of already-proposed children to an epic: create each as a primitive
 * execution-pipeline task, advance the epic's phase, and attach the ADR-016 advisory
 * overlap report. Shared by `makeDecomposer` (in-process Driver path, worker proposes
 * then this applies) and the standalone `engine decompose-apply` CLI command (BACK-628.4:
 * an out-of-process Monitor session proposes children, then invokes this via the CLI —
 * no in-process spawn seam required for the unattended epic-ready path).
 *
 * children.length === 0 routes the epic to needs-human instead of creating anything.
 */
export async function applyProposedChildren(
	core: Core,
	task: Task,
	children: ProposedChild[],
	repoPath = ".",
	opts?: { gitLog?: GitLogPrimitive; cochangeThreshold?: number },
): Promise<void> {
	if (children.length === 0) {
		await core.updateTask({ ...task, phase: "needs-human" }, false);
		return;
	}

	// Advisory-only orthogonality check (ADR-016 D1/D2/D4): flag declared touches overlap
	// (D1) and historically-cochanging siblings (D2/D3) for human review. Never blocks
	// decompose/dispatch.
	const overlaps = findTouchesOverlaps(children);
	const cochangeOverlaps = await findCochangeOverlaps(children, repoPath, {
		...(opts?.gitLog ? { gitLog: opts.gitLog } : {}),
		...(opts?.cochangeThreshold !== undefined ? { threshold: opts.cochangeThreshold } : {}),
	});

	// Engine creates children with engine fields so the scan can see them. Children
	// created by decompose are always primitive/leaf tasks.
	for (const child of children) {
		// BACK-649: a proposal that omits dodGates still gets the project's standard
		// structured gates (DEFAULT_CHILD_DOD_GATES) — otherwise the child's task.dod is
		// empty, runDoD returns [], and engine complete always routes it to needs-human
		// regardless of whether the implementation is correct. The worker may still
		// override with its own dodGates (e.g. to add a scoped test file).
		const dodGates = child.dodGates && child.dodGates.length > 0 ? child.dodGates : DEFAULT_CHILD_DOD_GATES;
		await core.createTaskFromInput(
			{
				title: child.title,
				...(child.description ? { description: child.description } : {}),
				dodGates: [...dodGates],
				pipeline_id: "execution",
				phase: "ready",
				parent_id: task.id,
			},
			false,
		);
	}

	// Explicit phase advance (ready/decomposing → awaiting-children); awaiting-children
	// actor=none so the engine stops driving the epic.
	await core.updateTask({ ...task, phase: "awaiting-children" }, false);

	// Advisory orthogonality report (ADR-016 D4), written last so it isn't clobbered by the
	// full-record phase-advance write above. Never blocks decompose/dispatch.
	if (overlaps.length > 0 || cochangeOverlaps.length > 0) {
		await core.updateTaskFromInput(
			task.id,
			{ appendImplementationNotes: [formatOverlapReport(overlaps, cochangeOverlaps)] },
			false,
		);
	}
}

/**
 * Create a DecomposeHandler backed by the given SpawnPrimitive and Core.
 *
 * The returned handler:
 *  1. Idempotency (board truth): if children (parent_id===epic.id) already exist, skip
 *     spawn and stabilise phase → awaiting-children.
 *  2. Otherwise spawn a worker (cwd=repoPath, no worktree) that proposes children as JSON.
 *  3-5. Delegates to applyProposedChildren (create children / advance phase / advisory report).
 */
export function makeDecomposer(
	spawnPrimitive: SpawnPrimitive,
	core: Core,
	opts?: { gitLog?: GitLogPrimitive; cochangeThreshold?: number },
): DecomposeHandler {
	return async (task: Task, repoPath = "."): Promise<void> => {
		// 1. Idempotency — read the live board, not task.subtasks (never populated on the
		//    driver path) and match the engine parent_id (not kanban parentTaskId).
		const existing = (await core.queryTasks({})).filter((t) => t.parent_id === task.id);
		if (existing.length > 0) {
			// Children already created (crash-recovery / re-entry). Stabilise the phase, but
			// only when it actually differs — re-writing the same value is a wasteful no-op.
			const current = await core.getTask(task.id);
			if (current && current.phase !== "awaiting-children") {
				await core.updateTask({ ...current, phase: "awaiting-children" }, false);
			}
			return;
		}

		// 2. Worker only PROPOSES children (JSON); the engine creates them.
		const brief = buildDecomposeBrief(task);
		const result = await spawnPrimitive(brief, repoPath);
		const children = parseProposedChildren(result.output);

		if (!result.success) {
			await core.updateTask({ ...task, phase: "needs-human" }, false);
			return;
		}

		await applyProposedChildren(core, task, children, repoPath, opts);
	};
}
