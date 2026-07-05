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
import { label } from "../core/field-registry.js";
import type { CompletionResult } from "../engine/complete.js";
import type { DecomposeHandler } from "../engine/driver.js";
import type { Task } from "../types/index.js";
import { roleOf } from "../types/index.js";
import { type CochangeOverlap, findCochangeOverlaps, type GitLogPrimitive } from "./cochange.ts";

/** Primitive that actually runs a worker (real spawn or test double). Returns the
 *  worker's stdout in `output` so the engine can parse the proposed children. */
export type SpawnPrimitive = (brief: string, cwd: string) => Promise<CompletionResult>;

/** A child task proposed by the decomposer worker. */
export interface ProposedChild {
	title: string;
	description?: string;
	/** Files/modules this child is expected to touch (ADR-016 D1 orthogonality signal).
	 *  Best-effort and allowed to over-report; used only to compute sibling overlap. */
	touches?: string[];
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
		'[{"title": "First child title", "description": "what it delivers", "touches": ["path/a.ts"]}, {"title": "Second child title", "description": "..."}]',
		"```",
		'"touches" is optional: the files/modules you expect this child to touch. Best-effort — ',
		"over-reporting is fine. It is used only to flag possible overlap between siblings for a",
		"human to review; it never blocks decomposition.",
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
 * Create a DecomposeHandler backed by the given SpawnPrimitive and Core.
 *
 * The returned handler:
 *  1. Idempotency (board truth): if children (parent_id===epic.id) already exist, skip
 *     spawn and stabilise phase → awaiting-children.
 *  2. Otherwise spawn a worker (cwd=repoPath, no worktree) that proposes children as JSON.
 *  3. Engine creates each proposed child via createTaskFromInput with engine fields.
 *  4. Advance the epic's phase: >=1 child → awaiting-children; failure/no children → needs-human.
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
				await core.updateTask(
					{
						...current,
						phase: "awaiting-children",
						status: label(roleOf(current), "awaiting-children"),
					},
					false,
				);
			}
			return;
		}

		// 2. Worker only PROPOSES children (JSON); the engine creates them.
		const brief = buildDecomposeBrief(task);
		const result = await spawnPrimitive(brief, repoPath);
		const children = parseProposedChildren(result.output);

		if (!result.success || children.length === 0) {
			await core.updateTask({ ...task, phase: "needs-human", status: label(roleOf(task), "needs-human") }, false);
			return;
		}

		// 2b. Advisory-only orthogonality check (ADR-016 D1/D2/D4): flag declared touches
		//     overlap (D1) and historically-cochanging siblings (D2/D3) for human review.
		//     Never blocks decompose/dispatch.
		const overlaps = findTouchesOverlaps(children);
		const cochangeOverlaps = await findCochangeOverlaps(children, repoPath, {
			...(opts?.gitLog ? { gitLog: opts.gitLog } : {}),
			...(opts?.cochangeThreshold !== undefined ? { threshold: opts.cochangeThreshold } : {}),
		});

		// 3. Engine creates children with engine fields so the scan can see them.
		//    Children created by decompose are always primitive/leaf tasks.
		for (const child of children) {
			await core.createTaskFromInput(
				{
					title: child.title,
					...(child.description ? { description: child.description } : {}),
					pipeline_id: "execution",
					phase: "ready",
					status: label("primitive", "ready"),
					parent_id: task.id,
				},
				false,
			);
		}

		// 4. Explicit phase advance (ready → awaiting-children); awaiting-children actor=none
		//    so the engine stops driving the epic.
		await core.updateTask(
			{ ...task, phase: "awaiting-children", status: label(roleOf(task), "awaiting-children") },
			false,
		);

		// 5. Advisory orthogonality report (ADR-016 D4), written last so it isn't clobbered by
		//    the full-record phase-advance write above. Never blocks decompose/dispatch.
		if (overlaps.length > 0 || cochangeOverlaps.length > 0) {
			await core.updateTaskFromInput(
				task.id,
				{ appendImplementationNotes: [formatOverlapReport(overlaps, cochangeOverlaps)] },
				false,
			);
		}
	};
}
