# Knowledge Index — back-658-spike-methodology

**Last updated**: Iteration 4 (final). Catalogs every knowledge artifact
produced across the experiment, its current version, validation status, and
source iteration(s).

## Principles

| File | Version | Status | Source iteration(s) |
|---|---|---|---|
| `principles/timeboxing-rule-v1.md` | v1 | Superseded by v3 (kept for history/traceability, not deleted) | Iteration 1, drafted from Iteration 0 evidence |
| `principles/timeboxing-rule-v2.md` | v2 | Superseded by v3 (kept for history) | Iteration 2, from `data/spike-2-log.md`; reconfirmed Iteration 3 |
| `principles/timeboxing-rule-v3.md` | v3 | **Current, final.** Closes the last named open edge: a deliberately engineered tight-ceiling spike (spike-4) forced the ceiling-reached-before-done-bar-resolves condition for the first time, and evidenced the "close done bar → one extension" resolution branch cleanly. The harder sub-branch (extension insufficient / done bar not close) remains a reasoned-but-unevidenced default, honestly disclosed as a residual, not claimed as closed | Iteration 4, from `data/spike-4-log.md` |
| `principles/kill-promote-procedure-v1.md` | v1 | Superseded by v3 (kept for history) | Iteration 1, drafted from Iteration 0 evidence |
| `principles/kill-promote-procedure-v2.md` | v2 | Superseded by v3 (kept for history) | Iteration 2, from `data/spike-2-log.md` |
| `principles/kill-promote-procedure-v3.md` | v3 | **Current.** Step 4 clarified (nameability of a follow-on is separate from its size, evidenced across all 4 spikes' step-4 applications); a deliberate divergence-hunt spike (spike-3) again found procedure/gut convergence rather than divergence — recorded as an open, unresolved-by-fiat finding (two honest readings given, neither forced), not claimed as proof the procedure is divergence-proof | Iteration 3, from `data/spike-3-log.md` |
| `principles/universal-vs-epicd-specific-split.md` | v2 | **Current.** Structural classification tables unchanged from v1 (Iteration 2); adds Section 6, a concrete hypothetical non-epicd worked-example reusability check (Django/DRF spike) that found no additional smuggled epicd assumption beyond the two already named in v1 (ceiling calibration; promotion-target mechanism). Upgrades this component's evidence from "asserted from inspection" to "asserted + confirmed by one concrete hypothetical example" — still short of a real live cross-project test, honestly disclosed as a residual gap | Iteration 2 (v1); Iteration 3 (v2, Section 6 added) |

## Templates

| File | Version | Status | Source iteration(s) |
|---|---|---|---|
| `templates/spike-output-artifact.md` | v2 | **Current, final.** 5-section structure validated across 5 real spikes with 3 different verdict/purpose shapes (flat decision, split main/emergent decision, rule-stress-test); spike-4 needed light framing adaptation (an explicit "not a normal kill/promote spike" preface) to fit a rule-testing rather than decision-application spike — a real, minor data point on the template's limits, not a failure | Iteration 1 (v1), Iteration 2 (v2); reconfirmed Iteration 3; lightly stress-tested Iteration 4 |

## Patterns / Best Practices

None. Per the domain's narrow scope (README.md "Why 3-5 Iterations"), no
pattern library beyond the three principle files and one template was ever
demonstrated necessary — nothing was forced into these directories
speculatively across all 4 iterations and 5 spikes. Final conclusion.

## Data (raw spike evidence backing the above)

| File | Spike topic | Verdict | Iteration |
|---|---|---|---|
| `data/spike-0-log.md` | BACK-660 foreground-loop feasibility (architectural fork) | KILL | 0 |
| `data/spike-1-log.md` | epicd-native stale-claim reaper existence | PROMOTE | 1 |
| `data/spike-2-log.md` | Gate-events surface orphan-status after BACK-653's gate-inbox removal | KILL (declared question) + KILL-via-ambiguity-default with disclosed reasonable-alternative-PROMOTE tension (emergent question) | 2 |
| `data/spike-3-log.md` | Legacy inline-array `milestones:` config-migration code (`src/core/backlog.ts`): dead weight or load-bearing? Deliberately chosen to hunt for procedure-vs-gut divergence | KILL (clean; strong gut/mechanism agreement, no disclosed alternative-reader tension — 4th spike, still no real divergence found) | 3 |
| `data/spike-4-log.md` | DoD-defaults override granularity (project-only vs per-milestone) — deliberately engineered tight-ceiling (5 calls) rule-stress-test targeting the ceiling-before-done-bar-resolves edge | KILL (pure knowledge question, answered: project-wide only, no milestone override); ceiling fired before done bar resolved, one extension call cleanly resolved it | 4 |

## Cross-references

- Every principle/template file's own "Derived from" / "Status" header
  cites the specific spike log(s) and iteration section it traces to — no
  file in this directory makes a claim without a traceable source, per this
  experiment's validation discipline (V_meta `validation` component).
- Superseded (v1/v2) files are intentionally retained, not deleted, so the
  iteration record remains reconstructable (BAIME "traceable" requirement).
- **Self-referential validation**: every claim in this catalog, including
  Iteration 4's ceiling-stress-test finding, was produced by the same agent
  that authored the rules being validated. Iteration 3 resolved this
  explicitly as a **permanent, honestly-disclosed residual** of this
  experiment's self-contained design; Iteration 4 did not attempt to
  re-close it through more citation, per Iteration 3's explicit instruction
  — see `results.md` for the final disclosure.
