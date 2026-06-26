// A pipeline state is actionable if it maps to an item-ready event.
// The "needs-human" gate is non-actionable.
export interface PipelineState {
	name: string;
	actionable: boolean; // true → interpreter emits item-ready
}

export interface Pipeline {
	id: string;
	states: PipelineState[];
}

// The single execution pipeline
export const executionPipeline: Pipeline = {
	id: "execution",
	states: [
		{ name: "ready", actionable: true },
		{ name: "in-progress", actionable: false },
		{ name: "done", actionable: false },
		{ name: "needs-human", actionable: false },
	],
};
