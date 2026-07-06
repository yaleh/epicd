# Iteration 2: Stress-Test on a Hard Case; Refine Decision Procedure; Finalize Artifact Shape

**Date**: 2026-07-06
**Duration**: ~85 minutes (grounding re-read + boundary-case spike selection + spike + revision + writeup)
**Status**: Completed
**Framework**: BAIME (Bootstrapped AI Methodology Engineering)

---

## 1. Executive Summary

Iteration 2's explicit job was to find out whether the v1 methodology
(tool-call-ceiling timeboxing + 5-step kill/promote procedure) actually
holds up under real ambiguity, not just on the two clean cases Iteration 0
and Iteration 1 happened to produce. A deliberately hard 3rd spike was
selected — genuinely uncertain in advance — investigating whether epicd's
gate-events surface (`appendGateEvent` write path, `GET /api/gate-events`
REST endpoint, CLI `engine gate-log`, and the `inbox` skill) is now orphaned
scaffolding worth a cleanup task, following BACK-653's same-day removal of
its one Web UI consumer (`GateInboxPage`).

This spike delivered exactly the stress test intended: the tool-call ceiling
was reached for the first time (12 of 12), and the kill/promote procedure's
step-5 ambiguity default fired for the first time. The investigation also
surfaced something the v1 procedure did not anticipate: an **emergent
question narrower than the declared done-bar** (whether the REST endpoint's
own justifying comment is actually accurate, given it conflates a sibling
surface's real consumer with itself) — a genuinely disputable point where a
concrete follow-on task shape existed (step 4 would say yes) even though the
main resolved/relocated read (step 3) was mixed. Applying v1 literally
produced a KILL via the ambiguity default; my own gut agreed but weakly, and
I explicitly identified that a stricter, equally reasonable reader would
promote instead — a genuine, disclosed procedure/alternative-reading
tension, not a rubber-stamped agreement.

This is the single most valuable data point the experiment has produced:
concrete evidence that v1's ambiguity default can suppress a legitimate
PROMOTE when an emergent side-question surfaces mid-investigation, because
v1 assumed ambiguity would only ever appear directly in the declared
done-bar. v2 of the kill/promote procedure adds an explicit split-verdict
mechanism for exactly this case; v2 of the timeboxing rule adds a
tie-break note for ceiling-and-done-bar-answered coinciding (which also
happened this spike, on the same final tool call). Both revisions are
evidence-driven, traced to this one spike, and each file honestly discloses
what remains untested (most importantly: ceiling reached *before* the done
bar resolves has still never happened in 3 spikes).

**Value Scores**:
- V_instance(s_2) = **0.70** (Δ +0.18 from s_1's 0.52; Target: 0.80, Gap: -0.10)
- V_meta(s_2) = **0.60** (Δ +0.18 from s_1's 0.42; Target: 0.80, Gap: -0.20)

---

## 2. Pre-Execution Context

**Previous State (s_1)**: V_instance=0.52, V_meta=0.42, two real spikes
completed (BACK-660 foreground-loop feasibility → KILL; epicd-native
stale-claim reaper existence → PROMOTE), v1 timeboxing rule + v1 kill/promote
procedure drafted, but explicitly flagged as untested on a genuine boundary
case — both prior spikes turned out clean, and the ambiguity default and the
tool-call ceiling had never actually been exercised under pressure.

**Meta-Agent**: M_2 — still no specialized meta-agent capabilities; main
session continues as its own iteration executor. Re-evaluated in Section 7
against this iteration's actual work, not carried forward by default.

**Agent Set**: A_2 = {} (carried into this iteration pending Section 7's
evidence-based re-check).

**Primary Objectives** (from ITERATION-PROMPTS.md Iteration 2):
1. Run a 3rd real spike deliberately chosen to sit near the kill/promote
   boundary, per Iteration 1's own gap analysis — ✅ done (gate-events
   orphan-status spike; `data/spike-2-log.md`).
2. Diagnose precisely, if the procedure produces an ambiguous/wrong-feeling
   verdict, which criterion failed to discriminate and why — ✅ done
   (Section 3/5 below; the emergent-question gap).
3. Revise the decision procedure/timeboxing rule only in response to
   concrete observed friction — ✅ done (`timeboxing-rule-v2.md`,
   `kill-promote-procedure-v2.md`).
4. Finalize the output artifact shape from what all 3 logs actually needed
   — ✅ done (`spike-output-artifact.md` v2).
5. Explicitly separate epicd-specific from universal parts of the
   methodology — ✅ done
   (`knowledge/principles/universal-vs-epicd-specific-split.md`).
6. Calculate V_instance(s_2)/V_meta(s_2) with evidence and deltas — ✅ done
   (Section 4).
7. Rigorous convergence check — ✅ done (Section 6).

---

## 3. Work Executed

### Phase 1: OBSERVE — Select and run the boundary-case 3rd spike (~45 min)

**Boundary-case selection** (the central design decision this iteration):
Per Iteration 1's Priority 2 gap ("neither spike run so far has been a real
boundary case"), candidates were scanned specifically for a question where
reasonable people could disagree about the verdict, not merely one that was
unknown to me. `BACK-653` (an untracked-then-merged task found via `git
status`/`task view`) removing `GateInboxPage` — the one designed Web
consumer of the gate-events REST surface (per `BACK-605.10`/`BACK-632`/
`BACK-633`) — surfaced a live candidate: is what's left of that surface now
worth a cleanup task, or intentionally-kept low-cost latent instrumentation?
This was genuinely undecided to me at selection time (unlike, e.g.,
BACK-642, rejected because its task text already states its own fix), and
plausibly landed near the boundary because "file a hygiene task for
unused-but-harmless code" is a real point of engineering disagreement, not
a fact question with one correct answer.

**Spike execution**: Declared per `timeboxing-rule-v1.md` exactly as
written (12-tool-call ceiling, scope, done bar) — see
`data/spike-2-log.md` Step 1. Ran 12 of 12 declared tool calls (the first
time in this experiment the ceiling was actually reached, not comfortably
held), stopping because the ceiling and the done-bar-answered condition
fired on the same, final action (Step 2). Findings 1-5 (Step 3) converge on:
the write path is a deliberate single-purpose design (confirmed by
`BACK-633`'s own task text); the CLI/skill read path has a real, current
consumer; the REST endpoint specifically has zero current consumers and its
own justifying in-code comment is subtly inaccurate about why.

**Verdict application** (Step 4, applied mechanically and in real time):
applying `kill-promote-procedure-v1.md` literally to the declared done-bar
question produced a clean KILL (the surface overall is not orphaned
scaffolding). But the investigation surfaced an emergent, narrower question
the declared done-bar never named (is the REST endpoint's specific
justification accurate) — a genuinely mixed resolved/relocated read. Per
v1's literal step 5 text, this triggered the **ambiguity default for the
first time in this experiment**, producing KILL on the emergent question
too. My own gut agreed, but weakly — and I explicitly identified, per this
iteration's instruction, that a stricter, equally reasonable reader
(consistent with this repo's own precedent of small hygiene tasks like
BACK-654/655) would promote instead. This procedure/reasonable-alternative
tension is recorded honestly in `data/spike-2-log.md` Step 4, not
smoothed over.

### Phase 2: CODIFY — Diagnose and revise, evidence-only (~25 min)

Two revisions made, both traced to this spike, both explicitly disclosed as
addressing exactly one observed friction point each — no speculative
additions:

1. `kill-promote-procedure-v2.md`: adds an explicit **emergent-question
   split** to step 3 — when the investigation surfaces a narrower question
   the declared done-bar didn't name, verdict it separately rather than
   letting a clean main-question resolution silently absorb it. Also
   clarifies (does not weaken) step 5's ambiguity default: it is a
   deliberately conservative default that can suppress a legitimate
   PROMOTE, and every time it fires, the log must record the mechanical
   output, an independent gut check, and whether a reasonable alternative
   reader could disagree — even if gut and mechanism agree, as they did
   here.
2. `timeboxing-rule-v2.md`: adds a **tie-break note** for when the ceiling
   and the done-bar-answered condition fire on the same tool call (this
   spike's 12th call did both) — treat it as done-bar-answered for the
   kill/promote procedure's purposes, but log both conditions, since a
   ceiling that is *always* reached right at resolution across many spikes
   would itself be diagnostic (either under-provisioned or an artifact of
   scoping habits creeping toward the ceiling).

Both files explicitly retain, rather than resolve, the still-untested edge
carried over from Iteration 1: what happens when the ceiling is reached
**before** the done bar resolves. This spike came the closest yet (full
ceiling used) but the coincidence with resolution means this edge remains
genuinely open, and both v2 files say so plainly rather than claiming it
closed.

### Phase 3: AUTOMATE — Finalize artifact template + universal/epicd split (~15 min)

- `spike-output-artifact.md` v2: one addition to the verdict section (must
  support a two-part main/emergent verdict, plus explicit gut-check/
  alternative-reading disclosure for ambiguity-default cases) — confirmed
  from what spike-2's actual verdict shape needed, not speculative.
- `knowledge/principles/universal-vs-epicd-specific-split.md` (new): a
  structural classification of every rule/step in both principle files as
  universal or epicd-specific, per this iteration's explicit required
  deliverable for V_meta's `reusability` component. Verdict: timeboxing
  rule ~95% universal (only the calibrated ceiling number is
  environment-specific); kill/promote procedure ~90% universal (only what
  "PROMOTE" mechanically cashes out to — `provenance.spawned_from` via the
  `backlog` CLI — is epicd-specific; the decision logic itself is
  portable). Honestly flagged as asserted-from-inspection, not yet
  demonstrated against a real non-epicd case.
- `knowledge/INDEX.md` (new): full catalog of every principle/template/data
  artifact, its version, validation status, and source iteration —
  required by this iteration's deliverables list.

### Phase 4: EVALUATE — Calculate V(s_2) (~10 min)

See Section 4.

---

## 4. Value Calculations

### V_instance(s_2) Calculation

**Formula** (unchanged):
```
V_instance = 0.30 × timeboxing_fidelity + 0.35 × decision_correctness
           + 0.20 × artifact_completeness + 0.15 × instance_count_confidence
```

#### Component 1: timeboxing_fidelity

**Measurement**: For the first time, the ceiling was actually reached under
real investigative pressure (12 of 12), not comfortably held (10 of 12 in
spike-1). The stop rule's tie-break case (ceiling and done-bar-answered
firing together) also occurred for the first time and is now covered by
`timeboxing-rule-v2.md`.

**Score**: **0.65**

**Evidence**: `data/spike-2-log.md` Step 2 ("Tool calls used: 12 of 12
declared ceiling — the ceiling was reached for the first time in this
experiment"). Scored 0.65 (up from 0.55) because this is real progress on
the previously-flagged "comfortable margin only" gap — but not higher,
because the harder, still-untested edge (ceiling reached **before** the
done bar resolves, forcing a stop on a genuinely open question) still has
not occurred in any of the 3 spikes; this spike's ceiling-hit coincided with
resolution rather than preceding it, so the rule's hardest case remains
unproven.

**Change from s_1 (0.55)**: +0.10 — real, evidenced progress, but the
single hardest edge (forced stop with unresolved uncertainty) is still
untested, capping the gain.

#### Component 2: decision_correctness

**Measurement**: The procedure's ambiguity default (step 5) fired for the
first time and was applied mechanically and honestly, including disclosing
a genuine tension with a reasonable alternative reading rather than
smoothing it into agreement. This is exactly the kind of evidence
`decision_correctness` needs — not just "the procedure produced a verdict,"
but "the procedure was tested against real ambiguity and its behavior
under that ambiguity was honestly characterized, including its known cost."

**Score**: **0.68**

**Evidence**: `data/spike-2-log.md` Step 4 (two-part verdict: clean KILL on
the declared question; ambiguity-default KILL on the emergent question,
with an explicit disclosed tension against a stricter-reading PROMOTE).
Scored 0.68 (up from 0.60) — a meaningful jump, since this iteration
finally produced the boundary-case evidence Iteration 1 explicitly lacked —
but not higher, because the procedure's behavior under genuine ambiguity
(defaulting to KILL even when step 4 has a concrete follow-on shape
available) is now a **known, disclosed limitation**, not a fully validated
strength; step 4's "concrete enough" test also remains an unoperationalized
judgment call across all 3 spikes.

**Change from s_1 (0.60)**: +0.08 — the central, most valuable gain this
iteration, directly addressing Iteration 1's Priority 2 gap.

#### Component 3: artifact_completeness

**Measurement**: The template held for a third, structurally different
spike (the first with a split main/emergent verdict) with one clarifying
addition, not a rewrite.

**Score**: **0.65**

**Evidence**: `spike-output-artifact.md` v2's changelog (one clause added to
section 4); `data/spike-2-log.md`'s own retrospective ("this spike's
verdict section is noticeably longer/more nested... suggesting the
template's verdict section should explicitly allow a main/emergent split").
Scored 0.65 (up from 0.60) — genuine but modest progress, since the
template needed only a clarifying addition rather than proving inadequate,
which is itself decent evidence of a reasonably well-designed v1 structure.

**Change from s_1 (0.60)**: +0.05.

#### Component 4: instance_count_confidence

**Measurement**: 3 real spikes now completed cumulative (spike-0, spike-1,
spike-2), meeting the formula's own stated full-credit bar ("3+ = full
credit"), and — per the formula's own explicit note — "a 3rd instance that
lands in the hard middle of the kill/promote spectrum is worth more than a
4th easy one," which spike-2 explicitly was designed to be and turned out
to be.

**Score**: **0.90**

**Evidence**: Directly from the formula's own scale (3+ spikes = full
credit), with a small deliberate discount (not full 1.0) reflecting that 3
is the minimum of the "full credit" band, not a deep confirmatory sample.

**Change from s_1 (0.45)**: +0.45 — the largest single-component gain this
iteration, both mechanically (3rd spike run) and qualitatively (it was the
hard one the formula itself weights more highly).

#### V_instance(s_2) Final Calculation

```
V_instance(s_2) = 0.30·(0.65) + 0.35·(0.68) + 0.20·(0.65) + 0.15·(0.90)
               = 0.195 + 0.238 + 0.130 + 0.135
               = 0.698
               ≈ 0.70
```

**V_instance(s_2) = 0.70** (Target: 0.80, Gap: -0.10, 87.5% of target)

**Change from s_1**: **+0.18** (0.52 → 0.70), within the
ITERATION-PROMPTS.md-expected range for Iteration 2 (0.65-0.80).

---

### V_meta(s_2) Calculation

**Formula** (unchanged):
```
V_meta = 0.30 × completeness + 0.30 × effectiveness
       + 0.20 × reusability + 0.20 × validation
```

#### Component 1: completeness

**Checklist**:
- [x] Timeboxing rule documented with concrete parameters — still done, now
  with a tie-break clarification.
- [x] Kill criteria enumerated — done, now with the emergent-question split.
- [x] Promote criteria enumerated — done, unchanged (step 4).
- [x] Output artifact template exists — done, v2, with split-verdict
  guidance.
- [x] Decision procedure has explicit ordering — done, order unchanged.

**Score**: **0.68**

**Evidence**: All five items still present, and two of the procedure's
previously-named "unresolved edges" (ambiguity default behavior;
ceiling/done-bar tie-break) are now addressed with real evidence behind the
fix, rather than remaining purely aspirational. Scored 0.68 (up from 0.55)
— a solid jump — but not higher, because two edges remain explicitly open
(step 4's "concrete enough" operationalization; ceiling-reached-before-
done-bar-resolves), both honestly disclosed rather than silently dropped.

**Change from s_1 (0.55)**: +0.13.

#### Component 2: effectiveness

**Measurement**: For the first time, there is a case where the documented
procedure did something ad hoc judgment might not reliably have done on its
own: it forced an explicit, structured split between a "main question"
verdict and an "emergent question" verdict, and it forced an explicit
disclosure of a reasonable-alternative reading even though my own gut
agreed with the mechanical output. Without the procedure's step-by-step
structure, it is plausible (though not certain) that the emergent
side-finding would have been mentioned only informally, without ever being
run through its own resolved-vs-relocated/concrete-shape/ambiguity-default
sequence — which is exactly the kind of "reduces ambiguity/surfaces what
ad hoc judgment might skip" effect this component measures.

**Score**: **0.55**

**Evidence**: `data/spike-2-log.md` Step 4's explicit two-part verdict
structure, contrasted with spike-0/1's single flat verdicts (neither of
which had an emergent question to separate, since neither was ambiguous).
Scored 0.55 (up from 0.35) reflecting real, first-time evidence of the
procedure adding structure beyond raw judgment — but not higher, because
this is still evidence from a single spike, and the procedure's behavior
here (defaulting to KILL under ambiguity) is disclosed as a known cost, not
an unambiguous win — "effectiveness" in the strongest sense (preventing a
wrong call) remains only partially demonstrated.

**Change from s_1 (0.35)**: +0.20.

#### Component 3: reusability

**Assessment**: This iteration's required deliverable — an explicit
universal-vs-epicd-specific classification — was produced
(`universal-vs-epicd-specific-split.md`), moving this component from
"asserted structurally in passing" (Iteration 1) to "explicitly enumerated,
rule-by-rule, with a stated percentage and named exceptions" (Iteration 2).

**Score**: **0.58**

**Evidence**: `universal-vs-epicd-specific-split.md`'s own tables (timeboxing
rule ~95% universal; kill/promote procedure ~90% universal, with the
epicd-specific residue precisely named in both cases — calibration of the
ceiling number, and the `provenance.spawned_from`/`backlog` CLI mechanics of
what "PROMOTE" cashes out to). Scored 0.58 (up from 0.35) — real, structural
progress — but not higher, because, as the split document's own final
section states, this remains **asserted from inspection**, not
**demonstrated** by actually applying the procedure to a non-epicd example
— the single largest remaining gap for this component, explicitly named
rather than glossed over.

**Change from s_1 (0.35)**: +0.23.

#### Component 4: validation

**Assessment**: Every claim in both v2 principle files, the split document,
and the v2 template traces to a specific spike-2 finding or a specific prior
iteration's file — the citation discipline established in Iteration 0/1 was
maintained, now across 3 iterations' worth of cross-referenced claims
(tracked centrally for the first time in `knowledge/INDEX.md`).

**Score**: **0.60**

**Evidence**: `knowledge/INDEX.md`'s table (every file's status column names
its source iteration/spike); every "New in v2" clause in both principle
files cites `data/spike-2-log.md` by section. Scored 0.60 (up from 0.55) —
a modest gain, since the residual gap named in Iteration 1 (self-referential
validation — this experiment validating its own rules, with no external
check) remains, and is honestly still present here; the gain reflects
better cross-referencing discipline (the new INDEX.md), not resolution of
that residual gap.

**Change from s_1 (0.55)**: +0.05.

#### V_meta(s_2) Final Calculation

```
V_meta(s_2) = 0.30·(0.68) + 0.30·(0.55) + 0.20·(0.58) + 0.20·(0.60)
            = 0.204 + 0.165 + 0.116 + 0.120
            = 0.605
            ≈ 0.60
```

**V_meta(s_2) = 0.60** (Target: 0.80, Gap: -0.20, 75% of target)

**Change from s_1**: **+0.18** (0.42 → 0.60), within the
ITERATION-PROMPTS.md-expected range for Iteration 2 (0.55-0.75).

---

## 5. Gap Analysis

### Instance Layer Gaps (ΔV = -0.10 to target)

**Status**: 🟢 CLOSE TO TARGET (87.5% of target) — the closest this
experiment has been.

**Priority 1: timeboxing_fidelity** (0.65, need +0.15)
- The single remaining untested edge is a spike whose ceiling is reached
  **before** its done bar resolves — none of spike-0/1/2 has produced this.
  Iteration 3 should consider whether this needs a dedicated 4th spike or
  can be addressed by a smaller targeted re-check (e.g., deliberately
  under-provisioning the ceiling on a known-harder question) — per the
  experiment's own guidance, only if genuine doubt remains, not as a
  default action.

**Priority 2: decision_correctness** (0.68, need +0.12)
- Step 4's "concrete enough to scope as a Basic task" test remains an
  unoperationalized judgment call across all 3 spikes. This is now the
  most concretely-named remaining gap in the procedure itself.

**Priority 3: artifact_completeness** (0.65, need +0.15)
- No further action indicated unless Iteration 3 (or a 4th spike) reveals a
  genuinely new structural need — the template has now been validated
  against 3 differently-shaped spikes with only one clarifying addition.

**Priority 4: instance_count_confidence** (0.90, need +0.10 for full 1.0)
- Largely closed; any residual gap here is a matter of accumulating
  further confirmatory confidence, not a structural deficiency — low
  priority relative to Priorities 1-2.

**Estimated Work**: Plausibly closeable within Iteration 3, contingent on
whether Priority 1's edge case needs new evidence (a targeted re-check) or
can be reasoned through from what's already been observed.

### Meta Layer Gaps (ΔV = -0.20 to target)

**Status**: 🟡 MID-LATE PROGRESS (75% of target) — larger remaining gap
than the instance layer, consistent with Iteration 1's own prediction that
meta-layer components (especially reusability and effectiveness) would lag.

**Priority 1: effectiveness** (0.55, need +0.25)
- The procedure has now shown it adds real structure (the emergent-question
  split), but has not yet shown it **prevents a wrong verdict** raw
  judgment would have reached — the strongest form of this component
  remains unmeasured. This may be intrinsically hard to close within this
  experiment's own remaining spikes if no future case produces a genuine
  procedure-vs-judgment divergence (as opposed to a procedure-vs-alternative-
  reader divergence, which spike-2 did produce).

**Priority 2: reusability** (0.58, need +0.22)
- The explicit split now exists and is detailed, but remains untested
  against a real non-epicd application. Iteration 3 should consider a
  small, bounded exercise: apply `kill-promote-procedure-v2.md` (as
  written) to a hypothetical spike in a different, non-epicd context, and
  check whether any epicd assumption was silently smuggled in — this is a
  cheap, high-value check that doesn't require a whole new real spike.

**Priority 3: completeness** (0.68, need +0.12)
- The two named open edges (step 4 operationalization; ceiling-before-
  done-bar) are the same items driving Priority 1-2 of the instance layer
  gaps above — closing those closes this too.

**Priority 4: validation** (0.60, need +0.20)
- The residual self-referential-validation gap (named in Iteration 1) is
  likely to remain a permanent, honestly-disclosed residual even at
  convergence — this experiment cannot manufacture true external validation
  of its own rules from inside itself. Iteration 3 should state this
  plainly if it persists, rather than trying to force a score increase here
  through more self-citation.

**Estimated Work**: 1 more iteration plausible for reusability/completeness;
effectiveness and validation both have a real chance of ending Iteration 3
still short of 0.80 for reasons that are structural to a self-contained
experiment, not fixable by more iterations alone — Iteration 3 should
assess honestly whether this points toward a justified Meta-Focused
Convergence pattern (V_meta ≥ 0.80 with V_instance ≥ 0.55, per README.md)
in reverse — i.e., whether a slightly-under-0.80 V_meta with a strong,
honestly-disclosed reason should be accepted rather than force-iterated —
or whether Iteration 4 is genuinely warranted.

---

## 6. Convergence Check

### Criteria Assessment

**Dual Threshold**:
- [ ] V_instance(s_2) ≥ 0.80: ❌ NO (0.70, gap -0.10, 87.5% of target)
- [ ] V_meta(s_2) ≥ 0.80: ❌ NO (0.60, gap -0.20, 75% of target)

**System Stability**: M_2 == M_1 == M_0 (no specialized meta-agent
capabilities across all 3 iterations); A_2 == A_1 == A_0 ({} in all three).
This is now the **third consecutive iteration** with no agent/capability
evolution, and this iteration's actual work (select a boundary-case spike,
run it, diagnose friction, revise two principle files with targeted,
evidence-driven edits, finalize a template, write a classification
document) again remained a single continuous reasoning thread with no
independently-parallelizable sub-problem — see Section 7 for the full,
non-rubber-stamped re-check.

**Objectives Complete**:
- [x] 3rd real spike run, deliberately selected as a boundary case.
- [x] Ambiguity-default branch actually exercised, and its result honestly
  recorded (mechanical output + gut check + disclosed alternative-reading
  tension).
- [x] Decision procedure and timeboxing rule revised only from concrete,
  observed friction (two targeted changes, both traced to spike-2).
- [x] Output artifact template finalized (v2) from all 3 logs' actual needs.
- [x] Explicit universal-vs-epicd-specific split produced.
- [x] Honest V(s_2) calculation with disclosed deltas and drivers.
- [x] Rigorous convergence check performed (this section).

**Diminishing Returns**: ΔV_instance = +0.18, ΔV_meta = +0.18 — both still
substantial (not yet below the ε=0.02 diminishing-returns threshold), though
somewhat smaller than Iteration 1's deltas (+0.23/+0.27) — a plausible early
sign of the curve beginning to flatten, but not yet conclusive evidence of
a plateau; one more iteration's delta is needed to distinguish "genuinely
diminishing" from "large but naturally smaller once the biggest structural
gaps (methodology existing at all; a boundary case tested at all) are
closed."

**Status**: ❌ NOT CONVERGED — both value layers remain below 0.80, though
V_instance is now close (87.5% of target) and V_meta, while further behind
(75%), has a plausible, bounded path to closure (a small cross-project
reusability check; a decision on whether the self-referential-validation
gap should be treated as a permanent, acceptable residual).

**Progress Trajectory**:
- Instance layer: s_0 = 0.29 → s_1 = 0.52 → s_2 = 0.70 (Δ +0.23, +0.18).
- Meta layer: s_0 = 0.15 → s_1 = 0.42 → s_2 = 0.60 (Δ +0.27, +0.18).

**Estimated Iterations to Convergence**: Iteration 3 is plausible to reach
or come very close to dual convergence, per the experiment's own 3-5
iteration plan — but this should not be pre-committed; Iteration 3 must
honestly assess whether the two named meta-layer gaps (reusability
demonstration; the self-referential validation residual) are closeable
within one more iteration or represent a structural ceiling this
self-contained experiment cannot alone cross, in which case a fourth,
tightly-bounded gap-closure iteration (per the experiment's own Iteration 4
template) would be the correct, honest outcome rather than forcing
convergence prematurely.

---

## 7. Evolution Decisions

### Agent Evolution

**Current Agent Set**: A_2 = {} (unchanged).

**Sufficiency Analysis**:
- ✅ This iteration's actual work — boundary-case candidate selection
  (sequential, each candidate-read informing whether to keep looking),
  spike execution (a single continuous 12-tool-call investigation thread),
  procedure diagnosis and revision (directly downstream of the spike's own
  findings, not independently parallelizable), template/split-document
  drafting (each depends on the spike's actual verdict shape) — remained a
  single continuous reasoning thread throughout, the same shape of evidence
  as Iterations 0 and 1.
- The one place a parallel sub-task might plausibly have helped — running
  two candidate spike topics simultaneously to compare which was more
  genuinely ambiguous before committing — was considered and rejected:
  the actual selection process (reading BACK-653's non-goals, noticing the
  REST-endpoint tension) was itself sequential-discovery-dependent (the
  candidate was found *while* reading for a different purpose), not a
  pre-enumerable parallel search.

**Decision**: ✅ NO EVOLUTION NEEDED

**Rationale**: No capability gap was demonstrated this iteration, the third
in a row to reach this same conclusion from actual observed work rather
than default carry-forward. The domain's narrow scope (README.md's "Why 3-5
Iterations": one pipeline, one phase, two decision points, one artifact
shape) continues to hold, and this iteration's hardest, most demanding work
(diagnosing a genuine procedural gap and revising two files precisely) still
did not surface a point where a specialized agent or parallel sub-task
would have helped — if anything, the single-threaded nature of "read
finding → check against procedure step → decide → write" made a shared,
continuous context more valuable, not less.

**Re-evaluate**: After Iteration 3, specifically if closing the reusability
gap (an explicit cross-project application check) turns out to require
maintaining two genuinely independent framings (epicd-context vs.
hypothetical-non-epicd-context) simultaneously in a way that benefits from
separation — not proactively, and only if that specific need materializes.

### Meta-Agent Evolution

**Current Meta-Agent**: M_2 (unchanged; no specialized capabilities).

**Sufficiency Analysis**:
- ✅ All four lifecycle phases (OBSERVE/CODIFY/AUTOMATE/EVALUATE) were
  exercised this iteration, including the hardest one yet (diagnosing a
  procedural failure mode and producing a precise, bounded fix rather than
  either ignoring the friction or over-correcting into speculative new
  rules) — the main session alone remained sufficient throughout.

**Decision**: ✅ NO EVOLUTION NEEDED

**Rationale**: No capability gap was demonstrated. This iteration's central
friction point (the ambiguity default suppressing a plausible PROMOTE on an
emergent question) is, as in Iteration 1, a **methodology-content** gap —
now actually fixed with a targeted rule addition — not a meta-agent
**capability** gap.

---

## 8. Artifacts Created

### Data Files
- `docs/experiments/back-658-spike-methodology/data/spike-2-log.md` — full
  spike-2 record: boundary-case topic selection and rationale, pre-spike
  declaration, real timeline (12 of 12 tool calls — first ceiling-reached
  case), 5 findings with citations, two-part verdict (clean KILL on the
  declared question; ambiguity-default KILL with disclosed
  reasonable-alternative-PROMOTE tension on the emergent question),
  retrospective.

### Knowledge Files
- `knowledge/principles/timeboxing-rule-v2.md` — supersedes v1; adds the
  ceiling/done-bar tie-break note, traced to spike-2's 12th tool call;
  explicitly retains the still-untested "ceiling before done bar resolves"
  edge.
- `knowledge/principles/kill-promote-procedure-v2.md` — supersedes v1; adds
  the emergent-question split (step 3) and clarifies the ambiguity
  default's known cost and disclosure requirement (step 5), both traced to
  spike-2.
- `knowledge/principles/universal-vs-epicd-specific-split.md` (new) —
  rule-by-rule universal-vs-epicd-specific classification for both
  principle files, required for V_meta's reusability component; honestly
  flags itself as asserted-from-inspection, not yet demonstrated.
- `knowledge/templates/spike-output-artifact.md` (updated to v2) — adds
  split-verdict and ambiguity-disclosure guidance to section 4.
- `knowledge/INDEX.md` (new) — full catalog of every principle/template/
  data artifact with version, validation status, and source iteration.

### Code Changes
- None. Per this experiment's non-goals and this task's explicit
  instruction: no epicd codebase files outside
  `docs/experiments/back-658-spike-methodology/` were modified. The
  gate-events surface's actual code (`src/harness/stage2-gate.ts`,
  `src/server/index.ts`, `src/engine/gate-log.ts`,
  `plugin/skills/inbox/SKILL.md`) was read-only investigated; no docstring
  was corrected and no task was created for either the main-question or
  emergent-question findings, consistent with this being a read-only
  investigation spike, not an implementation task.

### Other Artifacts
- This iteration record: `docs/experiments/back-658-spike-methodology/iteration-2.md`.

---

## 9. Reflections

### What Worked

1. **Deliberately selecting a spike expected to be ambiguous, rather than
   letting ambiguity happen to occur, worked exactly as designed.** The
   candidate (gate-events surface orphan-status after BACK-653) was chosen
   specifically because I could not tell in advance which verdict it would
   reach — and it delivered both a genuine ceiling-reached case and a
   genuine ambiguity-default case in a single spike, which is more signal
   per spike than either prior iteration produced.
2. **The emergent-question finding is a genuinely new class of evidence**
   this experiment had not previously produced: a case where the procedure,
   applied literally, revealed its own scope-assumption (that ambiguity
   only shows up in the declared done-bar) was too narrow — and where the
   fix (verdict the emergent question separately) was directly extractable
   from the observed friction, not invented speculatively.
3. **Recording the gut-check-vs-mechanism tension honestly, even when they
   agreed, surfaced a disclosure requirement worth keeping**: the
   interesting finding was not "the procedure and my gut disagreed" (they
   didn't, on my primary reading) but "a reasonable alternative reader
   plausibly would disagree" — a subtler and, this iteration's evidence
   suggests, more common form of procedure-vs-judgment tension than an
   outright divergence.

### What Didn't Work

1. **The hardest timeboxing edge is still untested after 3 spikes.** All
   three ceiling-related outcomes so far (comfortable margin in spike-0/1,
   exact-coincidence-with-resolution in spike-2) have avoided the genuinely
   hard case: a real, unresolved question with zero remaining budget. This
   experiment has not yet had to answer "what do you actually do then,"
   and should not claim the timeboxing rule is fully validated until it
   does.
2. **Step 4's "concrete enough to scope as a Basic task" test remains
   exactly as unoperationalized as it was after Iteration 1** — three
   spikes in a row have needed this judgment call (spike-1's reaper-porting
   shape, spike-2's docstring-fix shape) and none has produced disconfirming
   or confirming evidence sharp enough to turn it into a checkable rule.
   This is a genuine, stable gap, not something this iteration closed.
3. **Reusability remains asserted, not demonstrated**, even after this
   iteration's explicit classification pass — writing down "90-95%
   universal" is a real, useful structural artifact, but it is still this
   experiment checking its own homework; a true test would require applying
   the procedure to something outside epicd.

### Learnings

1. **A boundary-case spike is more informative when it produces layered
   ambiguity (a clean main answer plus a genuinely disputed emergent one)
   than when it produces uniform ambiguity throughout** — the layering
   itself is what exposed the procedure's scope-assumption gap; a uniformly
   murky spike might have just produced "unclear, defaulted to KILL" without
   revealing *why* the default's scope assumption was too narrow.
2. **"The procedure and my gut agreed" is not sufficient evidence that a
   verdict is uncontested** — this iteration's most important honesty
   check was explicitly asking "would a differently-weighted reasonable
   reader disagree," independent of whether my own gut agreed with the
   mechanical output. Future spikes should keep asking this even on
   apparently-clean cases, not just on ones that feel hard in the moment.
3. **Revising a rule from friction, rather than from imagining what a
   "complete" rule should cover, keeps changes small and traceable** — both
   v2 changes this iteration are single, targeted additions with a named
   source spike, not a rewrite; this discipline, carried from Iteration 1,
   continues to keep the methodology's growth honest and falsifiable.

### Insights for Methodology

1. **Iteration 3's single most valuable remaining lever for V_meta is a
   cheap, bounded reusability check** — actually attempting to apply
   `kill-promote-procedure-v2.md` to a hypothetical non-epicd spike, to see
   if any epicd-specific assumption is silently smuggled into steps that
   claim to be universal. This does not require a whole new real epicd
   spike and could close a meaningful chunk of the remaining reusability
   gap cheaply.
2. **The self-referential-validation residual (Priority 4, meta layer) may
   be a permanent, honest feature of this experiment's design, not a
   closeable gap** — Iteration 3 should explicitly decide whether to accept
   this as a disclosed limitation at convergence rather than trying to
   force the validation score upward through more internal citation, which
   would not actually address what the component is meant to measure.

---

## 10. Conclusion

Iteration 2 achieved its stated purpose: it deliberately selected and ran a
3rd real spike expected to sit near the kill/promote boundary, and that
spike delivered genuine stress on both halves of the v1 methodology — the
tool-call ceiling was reached for the first time (12 of 12), and the
kill/promote procedure's ambiguity default fired for the first time,
surfacing a real gap (an emergent question the declared done-bar didn't
anticipate, where the default's conservative KILL bias could plausibly
suppress a legitimate PROMOTE). This was recorded honestly, including an
explicit, undisguised note that a reasonable alternative reader could
disagree with my own verdict, even though my own gut agreed with the
mechanical output. Both principle files were revised to v2 with small,
precisely-targeted, evidence-traced changes — not a rewrite — and both
still honestly disclose what remains open (most importantly, the
ceiling-reached-before-done-bar-resolved case, still untested after 3
spikes). The required universal-vs-epicd-specific split was produced,
finding both rules roughly 90-95% domain-neutral, with the epicd-specific
residue precisely named rather than left vague.

Both value layers show substantial gains of similar magnitude to Iteration
1's (V_instance: 0.52 → 0.70; V_meta: 0.42 → 0.60), with V_instance now
close to its 0.80 target and V_meta somewhat further behind, consistent
with Iteration 1's own prediction that meta-layer components (reusability,
effectiveness) would lag the instance layer's more mechanically-driven
gains (instance count, ceiling-testing).

**Key Metrics**:
- **Real spikes completed**: 3 cumulative (meets the formula's own 3+
  full-credit bar for `instance_count_confidence`).
- **Kill/promote verdicts with named, ordered rationale**: 3 spikes, 4
  total verdicts (1 KILL, 1 PROMOTE, 1 clean KILL + 1 ambiguity-default
  KILL-with-disclosed-tension) — the richest verdict-shape diversity yet.
- **Timeboxing ceiling fidelity**: 12/12 tool calls used for the first
  time (real pressure), though coincident with, not preceding, done-bar
  resolution.
- **Ambiguity default (step 5) exercised**: yes, for the first time,
  honestly recorded including a disclosed procedure/reasonable-alternative
  tension.

**Value Functions**:
- **V_instance(s_2) = 0.70** (87.5% of target, Δ +0.18 from s_1).
- **V_meta(s_2) = 0.60** (75% of target, Δ +0.18 from s_1).

**Key Insight**: The v1 procedure's ambiguity default is real and does what
it says (defaults conservatively to KILL under genuine ambiguity), but this
iteration's evidence shows that default has a known, disclosed cost — it
can suppress a legitimate PROMOTE when the ambiguity is about *whether the
main question is even the right question*, not just about whether the
main question's answer is clear. v2's emergent-question split is a direct,
targeted fix for exactly this failure mode, not a general hardening pass.

**Critical Decision**: Applied v1 literally to spike-2 before revising
anything, exactly as Iteration 1 did with spike-1 — the emergent-question
finding and the resulting v2 split were extracted *after* observing v1's
literal behavior produce a disclosed tension, not designed in advance to
avoid it.

**Next Steps**: Iteration 3 should (a) close the reusability gap cheaply via
a bounded hypothetical non-epicd application check rather than a whole new
real spike; (b) explicitly decide whether the self-referential-validation
residual should be accepted as a permanent, disclosed limitation at
convergence; (c) decide, based on genuine remaining doubt (not by default),
whether the still-untested "ceiling before done bar resolves" edge needs a
small targeted 4th spike or can be reasoned through; (d) run the full
convergence check rigorously — dual convergence is plausible but not
guaranteed, and Iteration 3 must not force it if the evidence doesn't
support it.

**Confidence**: Medium-High for Iteration 3 reaching or coming close to
dual convergence — the remaining gaps are specific, named, and mostly
bounded (a cheap reusability check; an honest decision about a residual
validation gap), consistent with the experiment's own 3-5 iteration plan —
but the meta-layer gap (0.20 remaining) is large enough that a 4th,
tightly-scoped gap-closure iteration remains a real possibility, not a
foregone conclusion either way.

---

**Status**: ✅ Boundary-case spike run and stress-tested v1 methodology
under real pressure for the first time; ambiguity default exercised and its
known cost disclosed honestly; v2 methodology revised with two small,
evidence-traced changes; universal-vs-epicd-specific split produced; both
value layers show substantial, honestly-scored gains, with V_instance now
close to target and V_meta further behind but with a bounded path forward.
**Next**: Iteration 3 — Consolidate, Validate Transferability, Check Dual
Convergence.
**Expected Duration**: 60-90 minutes (per ITERATION-PROMPTS.md).
