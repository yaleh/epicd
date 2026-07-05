import { describe, expect, it } from "bun:test";
import { computeDriverIndicator, getPhaseActor } from "./driver-indicator";

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
		expect(getPhaseActor("execution", "ready")).toBe("machine");
		expect(getPhaseActor("execution", "needs-human")).toBe("human");
		expect(getPhaseActor("execution", "done")).toBe("none");
	});

	it("looks up actor from the authoring pipeline by phase name", () => {
		expect(getPhaseActor("authoring", "backlog")).toBe("human");
		expect(getPhaseActor("authoring", "draft")).toBe("machine");
	});

	it("looks up actor from the exploration pipeline by phase name", () => {
		expect(getPhaseActor("exploration", "spike")).toBe("machine");
		expect(getPhaseActor("exploration", "done")).toBe("none");
	});

	it("returns undefined for unknown pipeline_id or phase, or missing inputs", () => {
		expect(getPhaseActor("unknown-pipeline", "ready")).toBeUndefined();
		expect(getPhaseActor("execution", "unknown-phase")).toBeUndefined();
		expect(getPhaseActor(undefined, "ready")).toBeUndefined();
		expect(getPhaseActor("execution", undefined)).toBeUndefined();
	});
});
