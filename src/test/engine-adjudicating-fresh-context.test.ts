/**
 * BACK-686.2 Phase C (AC#7) — fresh-context assertion: the session/puller
 * identity that adjudicating's full-path dispatch spawns must be distinct from
 * the `implementing` puller identity recorded on the task's claim.
 *
 * DEPENDS ON CHILD A (BACK-686.1, `src/engine/claim.ts`): at authoring time that
 * module does not exist yet, so this test exercises a STUB claim module
 * (`src/engine/claim.ts` in THIS worktree — see its file header) exposing
 * exactly the interface child A is expected to expose: a `puller` field on a
 * claim record, and a `readClaim(taskId)` accessor. When BACK-686.1 merges its
 * real implementation, this stub (and this test, if the real shape differs)
 * will need reconciling — flagged explicitly, not silently skipped.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { isFreshAdjudicatingContext } from "../engine/adjudicate-gate.ts";
import { __stubClearClaims, __stubSetClaim } from "../engine/claim.ts";

describe("isFreshAdjudicatingContext — dispatch identity != implementing puller identity (AC#7, stubbed)", () => {
	beforeEach(() => {
		__stubClearClaims();
	});

	it("is NOT fresh when the dispatch identity equals the recorded implementing puller", () => {
		__stubSetClaim({ taskId: "BACK-999", puller: "agent-session-A" });
		expect(isFreshAdjudicatingContext("BACK-999", "agent-session-A")).toBe(false);
	});

	it("IS fresh when the dispatch identity differs from the recorded implementing puller", () => {
		__stubSetClaim({ taskId: "BACK-999", puller: "agent-session-A" });
		expect(isFreshAdjudicatingContext("BACK-999", "agent-session-B")).toBe(true);
	});

	it("treats an unclaimed task as fresh (nothing to compare against)", () => {
		expect(isFreshAdjudicatingContext("BACK-000-unclaimed", "any-session")).toBe(true);
	});
});
