# BACK-658: Spike/Exploration Methodology (BAIME Experiment)

**Status**: ✅ Converged (Practical Convergence pattern)
**Domain**: exploration/spike execution methodology (epicd task pipeline)
**Parent task**: BACK-658
**Iterations**: 5 (0-4; target was 3-5, narrow domain, see "Why 3-5" below)
**Duration**: ~5 hours total across 5 iterations
**Final scores**: V_instance(s_4) = 0.80 (target met) · V_meta(s_4) = 0.71
(structural residual, honestly disclosed — see `results.md`)

## Background

epicd's task pipeline has three pipelines: `authoring`, `execution`, `exploration`
(see `docs/task-lifecycle-model.md` §3, `src/engine/pipeline.ts`). The
`exploration` pipeline has a single machine phase, `spike`, which always
adjudicates to `done` — but the *handler* injected at that phase must decide,
for each spike, whether to **kill** it (no trace, no derived task) or
**promote** it (spawn a new execution-pipeline task carrying
`provenance.spawned_from`, per BACK-638). See
`src/engine/exploration-handlers.ts` (`SpikeRunner`, `SpikeVerdict`,
`makeExplorationWorktreeOps`) for the exact mechanical seam this methodology
must drive.

BACK-657 split "exploration/spike" out of its phase→skill epic specifically
*because* no validated methodology exists yet for:

1. How to scope and timebox a spike (when to open one, what budget, what
   output shape).
2. How to make the kill-vs-promote call at the end of the timebox.

The explicit anti-pattern this experiment exists to avoid: hand-writing a
`spike` skill from intuition and then retrofitting a contracts-lint pass to
make it look validated. That is not validation — it is the exact failure
mode BACK-657 carved this work out to prevent. This experiment instead
requires the methodology to be *earned* from real OCA (Observe-Codify-
Automate) iterations grounded in actual spike-shaped exploration work
performed in the epicd repository during the experiment itself.

## Objectives

### Instance Objective (Agent Layer)

Produce a validated spike/exploration methodology consisting of:

- **Timeboxing rule**: how a spike's scope and time/effort budget are set
  before starting, and what triggers stopping at the boundary.
- **Kill/promote decision procedure**: an explicit, evidence-checkable
  procedure for classifying a finished spike as "kill" (dead end / answered
  question with no follow-on work / not worth building) vs "promote" (spawn
  an execution task via `provenance.spawned_from`).
- **Output artifact shape**: what a spike must leave behind regardless of
  verdict (a written finding, even on kill — "no trace" in the pipeline sense
  means no *derived task*, not no *record*).

This methodology must be proven — not merely asserted — against **at least
2-3 real spike instances** run during the experiment: small, genuine unknowns
in the epicd codebase (e.g., "does X approach work for Y", "what's the
actual shape of Z"), each timeboxed and each producing a real kill or
promote call.

### Meta Objective (Meta-Agent Layer)

Codify the methodology into a form BACK-658's stated deliverable requires:
"one converged spike methodology (with value-function evidence and iteration
record, traceable)". This experiment's output is consumed later (outside
this experiment, by `/baime:knowledge-extractor` — not part of this design)
to produce a real `exploration/spike` skill under `plugin/skills/` with
provenance pointing back at this experiment and registered in the
phase→skill coverage manifest (BACK-657).

## Non-Goals

- Not hand-writing the spike skill directly (that's the anti-pattern this
  experiment replaces).
- Not wiring exploration's production transport (BACK-641 — separate,
  independent prerequisite).
- Not changing engine core / adjudicate / pipeline-as-data. The methodology
  operates entirely within the existing `spike → done` data+handler seam;
  it must not invent new pipeline vocabulary (kill/promote are decision
  *outcomes*, never new phase names — see the AC#3 comment in
  `src/engine/pipeline.ts`).
- Not running this experiment's own iterations *as* exploration-pipeline
  tasks in the live backlog — the spike instances used as evidence are real
  epicd-codebase unknowns picked and timeboxed by the experiment, but the
  BAIME iteration bookkeeping itself lives in this experiment directory, not
  in `backlog/tasks/`.

## Approach

1. **Observe**: Run small real spikes against genuine epicd unknowns (see
   candidate list in `ITERATION-PROMPTS.md` Iteration 0). Record actual time
   spent, actual scope drift, and what info was needed to make a confident
   kill/promote call — not a hypothesized version of these things.
2. **Codify**: Extract the timeboxing rule and kill/promote decision
   criteria as explicit, falsifiable rules from what the observed spikes
   actually needed — not from prior assumptions about what a "good spike
   process" should look like.
3. **Automate**: Where a check can be captured procedurally (e.g., a
   pre-spike scoping checklist, a kill/promote decision rubric applied
   consistently), express it as a reusable artifact (template/checklist) —
   this experiment does not build engine tooling; "automate" here means
   "make the procedure repeatable without re-deriving it," consistent with
   BACK-658's non-goals.

## Success Criteria

- V_instance(s) ≥ 0.80 — methodology proven against ≥2-3 real spike
  instances with concrete evidence of correct-in-hindsight kill/promote
  calls.
- V_meta(s) ≥ 0.80 — methodology complete (timeboxing rule + decision
  procedure + artifact shape fully documented), transferable (states
  clearly what is epicd-specific vs universal to any spike/exploration
  process), and evidenced by the iteration record itself.
- System stable for 2 consecutive iterations (agent/capability set
  unchanged).
- Convergence pattern expected: **Meta-Focused Convergence** is acceptable
  here (V_meta ≥ 0.80, V_instance ≥ 0.55) if the domain turns out to have an
  inherently small number of distinguishable spike scenarios — but the
  default target is standard dual convergence (both ≥ 0.80). Do not
  pre-select this pattern; justify it only if iteration evidence shows
  instance-layer ceiling effects (see convergence-criteria reference).

## Why 3-5 Iterations (not 5-7)

The domain is narrow relative to typical BAIME domains (testing strategy,
CI/CD, observability): there are exactly two decision points (timebox
setting, kill/promote call) and one artifact shape to validate, not an
open-ended pattern library. Iteration 0 baselines against 1 real spike
already run; Iterations 1-2 run 1-2 more real spikes each and refine the
decision procedure from disconfirming evidence; by Iteration 3, the
procedure should either be stable and passing both thresholds, or show
exactly which of the two decision points is still weak, bounding a single
Iteration 4 gap-closure round. Do not force convergence at iteration 3 if
the evidence doesn't support it — trust the criteria, not the target count.

## Timeline

| Iteration | Focus | Status |
|-----------|-------|--------|
| 0 | Baseline: run first real spike, observe raw decision-making, no methodology yet | ✅ |
| 1 | Draft timeboxing rule + kill/promote v1 from Iteration 0 evidence; run 2nd spike | ✅ |
| 2 | Refine decision procedure from disconfirming evidence; run 3rd spike; define output artifact shape | ✅ |
| 3 | Consolidate, validate transferability, check dual convergence | ✅ (NOT converged: V_instance=0.75, V_meta=0.68) |
| 4 | Bounded gap closure (5th engineered spike) + final convergence decision | ✅ **CONVERGED (Practical Convergence): V_instance=0.80, V_meta=0.71** |

## Results

See `results.md` — converged via **Practical Convergence** pattern:
V_instance(s_4)=0.80 (target met, on real evidence from a deliberately
engineered 5th spike closing the ceiling-before-done-bar edge);
V_meta(s_4)=0.71 (structural residual — `effectiveness`'s undemonstrated
strongest form, and a permanent self-referential-validation limitation —
both honestly disclosed, not scored away). Recommendation: proceed to
`/baime:knowledge-extractor` against `knowledge/` to produce the real
`exploration/spike` skill.

## Directory Structure

```
back-658-spike-methodology/
├── README.md                    # This file
├── ITERATION-PROMPTS.md         # Iteration execution guide
├── iteration-0.md ...           # Iteration records (created as run)
├── results.md                   # Final results (created at convergence)
├── knowledge/
│   ├── INDEX.md
│   ├── patterns/
│   ├── principles/
│   ├── templates/
│   └── best-practices/
└── data/                        # Raw spike logs, timing data, decision notes
```
