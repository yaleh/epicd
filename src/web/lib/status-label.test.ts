import { describe, expect, it } from "bun:test";
import { getStatusBadgeClass, label } from "./status-label";

describe("label(phase, actor) — converged status-badge color projection (BACK-646 604.3 AC#5)", () => {
	it("actor=human -> the human (amber) class, regardless of phase name", () => {
		expect(label("needs-human", "human")).toContain("amber");
		expect(label("backlog", "human")).toContain("amber");
	});

	it("actor=machine -> the machine (blue) class, regardless of phase name", () => {
		expect(label("ready", "machine")).toContain("blue");
		expect(label("decomposing", "machine")).toContain("blue");
	});

	it("actor=none and phase='done' -> the done (green) class", () => {
		expect(label("done", "none")).toContain("green");
	});

	it("actor=none and phase is not 'done' (e.g. an inert/waiting phase) -> the inert (gray) class", () => {
		expect(label("awaiting-children", "none")).toContain("gray");
	});

	it("unknown/undefined actor -> the inert (gray) class fallback", () => {
		expect(label("some-phase", undefined)).toContain("gray");
		expect(label(undefined, undefined)).toContain("gray");
	});
});

describe("getStatusBadgeClass — phase/pipeline-data-driven with legacy status-string fallback", () => {
	it("resolves color via pipeline-data when phase + pipeline_id are known", () => {
		expect(getStatusBadgeClass("Basic: Needs Human", "needs-human", "execution")).toContain("amber");
		expect(getStatusBadgeClass("Basic: Implementing", "implementing", "execution")).toContain("blue");
		expect(getStatusBadgeClass("Basic: Done", "done", "execution")).toContain("green");
	});

	it("falls back to the legacy status-string heuristic when no phase is present (no regression for legacy tasks)", () => {
		expect(getStatusBadgeClass("To Do")).toContain("gray");
		expect(getStatusBadgeClass("In Progress")).toContain("blue");
		expect(getStatusBadgeClass("Done")).toContain("green");
		expect(getStatusBadgeClass("Blocked")).toContain("red");
	});

	it("falls back to the legacy heuristic when phase is unknown in the given pipeline", () => {
		expect(getStatusBadgeClass("Done", "not-a-real-phase", "execution")).toContain("green");
	});

	it("falls back to the legacy heuristic when status is undefined and no phase is given", () => {
		expect(getStatusBadgeClass(undefined)).toContain("gray");
	});
});
