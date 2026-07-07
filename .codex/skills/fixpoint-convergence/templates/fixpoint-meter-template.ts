#!/usr/bin/env bun
/**
 * <TASK-ID> fixpoint meter — TEMPLATE (illustrative, not a required tool).
 *
 * This meter is the MULTI-CHILD instrument: use it when a task decomposed into
 * ≥2 children, to exercise the ASSEMBLED system. A single-leaf task does NOT
 * need this file — its own structured DoD gate, re-run by the engine at merge,
 * IS its Integration Acceptance (see SKILL.md Stage 4 / evaluate).
 *
 * Genericized from a worked example in epicd (scripts/fixpoint-back665.ts).
 * This is the ADR-019 pattern: encode every Acceptance Criterion as a runnable
 * check, so a multi-child task has ONE red -> green convergence signal instead
 * of a pile of independently-green child DoDs that never got exercised
 * together. Nothing is "fixpoint reached" until every check below is green.
 *
 * Adapt the `checks` array to your own project's AC list and file layout.
 * Keep this outside your normal test-suite path (e.g. scripts/, not
 * src/test/) so a red meter during a multi-PR migration never breaks CI —
 * each child still delivers its own green tests per PR; this meter
 * aggregates the assembled, cross-child result.
 *
 *   bun <path-to-this-file>.ts               # structural checks (fast)
 *   bun <path-to-this-file>.ts --with-suite  # also run the full test suite
 */

type Result = { pass: boolean; detail: string };
type Check = { id: string; ac: string; owner: string; run: () => Result };

// --- Replace with your own project's helpers -------------------------------
// Common shapes seen in the worked example:
//  - grep(dir, pattern): walk source files, return matching paths — good for
//    "no more instances of the old pattern remain" / "call site still uses
//    the new helper, not a bypass" checks.
//  - deliveredTest(name): pass once a named test file exists under your
//    test dir — its own green-ness is enforced by your normal test runner,
//    this meter only checks the child actually delivered it.
// -----------------------------------------------------------------------

const checks: Check[] = [
  {
    id: "example-no-old-pattern-remains",
    ac: "AC1",
    owner: "<child-task-id> (describe what it delivers)",
    run: () => {
      // Prefer checks stronger than "does a unit test exist for the helper"
      // — a helper's own unit test stays green even if every real call site
      // bypasses it. Grep real call/render sites for the anti-pattern
      // directly when you can (this caught a real regression in the BACK-665
      // worked example: a projection helper was tested in isolation while
      // every web component still rendered the raw un-projected field).
      return { pass: true, detail: "replace with a real structural check" };
    },
  },
  {
    id: "example-evaluate-runs-integration-acceptance",
    ac: "AC-N (self-enforcing loop)",
    owner: "<child-task-id delivering the evaluate/complete mechanism>",
    run: () => {
      // The ADR-019 gap check itself: verify your own evaluate/complete
      // mechanism actually RUNS this meter (or an equivalent acceptance
      // check), rather than only aggregating child terminal states.
      return {
        pass: false,
        detail:
          "TODO: point this at your evaluator's source and assert it " +
          "invokes an acceptance check, not just child-phase aggregation",
      };
    },
  },
];

const results = checks.map((c) => ({ ...c, ...c.run() }));
const green = results.filter((r) => r.pass).length;

console.log("\n<TASK-ID> fixpoint meter\n");
for (const r of results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.id}  [${r.ac}]`);
  console.log(`        ${r.detail}`);
  if (!r.pass) console.log(`        owner: ${r.owner}`);
}
console.log(`\n  ${green}/${results.length} fixpoint checks green\n`);

let suiteOk = true;
if (process.argv.includes("--with-suite")) {
  console.log("  running full test suite ...");
  // Replace with your project's actual test invocation.
  const proc = Bun.spawnSync(["bun", "test", "--parallel"], { stdout: "inherit", stderr: "inherit" });
  suiteOk = proc.exitCode === 0;
  console.log(`  full suite: ${suiteOk ? "green" : "red"}\n`);
}

process.exit(green === results.length && suiteOk ? 0 : 1);
