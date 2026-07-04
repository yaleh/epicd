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
