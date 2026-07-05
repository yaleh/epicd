import {
	authoringPipeline,
	executionPipeline,
	explorationPipeline,
	type Pipeline,
	type PipelineState,
} from "../../engine/pipeline";
import type { ClaimState } from "./coordinator-claims";

// Browser-safe (no `node:fs`): imported directly by TaskList.tsx.

const ALL_PIPELINES: Pipeline[] = [executionPipeline, authoringPipeline, explorationPipeline];

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
