# Kill/Promote Decision Procedure v3

**Status**: v3 (Iteration 3) — supersedes `kill-promote-procedure-v2.md`.
One clarifying addition to step 4 this iteration (evidence:
`data/spike-3-log.md`, the 4th real spike, run specifically to hunt for a
procedure-vs-gut divergence); steps 1-3 and step 5 are otherwise unchanged
because spike-3 confirmed them, it did not disconfirm them. Spike-3's
central finding — that step 2's corroboration check is what actually
resolves hard cases, and that 4 real spikes in a row have shown the
procedure and independent gut judgment converge rather than diverge — is
recorded here and in `data/spike-3-log.md`, not folded into a new rule,
because it is a finding about the procedure's behavior, not a gap in its
text.

**Derived from**: `kill-promote-procedure-v2.md` (Iteration 2), now tested
against a 4th real spike (Iteration 3) deliberately chosen as a candidate
for genuine procedure-vs-gut divergence.

## The procedure (apply in order; stop at first decisive answer)

1. **Re-state the declared done-bar question(s)** from before the spike
   started. (Unchanged from v1/v2.)

2. **Check for an independent, external corroborating signal.** (Unchanged
   from v1/v2 — spike-3 confirmed this step again and found it to be
   decisive: a dedicated regression test suite tied to a real historical
   bug, plus a real sibling-migration retention precedent in the same
   codebase, were what actually resolved an otherwise-plausible "looks like
   cleanup-worthy cruft" gut read. This is now the step with the most
   accumulated evidence of doing real discriminating work across 4 spikes —
   see `data/spike-3-log.md` Section 5.)

3. **Resolved vs. relocated test.** Does the investigation's answer
   **resolve** the original uncertainty, or does it **relocate** it?
   - If **relocated** → lean **KILL**, naming the new open question.
   - If **resolved** → continue to step 4.
   - **Mixed case** (from v2, evidence: spike-2): if the investigation
     resolves the **declared** done-bar question but surfaces a **separate,
     narrower, emergent question** the original declaration did not name,
     verdict it separately (see `spike-output-artifact.md` v2). Spike-3
     explicitly checked for an emergent question and found none — confirming
     this split does not fire on every spike, only when one is genuinely
     present (unchanged from v2).

4. **Concrete follow-on shape test.** Is there a specific, nameable,
   Basic-task-sized follow-on that the resolved answer justifies?
   - If **yes** → **PROMOTE**.
   - If **no** → **KILL**, even if step 3 resolved cleanly.
   - **New in v3 — nameability is separate from size** (evidence: comparing
     this test's application across all 4 spikes so far —
     `data/spike-1-log.md`'s reaper-porting follow-on, a substantial
     multi-file feature port; `data/spike-2-log.md`'s emergent-question
     follow-on, a one-line docstring correction; `data/spike-3-log.md`'s
     clean "no," where nothing nameable existed at all). All three
     "yes"/"no" outcomes were equally clear-cut regardless of the
     follow-on's size — a tiny docstring fix and a multi-file port were
     both unambiguously "concrete enough" once one existed, and their being
     nameable at all (not their size) is what step 4 actually tests.
     **Clarification, not a new rule**: this step asks "can you name a
     specific follow-on," not "is the follow-on small." Task-sizing (Basic
     vs. Epic, per this repo's own decomposition guidance) is a downstream
     concern for whoever creates the follow-on task, not part of this
     yes/no test itself. This narrows, but does not fully close, the
     previously-named "concrete enough" operationalization gap: no
     checklist (word count, presence of acceptance criteria, etc.) has yet
     been adopted, because no spike has yet produced a genuinely hard
     nameability judgment call (all 4 spikes' step-4 applications, once
     reached, were easy to call either way) — see "What this procedure
     still does not cover" below.

5. **Ambiguity default.** If step 3 (for whichever question is being
   verdicted — main or emergent, per the v2 split above) does not resolve
   cleanly, default to **KILL**, recording the ambiguity as the reason.
   (Unchanged from v2 — not reached in spike-3, since step 3 resolved
   cleanly; the disclosure requirement, when this branch does fire, is
   unchanged: mechanical output + independent gut check + whether a
   reasonable alternative reader could disagree, even when gut agrees.)

## What this procedure still does not cover (explicit, carried-forward gap)

- **Step 4's nameability test has now been applied 4 times without a hard
  case** (a follow-on whose nameability itself was genuinely disputable).
  All 4 applications (2 "yes," 1 clean "no," 1 "yes-but-suppressed-by-
  ambiguity-default") were easy calls once reached. This is a real, if
  modest, piece of evidence that the *nameability* judgment itself may be
  less fragile than initially assumed after Iteration 2 — but it remains
  unproven against a genuinely hard nameability case, so no checklist is
  adopted; this gap is narrowed in scope (it's about nameability-of-a-
  disputed-shape specifically now, not the test generally) rather than
  closed.
- **The tie-break between "ceiling reached" and "done-bar answered"** (see
  `timeboxing-rule-v2.md`) remains untested on a spike where the ceiling is
  reached **before** the done bar resolves — still true after 4 spikes
  (spike-3 used 10 of 12, a comfortable margin, not a forced stop). This
  is the single largest remaining structural unknown in the combined
  timeboxing/decision procedure and is explicitly carried into Iteration 4
  scoping (see `iteration-3.md` Section 6) rather than guessed at here.
- **Real procedure-vs-gut divergence has still not occurred in 4 spikes**
  (1 clean KILL, 1 clean PROMOTE, 1 weak-agreement-with-disclosed-tension
  KILL, 1 strong-agreement-with-no-tension KILL) — spike-3 was
  deliberately selected as a plausible divergence candidate and still
  converged. `data/spike-3-log.md` Section 5 states two equally-honest
  readings of what this means (a genuine property of a well-designed
  corroboration step, vs. a still-too-small/non-independent sample) without
  resolving which is true — this procedure file does not claim divergence-
  proofness, only that none has yet been observed despite a genuine,
  motivated attempt to find one.
