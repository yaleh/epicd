/**
 * Pipeline shape tests (BACK-623).
 *
 * Asserts `authoringPipeline` mirrors workitem-lifecycle-state.puml's
 * Authoring lane: Draft/Refining are machine-actor states with no driver
 * wired yet, Backlog is the human-gated boundary `engine promote` reads.
 */

import { describe, expect, it } from "bun:test";
import {
	ALL_PIPELINES,
	assertLegalPhase,
	authoringPipeline,
	executionPipeline,
	isLegalPhase,
	pipelineById,
} from "../engine/pipeline.ts";

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

describe("pipelineById / isLegalPhase", () => {
	it("pipelineById resolves each declared pipeline by id", () => {
		expect(pipelineById("execution")?.id).toBe("execution");
		expect(pipelineById("authoring")?.id).toBe("authoring");
		expect(pipelineById("exploration")?.id).toBe("exploration");
		expect(pipelineById("nope")).toBeUndefined();
	});

	it("isLegalPhase accepts a declared state of its pipeline", () => {
		expect(isLegalPhase("authoring", "draft")).toBe(true);
		expect(isLegalPhase("execution", "needs-human")).toBe(true);
		expect(isLegalPhase("exploration", "spike")).toBe(true);
	});

	it("isLegalPhase rejects a phase not declared by that pipeline", () => {
		expect(isLegalPhase("execution", "proposal")).toBe(false);
		expect(isLegalPhase("authoring", "ready")).toBe(false);
		expect(isLegalPhase("execution", "in-progress")).toBe(false);
	});

	it("isLegalPhase rejects unknown pipeline id or blank phase", () => {
		expect(isLegalPhase("nope", "draft")).toBe(false);
		expect(isLegalPhase("execution", "")).toBe(false);
		expect(isLegalPhase("execution", undefined)).toBe(false);
	});

	it("assertLegalPhase throws a message naming pipeline, phase and legal states", () => {
		expect(() => assertLegalPhase("execution", "proposal")).toThrow(/execution/);
		expect(() => assertLegalPhase("execution", "proposal")).toThrow(/proposal/);
	});

	it("ALL_PIPELINES lists exactly the three declared pipelines", () => {
		expect(ALL_PIPELINES.map((p) => p.id).sort()).toEqual(["authoring", "execution", "exploration"]);
	});
});
