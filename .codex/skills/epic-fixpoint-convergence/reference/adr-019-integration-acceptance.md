# ADR-019 pattern: epic-level Integration Acceptance as an executable gate

"ADR-019" here names a gap/pattern this codebase converged on, not a
requirement to write a formal ADR document in your own project — treat the
name as a label for the failure mode, not a mandatory artifact format.

## The failure mode this prevents

An Epic whose children are each individually green (own tests pass, own DoD
gate passes) can still fail to deliver the epic's actual business/AC goal,
because nothing ever exercised the *assembled* system end-to-end. Evaluating
an epic as "done" by aggregating child terminal phases (all children Done →
epic Done) is exactly the gap: no check ever asks "does the whole thing
actually work together". Source evidence in this codebase:
`src/harness/evaluator.ts` and `src/test/evaluate-runs-integration-acceptance.test.ts`
name this "the ADR-019 gap" and fix `evaluateEpic` to actually run the epic's
Integration Acceptance rather than only aggregate child phases.

## The pattern

Encode every epic Acceptance Criterion as one runnable check in a single
script (a "fixpoint meter"). Requirements for the meter:

- **One script, one command**, reporting `N/M green` with per-check detail.
- **Each check names**: the AC it proves, and the owning child task that is
  supposed to deliver it (so a red check tells you exactly where to look).
- **Nothing is declared "fixpoint reached" until the whole meter is green**
  — not "most checks", not "the important ones". If an AC is inherently
  process-based/one-time-proof and cannot be checked this way, that should
  have been caught and rewritten at decompose-front-load time (see SKILL.md
  step 1), not silently skipped in the meter.
- Checks should where possible do more than "does a test file exist" —
  structural/grep-based checks that catch a real render-site or call-site
  regression are stronger than "the unit test for the helper function is
  green" (a unit test on an isolated helper is gameable if every real call
  site bypasses the helper — this exact failure mode was caught live in
  BACK-665: `label()` stayed green while every real web component still
  rendered the raw un-projected field).
- The meter should live outside your normal test suite path (e.g. `scripts/`
  rather than `src/test/` in a Bun/TS project) so a red meter during a
  multi-PR migration never breaks the build — children still deliver their
  own green tests under the normal path per PR; the meter aggregates the
  assembled result across all of them.
- Support a fast structural-only mode and a slower mode that also runs the
  full test suite (`--with-suite` in the worked example), so it's cheap to
  run repeatedly during audits.

## Worked example

`scripts/fixpoint-back665.ts` in this codebase (see
`templates/fixpoint-meter-template.ts` in this skill for a genericized
version) — 10 checks, each naming an AC and an owning child, covering things
like "no persisted field of the old model remains in any data file", "no
raw un-projected field is rendered in any web component", "the evaluate
command itself actually runs Integration Acceptance rather than only
aggregating child phases" (the ADR-019 gap check, checking your own
evaluator's source for evidence it invokes an acceptance check, not just
that it aggregates terminal states).
