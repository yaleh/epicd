import { describe, expect, it } from "bun:test";
import { computeApprovePhase, computeDriverIndicator, ESCALATE_TRANSITION, getPhaseActor } from "./driver-indicator";

describe("computeDriverIndicator", () => {
	// The (actor x claim) truth table from BACK-645:
	//  - actor=human            -> "human-gate", regardless of claim
	//  - actor=machine, claimed -> "agent-active"
	//  - actor=machine, stale   -> "stale"
	//  - actor=machine, unclaimed -> "queued"
	//  - actor=none (or unknown)  -> null (no indicator)
	it("actor=human -> human-gate regardless of claim state", () => {
		expect(computeDriverIndicator("human", "claimed")).toBe("human-gate");
		expect(computeDriverIndicator("human", "unclaimed")).toBe("human-gate");
		expect(computeDriverIndicator("human", "stale")).toBe("human-gate");
	});

	it("actor=machine, claimed -> agent-active", () => {
		expect(computeDriverIndicator("machine", "claimed")).toBe("agent-active");
	});

	it("actor=machine, stale -> stale", () => {
		expect(computeDriverIndicator("machine", "stale")).toBe("stale");
	});

	it("actor=machine, unclaimed -> queued", () => {
		expect(computeDriverIndicator("machine", "unclaimed")).toBe("queued");
	});

	it("actor=none -> no indicator, regardless of claim state", () => {
		expect(computeDriverIndicator("none", "claimed")).toBeNull();
		expect(computeDriverIndicator("none", "unclaimed")).toBeNull();
		expect(computeDriverIndicator("none", "stale")).toBeNull();
	});

	it("unknown/undefined actor -> no indicator", () => {
		expect(computeDriverIndicator(undefined, "claimed")).toBeNull();
		expect(computeDriverIndicator(undefined, "unclaimed")).toBeNull();
	});
});

describe("getPhaseActor", () => {
	it("looks up actor from the execution pipeline by phase name", () => {
		expect(getPhaseActor("execution", "implementing")).toBe("machine");
		expect(getPhaseActor("execution", "needs-human")).toBe("human");
		expect(getPhaseActor("execution", "done")).toBe("none");
	});

	it("looks up actor from the authoring pipeline by phase name", () => {
		expect(getPhaseActor("authoring", "backlog")).toBe("human");
		expect(getPhaseActor("authoring", "drafting")).toBe("machine");
	});

	it("looks up actor from the exploration pipeline by phase name", () => {
		expect(getPhaseActor("exploration", "spiking")).toBe("machine");
		expect(getPhaseActor("exploration", "done")).toBe("none");
	});

	it("returns undefined for unknown pipeline_id or phase, or missing inputs", () => {
		expect(getPhaseActor("unknown-pipeline", "implementing")).toBeUndefined();
		expect(getPhaseActor("execution", "unknown-phase")).toBeUndefined();
		expect(getPhaseActor(undefined, "implementing")).toBeUndefined();
		expect(getPhaseActor("execution", undefined)).toBeUndefined();
	});
});

describe("computeApprovePhase (BACK-646 604.3 inline gate-review: approve)", () => {
	it("execution/needs-human wraps to 'implementing' (last human phase before terminal 'done', no machine phase forward)", () => {
		expect(computeApprovePhase("execution", "needs-human")).toBe("implementing");
	});

	it("authoring/backlog (last state, no machine phase forward) wraps to 'drafting'", () => {
		expect(computeApprovePhase("authoring", "backlog")).toBe("drafting");
	});

	it("finds the next machine-actor phase forward without wrapping when one exists", () => {
		// execution: awaiting-children(none) -> adjudicating(machine) — BACK-686.3 collapse
		expect(computeApprovePhase("execution", "awaiting-children")).toBe("adjudicating");
	});

	it("returns null for unknown pipeline_id, unknown phase, or missing inputs", () => {
		expect(computeApprovePhase("unknown-pipeline", "needs-human")).toBeNull();
		expect(computeApprovePhase("execution", "unknown-phase")).toBeNull();
		expect(computeApprovePhase(undefined, "needs-human")).toBeNull();
		expect(computeApprovePhase("execution", undefined)).toBeNull();
	});

	it("wraps back to the pipeline's single machine phase when advancing from its terminal state", () => {
		// exploration: spiking(machine) -> done(none) — no machine phase forward, wraps to "spiking".
		expect(computeApprovePhase("exploration", "done")).toBe("spiking");
	});
});

describe("ESCALATE_TRANSITION (BACK-646 604.3 inline gate-review: escalate)", () => {
	it("is the fixed execution/needs-human target regardless of the row's current pipeline/phase", () => {
		expect(ESCALATE_TRANSITION).toEqual({ pipeline_id: "execution", phase: "needs-human" });
	});
});
