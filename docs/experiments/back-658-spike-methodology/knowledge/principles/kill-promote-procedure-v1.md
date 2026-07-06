# Kill/Promote Decision Procedure v1

**Status**: v1 draft (Iteration 1) — extracted from Iteration 0's ad hoc
verdict, then applied mechanically (not silently improved) to spike-1.
**Derived from**: `data/spike-0-log.md` "Kill/Promote Verdict" +
"Insights for Methodology" sections, plus explicit ordering added this
iteration.

## The procedure (apply in order; stop at first decisive answer)

1. **Re-state the declared done-bar question(s)** from before the spike
   started. (Sanity check: confirm you're deciding against what was
   actually declared, not a question that drifted mid-investigation.)

2. **Check for an independent, external corroborating signal** — a task's
   own header/status note, an existing ADR, a design doc that already
   speaks to the answer. Do this early: it is cheap and, per Iteration 0,
   meaningfully strengthens (or weakens) confidence in whatever verdict
   follows. Record what was found either way (absence of a signal is
   itself worth recording).

3. **Resolved vs. relocated test** (the load-bearing question, named from
   Iteration 0's Finding 4/5 but never previously stated as a rule): does
   the investigation's answer **resolve** the original uncertainty, or does
   it **relocate** the uncertainty to a new, still-open question (e.g., an
   architectural fork with no single reading-derivable answer)?
   - If **relocated** → lean **KILL**. Name the new open question
     explicitly in the verdict (per Iteration 0, a "legitimate follow-on"
     may still be worth *naming* — e.g., a design-discussion task — but
     that is not the same as promoting an execution task).
   - If **resolved** → continue to step 4.

4. **Concrete follow-on shape test**: is there a specific, nameable
   follow-on task shape (concrete enough to scope as a Basic execution
   task) that the resolved answer justifies?
   - If **yes** → **PROMOTE**.
   - If **no** (the only follow-on would be "more investigation" or "a
     design decision/discussion") → **KILL**, even if step 3 resolved
     cleanly — a resolved-but-inactionable answer is still a kill, per the
     distinction between "answering a question" and "producing buildable
     work."

5. **Ambiguity default**: if steps 3-4 do not produce a clean answer (e.g.
   partially resolved, or a follow-on shape exists but is fuzzy) — default
   to **KILL** with the ambiguity itself recorded as the reason, rather than
   forcing a PROMOTE call on thin evidence. (This default is a reasoned
   addition this iteration, not directly extracted from Iteration 0's single
   clean-cut case — Iteration 0 never actually hit this branch. Flagged
   here as an inference to be tested, not a proven rule.)

## What this procedure does not yet cover (explicit gap)

- Every step above has so far only been exercised on cases (spike-0, and —
  pending — spike-1) that turned out not to be genuinely on the boundary.
  Step 5's "ambiguity default" in particular is unvalidated: it has never
  actually been the deciding branch. Iteration 2 must deliberately pick a
  spike expected to land near the boundary to test it for real.
- The procedure does not yet say what "concrete enough to scope as a Basic
  task" means operationally (word count? presence of acceptance criteria?)
  — currently a judgment call at step 4, not a checkable rule.
