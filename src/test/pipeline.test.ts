/**
 * Pipeline shape tests (BACK-623; renamed BACK-686.3).
 *
 * Asserts `authoringPipeline` mirrors workitem-lifecycle-state.puml's
 * Authoring lane: Drafting/Refining are machine-actor states with no driver
 * wired yet, Backlog is the human-gated boundary `engine promote` reads.
 *
 * BACK-686.3: `ready`/`decomposing` unify into `implementing`; `evaluating` retires
 * entirely (folded into the `adjudicating` gate); `draft`→`drafting`,
 * `spike`→`spiking`. `executionPipeline` now declares exactly 5 states (AC#10).
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	ALL_PIPELINES,
	assertLegalPhase,
	authoringPipeline,
	executionPipeline,
	explorationPipeline,
	isLegalPhase,
	pipelineById,
} from "../engine/pipeline.ts";

describe("authoringPipeline", () => {
	it("declares id 'authoring'", () => {
		expect(authoringPipeline.id).toBe("authoring");
	});

	it("declares drafting and refining as actor:machine", () => {
		const drafting = authoringPipeline.states.find((s) => s.name === "drafting");
		const refining = authoringPipeline.states.find((s) => s.name === "refining");
		expect(drafting?.actor).toBe("machine");
		expect(refining?.actor).toBe("machine");
	});

	it("declares backlog as actor:human", () => {
		const backlog = authoringPipeline.states.find((s) => s.name === "backlog");
		expect(backlog?.actor).toBe("human");
	});

	it("states appear in drafting -> refining -> backlog order", () => {
		expect(authoringPipeline.states.map((s) => s.name)).toEqual(["drafting", "refining", "backlog"]);
	});

	it("no longer declares the retired 'draft' name", () => {
		expect(authoringPipeline.states.some((s) => s.name === "draft")).toBe(false);
	});
});

describe("explorationPipeline", () => {
	it("declares spiking (not spike) and done", () => {
		expect(explorationPipeline.states.map((s) => s.name)).toEqual(["spiking", "done"]);
	});
});

describe("executionPipeline", () => {
	it("declares id 'execution'", () => {
		expect(executionPipeline.id).toBe("execution");
	});

	it("declares exactly 5 states: implementing, awaiting-children, adjudicating, needs-human, done (AC#10)", () => {
		expect(executionPipeline.states.map((s) => s.name)).toEqual([
			"implementing",
			"awaiting-children",
			"adjudicating",
			"needs-human",
			"done",
		]);
	});

	it("no longer declares the retired 'ready'/'decomposing'/'evaluating' names", () => {
		const names = executionPipeline.states.map((s) => s.name);
		expect(names).not.toContain("ready");
		expect(names).not.toContain("decomposing");
		expect(names).not.toContain("evaluating");
	});

	it("grep -r '\"ready\"' src/engine/pipeline.ts returns empty (AC#1)", () => {
		const source = readFileSync(join(import.meta.dir, "..", "engine", "pipeline.ts"), "utf8");
		expect(source).not.toMatch(/"ready"/);
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
		expect(isLegalPhase("authoring", "drafting")).toBe(true);
		expect(isLegalPhase("execution", "needs-human")).toBe(true);
		expect(isLegalPhase("execution", "implementing")).toBe(true);
		expect(isLegalPhase("exploration", "spiking")).toBe(true);
	});

	it("isLegalPhase rejects a phase not declared by that pipeline", () => {
		expect(isLegalPhase("execution", "proposal")).toBe(false);
		expect(isLegalPhase("authoring", "ready")).toBe(false);
		expect(isLegalPhase("execution", "in-progress")).toBe(false);
		expect(isLegalPhase("execution", "ready")).toBe(false);
		expect(isLegalPhase("execution", "decomposing")).toBe(false);
		expect(isLegalPhase("execution", "evaluating")).toBe(false);
		expect(isLegalPhase("authoring", "draft")).toBe(false);
		expect(isLegalPhase("exploration", "spike")).toBe(false);
	});

	it("isLegalPhase rejects unknown pipeline id or blank phase", () => {
		expect(isLegalPhase("nope", "drafting")).toBe(false);
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
