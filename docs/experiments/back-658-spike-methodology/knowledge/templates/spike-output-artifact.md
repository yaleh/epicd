# Spike Output Artifact Template v2

**Status**: v2 (Iteration 2) — supersedes the v1 version. One clarifying
addition to section 4 this iteration (evidence: `data/spike-2-log.md`, the
first spike whose verdict was not a single flat outcome); sections 1-3 and 5
unchanged because all 3 real spike logs so far used them as-is.

## Required sections (in this order)

1. **Pre-spike declaration** — written *before* investigating: scope (file/
   doc list), tool-call ceiling (per `timeboxing-rule-v2.md`), done bar.

2. **Real timeline** — the actual sequence of investigation actions, in
   order, with a scope-drift note, and the actual tool-call count against
   the declared ceiling. If both the ceiling and the done-bar-answered
   condition fire on the same action, say so explicitly (see
   `timeboxing-rule-v2.md`'s tie-break note).

3. **Findings** — numbered, each with a concrete citation (file:line, quoted
   text, or both).

4. **Kill/Promote verdict** — the verdict plus which step of
   `kill-promote-procedure-v2.md` was decisive, with citations.
   - **New in v2**: if the investigation surfaces an **emergent question**
     narrower than and separate from the declared done-bar (see
     `kill-promote-procedure-v2.md` step 3's "mixed case"), this section
     must state **two separate verdicts** — one for the declared done-bar,
     one for the emergent question — each with its own step-by-step
     rationale. Do not average or collapse them into a single verdict line;
     a clean main-question KILL must not silently swallow a genuinely open
     emergent sub-question (this is exactly the failure mode spike-2
     surfaced and this clause exists to prevent). For an ambiguity-default
     (step 5) verdict specifically, this section must also record: the
     mechanical output, an independent gut check, and whether a reasonable
     alternative reader could disagree — even when gut and mechanism agree.

5. **Retrospective** — did the declared budget/ceiling hold, and did it get
   tested under real pressure (ceiling actually reached) or only comfortably
   held? Where did the procedure produce friction, ambiguity, or a result
   that diverged from independent judgment? This section is where
   methodology-evolution evidence for the next iteration is captured.

## What is not required

- No fixed minimum length per section.
- No separate "conclusion" section — 3 real spikes across 2 different
  verdict shapes (flat KILL, flat PROMOTE, split main/emergent KILL) have
  all been sufficient with these 5 sections; no 6th section has been shown
  necessary.
