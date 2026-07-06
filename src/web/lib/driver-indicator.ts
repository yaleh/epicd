import { ALL_PIPELINES, type PipelineState } from "../../engine/pipeline";
import type { ClaimState } from "./coordinator-claims";

// Browser-safe (no `node:fs`): imported directly by TaskList.tsx.

/** All declared pipelines, re-exported so other web-lib modules (status-label.ts) don't redeclare this list. */
export { ALL_PIPELINES };

/** Looks up a phase's `actor` against the pipeline it belongs to (data lookup, not a per-task field). */
export function getPhaseActor(
	pipelineId: string | undefined,
	phase: string | undefined,
): PipelineState["actor"] | undefined {
	if (!pipelineId || !phase) return undefined;
	const pipeline = ALL_PIPELINES.find((p) => p.id === pipelineId);
	const state = pipeline?.states.find((s) => s.name === phase);
	return state?.actor;
}

export type DriverIndicator = "human-gate" | "agent-active" | "queued" | "stale";

/**
 * Derives the per-row driver indicator by joining `actor(phase)` with the
 * Coordinator claim state (BACK-604 §AC#2 / BACK-645 truth table):
 *  - actor=human            -> "human-gate", regardless of claim
 *  - actor=machine, claimed -> "agent-active"
 *  - actor=machine, stale   -> "stale"
 *  - actor=machine, unclaimed -> "queued"
 *  - actor=none (or unknown) -> no indicator (terminal/inert phase)
 */
export function computeDriverIndicator(
	actor: PipelineState["actor"] | undefined,
	claimState: ClaimState,
): DriverIndicator | null {
	if (actor === "human") return "human-gate";
	if (actor !== "machine") return null;
	if (claimState === "claimed") return "agent-active";
	if (claimState === "stale") return "stale";
	return "queued";
}

export const DRIVER_INDICATOR_ICON: Record<DriverIndicator, string> = {
	"human-gate": "👤",
	"agent-active": "🤖",
	queued: "⏳",
	stale: "⚠️",
};

export const DRIVER_INDICATOR_LABEL: Record<DriverIndicator, string> = {
	"human-gate": "Waiting on a human",
	"agent-active": "Claude Code actively working",
	queued: "Queued, waiting to be picked up",
	stale: "Stale: claimed but no recent activity",
};

/**
 * Inline gate-review actions (BACK-646 604.3 AC#3): what phase to write back for a
 * human-gate row when a human clicks approve/reject/escalate. Best-effort, data-driven
 * off `executionPipeline`/`authoringPipeline`/`explorationPipeline` — no invented phase
 * names. `reject` isn't a phase transition; it uses the existing task-archive mechanism
 * (see TaskList.tsx / apiClient.archiveTask), so it has no entry here.
 */
export type GateAction = "approve" | "escalate";

/**
 * approve = "promote past the human gate": the next actor="machine" phase in the same
 * pipeline, searching forward from the current phase and wrapping around if none is
 * found forward (e.g. execution's "needs-human" is the last human phase before the
 * terminal "done", so approving it wraps to "ready" — requeue for another machine pass).
 * Returns null when the pipeline/phase is unknown or declares no machine-actor phase at all.
 */
export function computeApprovePhase(pipelineId: string | undefined, phase: string | undefined): string | null {
	if (!pipelineId || !phase) return null;
	const pipeline = ALL_PIPELINES.find((p) => p.id === pipelineId);
	if (!pipeline) return null;
	const idx = pipeline.states.findIndex((s) => s.name === phase);
	if (idx === -1) return null;

	const forward = pipeline.states.slice(idx + 1).find((s) => s.actor === "machine");
	if (forward) return forward.name;
	const wrapped = pipeline.states.slice(0, idx).find((s) => s.actor === "machine");
	return wrapped ? wrapped.name : null;
}

/**
 * escalate = force the task into the execution pipeline's "needs-human" phase, regardless
 * of which pipeline/human-phase it currently sits in (e.g. authoring's "backlog" gate can
 * escalate straight into execution's human queue). Fixed target: "needs-human" is the one
 * phase BACK-646's spec names explicitly, and it already exists in `executionPipeline.states`.
 */
export const ESCALATE_TRANSITION: { pipeline_id: string; phase: string } = {
	pipeline_id: "execution",
	phase: "needs-human",
};
