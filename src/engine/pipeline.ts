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
