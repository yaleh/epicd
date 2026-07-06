# Results: BACK-658 Spike/Exploration Methodology (BAIME Experiment)

**Status**: ✅ Converged (Practical Convergence pattern)
**Iterations run**: 5 (0-4)
**Real spikes run as evidence**: 5
**Final scores**: V_instance(s_4) = 0.80 (target met) · V_meta(s_4) = 0.71 (structural residual, honestly disclosed, gap -0.09)

---

## 1. What Was Produced

A validated spike/exploration methodology for epicd's `exploration/spike`
pipeline phase (see README.md background), consisting of four versioned
knowledge artifacts, each with a full evidence trail back to specific real
spikes:

1. **`knowledge/principles/timeboxing-rule-v3.md`** (final) — budget in
   scope units (tool calls), not wall-clock time; declare a file list,
   tool-call ceiling (default 12), and "done bar" before starting; stop on
   ceiling, done-bar resolution, or 3 unproductive actions in a row,
   whichever fires first; tie-break rule when ceiling and done-bar fire
   together; and — new in v3 — the evidenced "close done bar → one
   extension" resolution for when the ceiling fires strictly before the
   done bar resolves.
2. **`knowledge/principles/kill-promote-procedure-v3.md`** (final) — a
   4-step procedure (re-state done bar → corroborate with a second
   independent signal → check for an emergent question distinct from the
   declared one → check for a nameable follow-on) for turning a finished
   spike into an explicit KILL or PROMOTE call, with step 4's nameability
   test clarified as separate from follow-on size.
3. **`knowledge/templates/spike-output-artifact.md`** (v2, final) — the
   5-section output shape every spike must leave behind regardless of
   verdict (declaration, timeline, findings, verdict application,
   reflection) — validated across 5 spikes with 3 different
   purpose/verdict shapes.
4. **`knowledge/principles/universal-vs-epicd-specific-split.md`** (v2,
   final) — an explicit classification of which parts of the methodology
   are universal to any spike/exploration process vs. epicd-specific
   (ceiling calibration; the promotion-target mechanism via
   `provenance.spawned_from`), confirmed against one concrete hypothetical
   non-epicd worked example.

All four are traceable to specific spike logs in `data/` (`spike-0-log.md`
through `spike-4-log.md`), per this experiment's validation discipline.

---

## 2. Evidence Trail — 5 Real Spikes

| # | Topic | Purpose | Verdict | Iteration |
|---|---|---|---|---|
| 0 | BACK-660 foreground-loop feasibility (architectural fork) | Baseline, no methodology yet | KILL | 0 |
| 1 | epicd-native stale-claim reaper existence | Test v1 rule/procedure | PROMOTE | 1 |
| 2 | Gate-events surface orphan-status after BACK-653's gate-inbox removal | Boundary-case test (uncertain verdict) | KILL (declared) + ambiguity-default KILL with disclosed tension (emergent) | 2 |
| 3 | Legacy inline-array `milestones:` config-migration code | Deliberate procedure-vs-gut divergence hunt | KILL (clean, strong agreement, no divergence found) | 3 |
| 4 | DoD-defaults override granularity (project vs. per-milestone) | Deliberately engineered tight-ceiling stress test of the timeboxing rule itself | KILL (pure knowledge question); ceiling fired before done bar resolved — first real instance of this edge, resolved by one extension | 4 |

Verdict distribution: 1 PROMOTE, 4 KILL (one with a disclosed
ambiguity-default tension). The procedure and independent gut judgment
converged in all 4 spikes where a comparison was meaningful (spike-0
through spike-3); spike-4 was a pure fact-finding question with no
gut-disagreement dimension.

---

## 3. Value Trajectory

| Iteration | V_instance | ΔV_instance | V_meta | ΔV_meta |
|---|---|---|---|---|
| 0 | 0.29 | — | 0.15 | — |
| 1 | 0.52 | +0.23 | 0.42 | +0.27 |
| 2 | 0.70 | +0.18 | 0.60 | +0.18 |
| 3 | 0.75 | +0.05 | 0.68 | +0.08 |
| 4 | **0.80** | +0.05 | **0.71** | +0.03 |

Both layers show conclusively diminishing returns by Iteration 4 (meta
delta shrinking every iteration: +0.27 → +0.18 → +0.08 → +0.03). The
instance layer crossed its 0.80 threshold in Iteration 4 on real,
newly-obtained evidence (the 5th, deliberately engineered spike closing the
single most persistently-named gap: the ceiling-before-done-bar edge). The
meta layer plateaued at 0.71.

---

## 4. Convergence Decision: Practical Convergence

**Dual threshold** (V_instance ≥ 0.80 AND V_meta ≥ 0.80): not met — meta
layer is 0.09 short.

**Meta-Focused Convergence** (V_meta ≥ 0.80, V_instance ≥ 0.55): does not
apply — the meta layer itself fails its own 0.80 bar under this pattern.

**Practical Convergence: applies.** This experiment concludes convergence
under this pattern because:

1. **The instance layer fully meets its threshold on genuine evidence.**
   The final gain came from directly and deliberately testing the last
   named uncertainty (the ceiling-before-done-bar edge) rather than
   asserting it away.
2. **The meta layer's remaining -0.09 gap is diagnosed, not merely
   asserted, as structural** to this experiment's self-contained design.
   It is carried almost entirely by two components:
   - **`effectiveness` (0.67)**: the procedure has repeatedly shown real
     value beyond unstructured judgment (spike-2's structural split,
     spike-3's decisive corroboration, spike-4's extension mechanism), but
     has never shown its *strongest* form — overriding a persistent,
     evidence-informed gut disagreement. Across 5 spikes, including one
     (spike-3) deliberately designed to hunt for exactly this, it has not
     occurred naturally. Manufacturing it artificially would produce
     evidence about a contrived scenario, not about this methodology's
     real operation.
   - **`validation` (0.65)**: every claim in this experiment — including
     the divergence-hunt finding, the reusability check, and the
     ceiling-edge stress test — was produced and validated by the same
     agent that authored the rules being tested. This is a **permanent**
     residual of running a methodology-bootstrapping experiment on itself,
     not a scoring gap closeable by more internal citation (resolved
     explicitly in Iteration 3, reaffirmed here).
3. **Diminishing returns are conclusive**: the meta-layer delta has shrunk
   every iteration and is now close to the ε=0.02 threshold, driven almost
   entirely by the two components above, which this experiment's own
   evidence (across Iterations 2-4) indicates cannot be moved further by
   more internal iteration of the same shape.
4. **System stability**: the agent set (`{}`) and meta-agent (no
   specialized capabilities) were unchanged across all 5 iterations — the
   maximum stability window this experiment observed, well beyond the
   2-iteration minimum.
5. **Objectives complete**: every item in README.md's Success Criteria is
   either met or explicitly, honestly named as structurally out of reach
   within this experiment's own design (below).

Forcing a further iteration would not plausibly close the remaining gap —
it would either manufacture a contrived scenario to force
`effectiveness`'s strongest form (evidence about an artificial case, not
this methodology's real operation) or repeat spike-running past the point
where new spikes materially move any component (the domain's own
"Why 3-5 Iterations" scoping in README.md anticipated this).

---

## 5. Honest Disclosure: The Self-Referential-Validation Residual

This experiment validated its own methodology from inside itself: the same
agent that authored the timeboxing rule and kill/promote procedure also
selected the spike topics, executed the spikes, judged the verdicts, and
scored the value functions. This is a genuine, structural limitation of a
methodology-bootstrapping experiment of this shape — not a flaw specific to
this domain or this agent's diligence.

This was mitigated, not eliminated, in three ways:
- Every claim in every knowledge artifact cites a specific spike log and
  section — nothing is asserted without a traceable source.
- Iteration 3 deliberately hunted for a procedure-vs-gut divergence
  (rather than assuming continued agreement) and honestly reported not
  finding one, alongside two unresolved readings of what that means.
- Iteration 4 deliberately engineered a previously-untested edge case
  (rather than asserting it was probably fine) and reported the real
  outcome.

But no amount of within-experiment rigor substitutes for genuine external
validation: a different agent, or a real spike run outside this
experiment's control, actually using the extracted methodology and finding
(or not finding) friction. **This is explicitly named as the true remaining
test** — one this experiment's own non-goals (README.md) correctly forbid
it from manufacturing internally, and one that BACK-658's stated next step
(skill extraction + real usage) is positioned to actually provide.

---

## 6. Transferability Assessment

`universal-vs-epicd-specific-split.md` (v2) names exactly two
epicd-specific substitutions required to reuse this methodology in a
non-epicd context:

1. **Ceiling calibration**: the default 12-tool-call ceiling was calibrated
   against epicd's own investigative shapes (code reading, grepping, test
   running); a different codebase/toolset would need its own calibration
   pass, not a blind reuse of "12."
2. **Promotion-target mechanism**: "promote" in this methodology means
   "spawn a new task via `provenance.spawned_from`" — a mechanism specific
   to epicd's task-pipeline model (BACK-638). A non-epicd context would
   substitute its own equivalent "turn this into real work" mechanism
   (a ticket, a backlog item, a PR).

Everything else — the budget-in-scope-units principle, the declare-before-
starting discipline, the stop-rule structure, the 4-step kill/promote
procedure, and the 5-section output artifact shape — is asserted as
universal, confirmed (though only via one concrete hypothetical, not a
real live application) against a structurally-analogous non-epicd example
(a Django/DRF team assessing whether hand-rolled middleware is redundant
after a framework upgrade).

**Honest limit**: this transferability claim rests on structural
inspection plus one hypothetical worked example — not a real, literally
executed application in a different codebase. This is the second
significant residual this experiment carries forward, alongside
self-referential validation.

---

## 7. Residuals Carried Forward (for Skill Extraction)

Whoever performs `/baime:knowledge-extractor` against this experiment's
`knowledge/` directory should carry these forward as **named, disclosed
limitations of the extracted skill**, not as blockers to extraction:

1. **The harder ceiling-before-done-bar sub-branch** (extension
   insufficient, or done bar not close at all) has a reasoned default
   (KILL-with-named-open-question, no second extension) but no empirical
   test — the first real case of this in actual skill usage is genuine new
   evidence, not a re-derivation.
2. **`effectiveness`'s strongest form** (procedure overriding a persistent
   gut disagreement) has never been observed across 5 spikes including one
   deliberate hunt — real-world skill usage, especially by an agent with a
   strong prior instinct that turns out wrong, is the natural place this
   could finally be observed.
3. **Self-referential validation** is permanent to this experiment by
   design — real usage by a different agent, on a real spike this
   experiment did not select, is the genuine external test.
4. **Reusability** rests on one hypothetical, not a real cross-project
   application — the two named epicd-specific substitutions (ceiling
   calibration, promotion-target mechanism) should be explicitly
   parameterized in the extracted skill so a real cross-project user can
   substitute them without re-deriving the rest.

---

## 8. Recommendation for BACK-658

**Proceed to `/baime:knowledge-extractor`** against this experiment's
`knowledge/` directory (`timeboxing-rule-v3.md`, `kill-promote-procedure-v3.md`,
`spike-output-artifact.md` v2, `universal-vs-epicd-specific-split.md` v2) to
produce the real `exploration/spike` skill under `plugin/skills/`, with
provenance pointing back at this experiment (`docs/experiments/back-658-spike-methodology/`)
per BACK-658's stated design. The four residuals in Section 7 should be
carried into the extracted skill's own documentation as explicit,
honestly-disclosed limitations — this is the correct, honest handoff, not
a sign the methodology is unready for extraction.
