// A pipeline phase has an actor that determines who handles it.
// "machine" → interpreter emits item-ready; "human" → awaiting human; "none" → terminal/waiting
export interface PipelineState {
	name: string;
	actor: "machine" | "human" | "none"; // machine → interpreter emits item-ready
}

export interface Pipeline {
	id: string;
	states: PipelineState[];
}

// The single execution pipeline (four-axis model)
export const executionPipeline: Pipeline = {
	id: "execution",
	states: [
		{ name: "ready", actor: "machine" }, // ready/in-progress merged; machine picks up
		{ name: "decomposing", actor: "machine" },
		{ name: "awaiting-children", actor: "none" },
		{ name: "evaluating", actor: "machine" },
		// BACK-682: independent judgmental audit gate. A primitive whose DoD goes
		// green lands here (not directly on "done") — completeTask (complete.ts)
		// routes ENG-8's "done" verdict to "adjudicating" for this pipeline. It is
		// the ONLY phase allowed to write a retreat edge (see src/engine/retreat.ts);
		// every other phase's forward scan-predicate/actor semantics are unchanged.
		{ name: "adjudicating", actor: "machine" },
		{ name: "needs-human", actor: "human" },
		{ name: "done", actor: "none" },
	],
};

// The authoring pipeline (workitem-lifecycle-state.puml Authoring lane).
// Draft/Refining have no driver wired yet (out of scope until E7/BACK-608);
// Backlog is the human-gated boundary `engine promote` reads from.
export const authoringPipeline: Pipeline = {
	id: "authoring",
	states: [
		{ name: "draft", actor: "machine" },
		{ name: "refining", actor: "machine" },
		{ name: "backlog", actor: "human" },
	],
};

/**
 * The exploration pipeline (BACK-603 603.3): spike → done, a second
 * `Pipeline` value declared purely as data, same shape/style as
 * `executionPipeline`/`authoringPipeline` above. Registering it with the
 * generic `Driver`/`Interpreter` (both pipeline-agnostic, see AC#3) is enough
 * to drive it — no interpreter/driver/complete/adjudicate edit required.
 *
 * `spike` is the single machine-actor phase: the injected `WorktreeOps.spawn`
 * (see `exploration-handlers.ts`) both runs the spike AND makes the
 * kill-vs-promote call, because the shared primitive path
 * (`Driver` → `completeTask` → `adjudicate`) only understands two terminal
 * verdicts ("done" | "needs-human") — those are the two literal phase names
 * `adjudicate.ts`/`complete.ts` already know about for every pipeline. Adding
 * a third pipeline-specific terminal phase name (e.g. "killed"/"promoted")
 * would mean teaching core about an exploration-specific vocabulary — the
 * exact coupling AC#3 forbids. The kill/promote distinction is instead a pure
 * data+handler-level decision: on promote, the handler spawns a new
 * execution-pipeline task carrying `provenance.spawned_from` (BACK-638); on
 * kill, it spawns nothing. Both outcomes still adjudicate to this pipeline's
 * own terminal "done".
 */
export const explorationPipeline: Pipeline = {
	id: "exploration",
	states: [
		{ name: "spike", actor: "machine" },
		{ name: "done", actor: "none" },
	],
};

/** All declared pipelines — the single source of truth other modules (CLI/backfill/web) resolve against. */
export const ALL_PIPELINES: Pipeline[] = [executionPipeline, authoringPipeline, explorationPipeline];

/** Looks up a pipeline by its id, or `undefined` if unknown. */
export function pipelineById(id: string | undefined): Pipeline | undefined {
	return ALL_PIPELINES.find((p) => p.id === id);
}

/** True when `phase` is a declared state of the pipeline identified by `pipelineId`. */
export function isLegalPhase(pipelineId: string | undefined, phase: string | undefined): boolean {
	if (!phase) return false;
	return pipelineById(pipelineId)?.states.some((s) => s.name === phase) ?? false;
}

/** Throws a clear error naming the pipeline, the offending phase, and the pipeline's legal states. */
export function assertLegalPhase(pipelineId: string | undefined, phase: string | undefined): void {
	if (isLegalPhase(pipelineId, phase)) return;
	const pipeline = pipelineById(pipelineId);
	const legalStates = pipeline ? pipeline.states.map((s) => s.name).join(", ") : "(unknown pipeline)";
	throw new Error(`Illegal phase "${phase}" for pipeline "${pipelineId}": legal phases are [${legalStates}]`);
}
