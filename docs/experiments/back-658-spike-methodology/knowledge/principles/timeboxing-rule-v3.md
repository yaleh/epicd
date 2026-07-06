# Timeboxing Rule v3

**Status**: v3 (Iteration 4) — **current**. Supersedes `timeboxing-rule-v2.md`.
Changed in exactly one place, evidence-driven: the ceiling-reached-before-
done-bar-resolves edge, deliberately tested for the first time this
iteration (previously named as the single most important open gap across 3
consecutive iterations).
**Derived from**: `timeboxing-rule-v2.md` (Iteration 2), now tested against
the one edge it explicitly could not resolve by `data/spike-4-log.md`
(Iteration 4, a deliberately engineered tight-ceiling stress test — not a
naturally occurring spike).

## The rule (unchanged from v1/v2)

**Budget in scope units (tool calls / files), not wall-clock minutes.**

Before starting a spike:
1. Declare the file/doc list you expect to need.
2. Declare a **tool-call ceiling**: default **12 tool calls** (unchanged —
   still the well-calibrated default for organically-scoped spikes; spike-4
   deliberately used a non-default, artificially tight ceiling of 5 to
   force the edge case, which is a distinct, intentional stress-test use of
   the rule, not evidence the default itself should change).
3. Declare the "done bar": the specific question(s) that, once answerable,
   end the investigation regardless of remaining budget.

Candidate-scan tool calls (finding which question to spike on) are **not**
counted against the declared ceiling — confirmed across all 5 spikes now.

## Stop rule (unchanged structurally; one new resolved branch this iteration)

Stop when **any** of the following hits first:
- (a) the tool-call ceiling is reached, OR
- (b) all declared done-bar questions are answerable, OR
- (c) three consecutive investigation actions produce no new information
  relevant to the done-bar questions.

**Tie-break when (a) and (b) fire together** (unchanged from v2, evidenced
by spike-2): treat as (b) for kill/promote procedure purposes, since a
resolved done bar is stronger evidence than an exhausted budget alone.

**New in v3 — ceiling reached strictly before the done bar resolves**
(evidence: `data/spike-4-log.md`, the first real instance across 5 spikes):
1. Assess whether the done bar is **"close"** — a narrow, specifically
   nameable remaining check (e.g., "does file X contain keyword Y"), not a
   broad, still-open-ended unknown.
2. If close: **permit exactly one extension tool call**, spent only on
   that narrow remaining check. If it resolves the done bar, proceed to
   verdict application as normal (spike-4: 1 extension, done bar resolved
   cleanly, ~20% budget overrun).
3. If the done bar is NOT close (a broad unknown remains) — or if the one
   permitted extension does not resolve it — **stop and apply
   kill-promote-procedure-v3.md's step 1 with the done bar explicitly
   marked "unresolved"**: this defaults to a **KILL-with-named-open-question**
   (no follow-on task manufactured from an unresolved investigation; the
   open question itself is the recorded artifact per the output template),
   not a forced guess at PROMOTE or KILL. A second extension is not
   permitted — this bounds worst-case overrun to a single extra tool call,
   preserving the rule's core purpose (bounding scope creep).

**Honest scope of this evidence**: spike-4 tested and confirms branch 2
(close done bar, one extension, resolves cleanly) works as intended. Branch
3 (extension doesn't resolve it, or done bar isn't close at all) remains
**evidenced by design reasoning, not yet by a real spike** — no spike has
yet produced a genuinely broad, still-unresolved done bar at the ceiling.
This is disclosed plainly, not smoothed over: v3 closes the specific,
narrow sub-case this experiment could cheaply and deliberately engineer a
real test for, while honestly leaving the harder sub-case (extension fails
to resolve) as a design-reasoned default rather than an empirically
confirmed one.

## What this rule still does not cover (narrowed, not eliminated)

- The **"extension doesn't resolve it" / "done bar isn't close at all"**
  sub-case of the ceiling-before-done-bar edge remains untested. The
  default behavior (KILL-with-named-open-question, no second extension) is
  a reasoned design choice consistent with the rule's purpose, not an
  empirically validated one — carried forward honestly as a residual, not
  claimed as closed.
- "Concrete enough" scope-declaration precision remains a non-issue across
  all 5 spikes — no evidence of a gap here, so no rule is added
  speculatively.
