/**
 * Pipeline shape tests (BACK-623).
 *
 * Asserts `authoringPipeline` mirrors workitem-lifecycle-state.puml's
 * Authoring lane: Draft/Refining are machine-actor states with no driver
 * wired yet, Backlog is the human-gated boundary `engine promote` reads.
 */

import { describe, expect, it } from "bun:test";
import { authoringPipeline, executionPipeline } from "../engine/pipeline.ts";

describe("authoringPipeline", () => {
	it("declares id 'authoring'", () => {
		expect(authoringPipeline.id).toBe("authoring");
	});

	it("declares draft and refining as actor:machine", () => {
		const draft = authoringPipeline.states.find((s) => s.name === "draft");
		const refining = authoringPipeline.states.find((s) => s.name === "refining");
		expect(draft?.actor).toBe("machine");
		expect(refining?.actor).toBe("machine");
	});

	it("declares backlog as actor:human", () => {
		const backlog = authoringPipeline.states.find((s) => s.name === "backlog");
		expect(backlog?.actor).toBe("human");
	});

	it("states appear in draft -> refining -> backlog order", () => {
		expect(authoringPipeline.states.map((s) => s.name)).toEqual(["draft", "refining", "backlog"]);
	});
});

describe("executionPipeline (sanity)", () => {
	it("declares id 'execution'", () => {
		expect(executionPipeline.id).toBe("execution");
	});
});
