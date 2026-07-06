# Kill/Promote Decision Procedure v2

**Status**: v2 (Iteration 2) — supersedes `kill-promote-procedure-v1.md`.
Two evidence-driven changes this iteration (both from `data/spike-2-log.md`,
the first spike to actually stress the ambiguity-default branch); steps 1-2
and the overall order are otherwise unchanged because spike-2 confirmed
them, it did not disconfirm them.
**Derived from**: `kill-promote-procedure-v1.md` (Iteration 1), now tested
against a deliberately-chosen boundary-case spike (Iteration 2) that, for
the first time, actually produced a mixed/ambiguous result instead of a
clean one.

## The procedure (apply in order; stop at first decisive answer)

1. **Re-state the declared done-bar question(s)** from before the spike
   started. (Unchanged from v1.)

2. **Check for an independent, external corroborating signal.** (Unchanged
   from v1 — spike-2 confirmed this step again, finding a corroborating
   in-code comment; also confirmed the v1 lesson from spike-1 that
   corroboration can point in different directions: agreeing with an
   existing answer, confirming a gap matters, *or*, new this iteration,
   partially contradicting its own stated rationale on close inspection —
   record what the corroborating signal actually says, not just that one
   exists.)

3. **Resolved vs. relocated test.** Does the investigation's answer
   **resolve** the original uncertainty, or does it **relocate** it?
   - If **relocated** → lean **KILL**, naming the new open question.
   - If **resolved** → continue to step 4.
   - **New in v2 — the mixed case** (evidence: spike-2, the first case where
     this was not binary): if the investigation resolves the **declared**
     done-bar question but, in the course of investigating it, surfaces a
     **separate, narrower, emergent question the original declaration did
     not name** — do not treat this as a single verdict. Run steps 3-5
     **twice**: once for the declared done-bar (which may resolve cleanly),
     and once for the emergent question (which may not). State both
     verdicts explicitly and separately in the output artifact's verdict
     section (see `spike-output-artifact.md` v2). Collapsing them into one
     verdict risks silently absorbing a genuinely open emergent question
     into a clean-looking main-question KILL — exactly the failure mode
     spike-2 surfaced and this addition exists to prevent.

4. **Concrete follow-on shape test.** Is there a specific, nameable,
   Basic-task-sized follow-on that the resolved answer justifies?
   - If **yes** → **PROMOTE**.
   - If **no** → **KILL**, even if step 3 resolved cleanly.
   - (Unchanged from v1; spike-2 confirmed this test is checkable and
     produced a genuine candidate task description when applied to the
     emergent question, even though the overall verdict landed on KILL via
     step 5 — see the note on step 5 below about *why* it didn't stop here.)

5. **Ambiguity default.** If step 3 (for whichever question is being
   verdicted — main or emergent, per the v2 split above) does not resolve
   cleanly, default to **KILL**, recording the ambiguity as the reason.
   - **Clarified in v2** (evidence: spike-2 is the first time this branch
     actually fired): this default is deliberately conservative — it means
     the procedure will sometimes suppress a follow-on task that a
     differently-weighted judgment call would promote (spike-2's emergent
     question had a concrete step-4 shape available, yet still defaulted to
     KILL because step 3 itself was ambiguous). **This is a known, accepted
     cost of the default, not a bug** — but it must be disclosed every time
     it fires: record (a) the mechanical KILL verdict, (b) your own
     independent gut check against it, and (c) explicitly whether a
     reasonable alternative reader could plausibly disagree and why,
     **even if your own gut agrees with the mechanical output** (spike-2:
     gut agreed, but a stricter-hygiene reading would reasonably disagree —
     both facts were recorded, not just the agreement).

## What this procedure still does not cover (explicit, carried-forward gap)

- **Step 4's "concrete enough to scope as a Basic task" test remains a
  judgment call**, not a checkable rule, across all 3 spikes so far — no
  spike has yet produced disconfirming or confirming evidence sharp enough
  to operationalize it further (word count, presence of acceptance
  criteria, etc. all remain unproven candidates, not adopted).
- **The tie-break between "ceiling reached" and "done-bar answered"** (see
  `timeboxing-rule-v2.md`) has been addressed on the timeboxing side, but
  this procedure has not yet been tested on a spike where the ceiling is
  reached **before** the done bar resolves, i.e. where step 1 must restate
  an *unanswered* done-bar question. It is a reasonable, evidence-driven
  guess (not yet tested) that this should route through step 3's
  "relocated" branch (the remaining uncertainty becomes the new open
  question) — but this is explicitly flagged as untested, not adopted as a
  confirmed rule.
