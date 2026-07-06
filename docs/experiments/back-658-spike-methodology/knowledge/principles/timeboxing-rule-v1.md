# Timeboxing Rule v1

**Status**: v1 draft (Iteration 1) — tested once against spike-1, not yet
stress-tested against an ambiguous/hard case.
**Derived from**: Iteration 0 (`data/spike-0-log.md`), specifically the
disconfirming finding that wall-clock self-timing was unreliable in this
execution environment (declared 25 min, system clock recorded ~2 min for
work that plausibly took a 20-30 min-equivalent reading/reasoning effort).

## The rule

**Budget in scope units (tool calls / files), not wall-clock minutes.**

Before starting a spike:
1. Declare the file/doc list you expect to need (as Iteration 0 already did
   naturally) — this remains part of the rule, since Iteration 0 showed
   scope-declaration (not time-declaration) is what actually held.
2. Declare a **tool-call ceiling**: a count of investigation actions
   (Read/Grep/Bash-for-investigation calls), not a clock duration. Default
   starting ceiling: **12 tool calls**, chosen from Iteration 0's own spike
   (grounding + spike-proper reads there totaled roughly 7-9 distinct
   file/grep operations for a "clean" case; 12 gives ~30-40% headroom for a
   case that isn't as clean without being unbounded).
3. Declare the "done bar": the specific question(s) that, once answerable,
   end the investigation regardless of remaining budget.

## Stop rule (trigger to stop even if unresolved)

Stop and move to the kill/promote call when **any** of the following hits
first:
- (a) the tool-call ceiling is reached, OR
- (b) all declared done-bar questions are answerable, OR
- (c) three consecutive investigation actions produce no new information
  relevant to the done-bar questions (a "diminishing returns" signal that
  more reading of the same kind won't resolve it — this is itself evidence
  for the kill/promote procedure's "resolved vs. relocated" question, not
  just a stop condition).

Wall-clock may still be recorded for the log's data-collection value (it's
free to note), but it is **not** the fidelity metric and must not gate the
stop decision — this directly overrides Iteration 0's implicit assumption
that clock time was the natural unit, based on that iteration's own
disconfirming measurement.

## What this rule does not yet cover (explicit gap)

- The 12-tool-call default is a single-instance-derived number (from one
  clean spike-0 plus reasoning about headroom) — it has not yet been tested
  against a spike that actually needed to invoke the ceiling as a forced
  stop. Iteration 2's harder spike should test whether 12 is too tight, too
  loose, or roughly right, and revise with evidence rather than intuition.
- No guidance yet on what to do differently if the ceiling is hit **before**
  the done-bar questions are answerable (does that itself become evidence
  for "kill," or does it just mean the spike needs a second timeboxed pass?).
  This is an open question for Iteration 2, not resolved here.
