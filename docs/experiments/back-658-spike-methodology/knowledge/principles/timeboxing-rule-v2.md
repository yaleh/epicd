# Timeboxing Rule v2

**Status**: v2 (Iteration 2) — supersedes `timeboxing-rule-v1.md`. Changed in
exactly one place, evidence-driven; everything else retained unchanged
because spike-2 confirmed it, did not disconfirm it.
**Derived from**: `timeboxing-rule-v1.md` (Iteration 1, from Iteration 0's
wall-clock-unreliability finding), now tested for the first time under real
ceiling pressure by `data/spike-2-log.md` (Iteration 2).

## The rule (unchanged from v1)

**Budget in scope units (tool calls / files), not wall-clock minutes.**

Before starting a spike:
1. Declare the file/doc list you expect to need.
2. Declare a **tool-call ceiling**: default **12 tool calls** (unchanged —
   spike-2 used exactly 12 and the ceiling held without needing to be raised
   or lowered; this is the first real evidence the default number itself is
   plausibly well-calibrated, not just assumed).
3. Declare the "done bar": the specific question(s) that, once answerable,
   end the investigation regardless of remaining budget.

Candidate-scan tool calls (finding which question to spike on) are **not**
counted against the declared ceiling — confirmed again by spike-2 (3
candidate-scan calls excluded, consistent with spike-1's precedent).

## Stop rule (unchanged structurally; one addition this iteration)

Stop when **any** of the following hits first:
- (a) the tool-call ceiling is reached, OR
- (b) all declared done-bar questions are answerable, OR
- (c) three consecutive investigation actions produce no new information
  relevant to the done-bar questions.

**New in v2 — tie-break when (a) and (b) fire on the same tool call**
(evidence: spike-2's 12th and final tool call both reached the ceiling and
answered the done bar simultaneously; v1 listed three independent triggers
but never said what to do if two fire together): when the ceiling and the
done-bar-answered condition are satisfied by the same action, treat it as
(b) — done-bar-answered — for the purposes of the kill/promote procedure's
step 1 (re-state done bar), since a resolved done bar is stronger evidence
than an exhausted budget alone. Record which condition(s) fired in the log
regardless, since this is diagnostic information about whether the ceiling
default is well-calibrated (a ceiling that is *always* reached right as the
done bar resolves, spike after spike, would be suspicious — either
under-provisioned or an artifact of scope-declaration habits creeping toward
the ceiling; watch for this pattern across future spikes rather than
treating one coincidence as proof either way).

## What this rule still does not cover (explicit, carried-forward gap)

- **The harder case — ceiling reached *before* the done bar resolves — is
  still untested after 3 spikes.** Spike-2 came the closest yet (used the
  full ceiling) but the timing coincided with resolution rather than
  preceding it. This remains the single most important open edge for this
  rule: what should happen to a spike that runs out of budget with a
  genuinely open question? (Plausible candidates not yet evidence-tested:
  treat as an automatic KILL-with-named-open-question via the kill/promote
  procedure's "relocated" branch; or permit exactly one budget extension if
  the done bar is "close" by some stated measure. Do not resolve this by
  guessing — it needs a spike that actually exhausts the ceiling with real
  unresolved uncertainty, which none of spike-0/1/2 has been.)
- "Concrete enough" scope-declaration precision (how detailed the declared
  file list needs to be before it counts as a real declaration, vs. a vague
  placeholder) has not surfaced as a problem in any of the 3 spikes so far —
  no evidence of a gap here, so no rule is added speculatively.
