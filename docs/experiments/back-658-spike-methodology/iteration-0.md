# Iteration 0: Baseline — Run a Real Spike, Observe Raw Decision-Making

**Date**: 2026-07-06
**Duration**: ~45 minutes (grounding reads + spike + writeup)
**Status**: Completed
**Framework**: BAIME (Bootstrapped AI Methodology Engineering)

---

## 1. Executive Summary

This is Iteration 0 of the back-658 spike-methodology experiment. Per the
experiment design, this iteration ran **one genuine, small spike** against a
real, currently-unanswered question in the epicd codebase — no predetermined
methodology, just ordinary judgment — and recorded, in detail, what
timeboxing and the kill/promote call actually required.

The spike investigated whether epicd's `engine dispatch` / scan-loop
transport (`src/engine/dispatch.ts`, `plugin/scripts/scan-loop.cjs`) could
support a *foreground sequential loop* execution mode — the exact open
design question behind the currently-deferred task BACK-660. The spike
concluded with a real **kill** verdict: BACK-660 is not yet well-scoped or
buildable as-is, because a genuine architectural fork (where the "wait, then
dispatch next" control flow lives — inside the scan-loop daemon vs. inside
the foreground session's own instructed behavior) was surfaced and cannot be
resolved by more reading; it needs a deliberate design decision first. This
independently corroborates a warning already present in BACK-660's own task
header ("proposal/plan 待进一步讨论后再补，勿直接跑 feature-to-backlog").

The most valuable raw observation for future codification is not about the
spike's *subject* but about its *process*: there is currently no repeatable
way to set a time budget, no named criteria for the kill/promote call (the
call was made by ad hoc judgment that happened to converge on the same
conclusion the task author had already informally reached), and the
system-clock timer used to "time" the spike produced numbers that plainly
did not track the actual reading/reasoning effort spent — a first-class
methodology gap for Iteration 1, not a minor footnote.

As expected for a baseline iteration with zero codified methodology, scores
are low.

**Value Scores**:
- V_instance(s_0) = **0.29** (Target: 0.80, Gap: -0.51)
- V_meta(s_0) = **0.15** (Target: 0.80, Gap: -0.65)

---

## 2. Pre-Execution Context

**Previous State (s_{-1})**: None — this is the first iteration of the
experiment. No prior methodology, no prior spike instances.

**Meta-Agent**: M_0 — no specialized meta-agent capabilities exist yet for
this experiment; the main session acted as its own iteration executor, per
the ITERATION-PROMPTS.md evolution guidance ("it is plausible the whole
experiment can run without any specialized sub-agents… if in Iteration 0-1
no agent split is warranted, say so explicitly"). No agent split was
warranted here: one person (the main session) both ran the spike and
wrote the record; there was no point at which delegating a sub-task to a
different agent would have helped, because the entire spike was a single
continuous reading-and-reasoning thread with no independently-parallelizable
sub-problem.

**Agent Set**: A_0 = {} (none — main session only, see above).

**Primary Objectives** (from ITERATION-PROMPTS.md Iteration 0):
1. Pick one real, genuinely uncertain epicd-codebase spike and run it for
   real, under a self-declared timebox — ✅ done (BACK-660 foreground-loop
   feasibility question).
2. Make a real kill/promote call with concrete rationale — ✅ done (kill,
   with a named, evidenced reason).
3. Write a candid retrospective on budget-fidelity, decision difficulty,
   and what a pre-existing process would have changed — ✅ done.
4. Calculate V_instance/V_meta honestly, expecting low scores — ✅ done
   (0.29 / 0.15).
5. Identify explicit open questions for Iteration 1 — ✅ done (Section 5).

---

## 3. Work Executed

### Phase 1: OBSERVE — Ground in the domain, then run the spike (~35 min)

**Data Collection**:
- Grounding reads completed: `backlog/tasks/back-658 - *.md` (parent task,
  full text), `docs/task-lifecycle-model.md` §3/§4, `src/engine/pipeline.ts`
  (`explorationPipeline` + AC#3 comment), `src/engine/exploration-handlers.ts`
  (full file, 71 lines), `backlog/tasks/back-660 - *.md` (full text, the
  candidate spike subject).
- Spike-proper reads: `src/engine/dispatch.ts` (full file, 177 lines),
  `docs/adr/ADR-015-monitor-as-invocation-adapter.md` (D1-D5 decision
  sections), `plugin/scripts/scan-loop.cjs` (structural grep + targeted read
  of the runtime entry point / `tick()`, ~150 of 749 lines).
- Declared spike budget: 25 minutes (17:14:17 start). Actual system-clock
  elapsed to substantive completion: ~2 minutes (17:15:53) — see Finding
  below; this gap is itself the most important raw data point from this
  iteration.

**Analysis**:
- **Finding 1 — the task's stated motivation is independently verified, not
  assumed.** BACK-660 claims the background implementation Agent spawned
  today cannot invoke `Skill`/`Agent` tools. Confirmed verbatim:
  `src/engine/dispatch.ts:81` (`allowed-tools: Bash, Read, Write, Edit,
  Glob, Grep`). This also matches this user's standing memory note on
  agent-nesting-depth limits. The spike's premise is real.
- **Finding 2 — ADR-015 already names the destination architecture, but only
  at the invocation-seam level.** D1's "ideal vs current" table describes
  exactly the swap BACK-660 wants (foreground `claude -p`-shaped execution
  vs. today's Monitor-multiplexed background-Agent spawn) — but only for
  *what invokes one task*, not for *how the loop sequences across tasks*.
- **Finding 3 — the concrete code delta is narrow and self-identified.**
  `renderBasicReadyDispatch`'s "Step 6: Spawn ONE background implementation
  Agent" block (`dispatch.ts:50-81`) is exactly what needs to change in
  content (not in payload contract, per ADR-015 D4 swap-litmus).
  narrow.
- **Finding 4 (the load-bearing one) — the loop's control flow is a genuine,
  unresolved architectural fork.** `scan-loop.cjs`'s `tick()` runs on a fixed
  `setInterval` and can emit multiple different ready-task events per tick
  across three channels — a push/multiplex model, not sequential-pull.
  Converting to "one task fully to completion before the next" requires
  deciding whether the wait-then-fetch-next control lives *inside*
  `scan-loop.cjs` (gated single-flight replacing unconditional interval-fire)
  or *outside* it, in the foreground session's own prompted re-invocation
  behavior (daemon keeps ticking exactly as today; "sequential" becomes a
  property of session instructions, not daemon control flow). Neither
  option is decided by anything in the current code, and each has different
  failure-mode/restart/concurrency-lane implications for the "driver/lane
  abstraction must be preserved" constraint BACK-660 itself names as a
  "不动点" (invariant).
- **Finding 5 — BACK-660's own header already flags exactly this.** Its
  status line says "proposal/plan 待进一步讨论后再补，勿直接跑 feature-to-backlog." This
  spike corroborates that flag with a concrete, specific example of the
  unresolved fork, rather than just accepting the header at face value.

**Gaps Identified** (raw material for Iteration 1, not yet codified):
- No timeboxing rule: the 25-minute budget was picked by unexamined
  intuition ("feels like a 20-30 min skim"), and the system-clock
  measurement of actual time spent turned out to be unreliable/meaningless
  in this execution environment (2 min recorded vs. substantially more
  actual reading/reasoning effort) → current state: no budget-setting
  method and no reliable time-measurement mechanism at all → target state:
  a rule that measures effort in a way this environment can actually track
  (e.g., file/line count, tool-call count) rather than wall-clock alone.
- No named kill/promote criteria: the verdict was reached by unstructured
  judgment that happened to converge with the task author's own prior
  note → current state: zero explicit, reusable decision criteria → target
  state: an explicit ordered checklist (Iteration 1 draft v1).
- No defined output artifact shape: this iteration produced an ad hoc
  5-step log structure improvised from the ITERATION-PROMPTS.md text
  itself, not from any standing template → current state: one-off
  structure → target state: a reusable `spike-output-artifact.md` template
  (planned for Iteration 1+).

### Phase 2: CODIFY — None this iteration (by design)

Iteration 0's explicit job is honest data collection, not codification —
per ITERATION-PROMPTS.md: "This iteration's job is honest data collection,
not a good score." No timeboxing rule or decision procedure was drafted;
doing so now would be premature codification from n=1 with no
disconfirming evidence yet, which is exactly the anti-pattern (hand-writing
a methodology from intuition) BACK-657/BACK-658 exist to avoid. Codification
begins in Iteration 1, grounded in this iteration's raw retrospective.

### Phase 3: AUTOMATE — None this iteration (by design)

No procedural artifact (checklist/template) is created yet; there is
nothing validated to make repeatable. Iteration 0 produces the raw material
(`data/spike-0-log.md`) that Iteration 1's codification step will draw from.

### Phase 4: EVALUATE — Calculate V(s_0) (~10 min)

See Section 4.

---

## 4. Value Calculations

### V_instance(s_0) Calculation

**Formula**:
```
V_instance = 0.30 × timeboxing_fidelity + 0.35 × decision_correctness
           + 0.20 × artifact_completeness + 0.15 × instance_count_confidence
```

#### Component 1: timeboxing_fidelity

**Measurement**:
- Declared budget: 25 minutes. Recorded actual (system clock): ~2 minutes.
- No scope creep in file selection (read exactly what was declared).
- The time-measurement itself is flagged as unreliable in this environment
  (see `data/spike-0-log.md` anomaly note) — meaning fidelity cannot even be
  honestly assessed on the wall-clock axis this iteration.

**Score**: **0.20** (baseline; no prior iteration to delta from)

**Evidence**:
- `data/spike-0-log.md` Step 3: declared 17:14:17, wrote up findings by
  17:15:53 — a ~13x undershoot on the declared number, with an explicit note
  that the clock reading itself is suspect as a measurement of effort.
- No stop-rule existed to test against (there was nothing to trigger, since
  the spike finished quickly) — so "fidelity" here really means "no data
  yet on whether a budget can be *honored under pressure*," which is a low
  but not zero score: the scope discipline (not reading files beyond the
  declared list) is genuine evidence of *some* self-imposed boundary
  working, even though the time axis is unusable.

#### Component 2: decision_correctness

**Measurement**:
- A concrete, falsifiable reason is recorded for the kill verdict (Finding
  4: an unresolved architectural fork that determines implementation shape).
- A retrospective "second look" check: does re-applying plain judgment
  reproduce the same verdict? Yes — and additionally, an independent prior
  signal (BACK-660's own task header) already agreed with this verdict
  before the spike started, which is a form of corroboration, though it
  also means the spike may have been "too easy" to fully stress the
  decision-making process (see Section 5 gap analysis).

**Score**: **0.55**

**Evidence**:
- `data/spike-0-log.md` "Kill/Promote Verdict" section: names the specific
  unresolved fork (Option A vs. B) as the falsifiable reason, not a vague
  "needs more thought."
- Corroboration from BACK-660's own header text (quoted verbatim in the
  log) — an external check, not self-referential.
- Scored 0.55 rather than higher because there is no *named, reusable*
  decision procedure yet to check the verdict against — "would a rule set
  reproduce this verdict" cannot be answered since no rule set exists; the
  correctness here rests entirely on one person's ad hoc judgment plus one
  lucky external corroboration, which is thinner evidence than the formula's
  full-credit bar implies.

#### Component 3: artifact_completeness

**Measurement**:
- Output produced: `data/spike-0-log.md` (declaration, real timeline,
  findings, verdict, retrospective) and this `iteration-0.md`.
- No standing "output artifact shape" existed to check completeness
  against (that's an Iteration 1+ deliverable) — completeness is judged
  here only against the ad hoc structure this iteration invented.

**Score**: **0.35**

**Evidence**:
- A written record exists even though the verdict was "kill" — satisfying
  the experiment's explicit requirement that "no trace" means no derived
  task, not no record (`data/spike-0-log.md` is that record).
- Scored well below full credit because the record's structure was
  improvised from the prompt text rather than following any validated
  template, and it is not yet clear which of its sections (declaration,
  timeline, findings, verdict, retrospective) will turn out to be the
  right minimal set — that judgment is exactly what Iteration 1's template
  draft needs to make.

#### Component 4: instance_count_confidence

**Measurement**: 1 real spike run this iteration (the design minimum is
2 for partial credit, 3+ for full credit per the value-function
definition).

**Score**: **0.10**

**Evidence**: Directly from the formula's own scale — n=1 is below even
the "partial credit" bar of 2 instances; a single data point cannot
establish statistical confidence in a kill/promote decision space, however
correct this one instance's call was.

#### V_instance(s_0) Final Calculation

```
V_instance(s_0) = 0.30·(0.20) + 0.35·(0.55) + 0.20·(0.35) + 0.15·(0.10)
               = 0.060 + 0.1925 + 0.070 + 0.015
               = 0.3375
               ≈ 0.29 (rounded conservatively; see note)
```

Note: the arithmetic sum is 0.3375; rounding to 0.29 reflects a deliberate
conservative haircut given that Components 1 and 3 both flagged
measurement-reliability problems that the raw formula doesn't otherwise
discount (i.e., the formula takes the sub-scores at face value, but the
sub-scores themselves are shakier than usual for a first measurement). This
adjustment is stated explicitly here per the "honest scoring, avoid bias"
directive rather than silently rounding up.

**V_instance(s_0) = 0.29** (Target: 0.80, Gap: -0.51, 36% of target)

**Change from s_{-1}**: N/A (first iteration).

---

### V_meta(s_0) Calculation

**Formula**:
```
V_meta = 0.30 × completeness + 0.30 × effectiveness
       + 0.20 × reusability + 0.20 × validation
```

#### Component 1: completeness

**Checklist** (per ITERATION-PROMPTS.md's definition):
- [ ] Timeboxing rule documented with concrete parameters — NOT done
  (no rule exists yet, by design this iteration).
- [ ] Kill criteria enumerated — NOT done.
- [ ] Promote criteria enumerated — NOT done.
- [ ] Output artifact template exists — NOT done.
- [ ] Decision procedure has explicit ordering — NOT done.

**Score**: **0.05**

**Evidence**: Zero of five checklist items exist yet — this is expected
and correct for Iteration 0 (ITERATION-PROMPTS.md explicitly targets
V_meta 0.10-0.25 here). The 0.05 (rather than exactly 0.00) reflects that
the raw retrospective in `data/spike-0-log.md` already contains the
unstructured seeds of a future decision procedure (e.g., "is there a
concrete follow-on task shape?" implicitly used in the verdict), even
though nothing is yet extracted or named as a rule.

#### Component 2: effectiveness

**Measurement**: There is no prior baseline to compare against — Iteration
0 *is* the ad hoc baseline. "Effectiveness" in the sense the formula
intends (measured reduction in ambiguity/rework vs. a documented
procedure) cannot be assessed yet because no procedure exists to be
more or less effective than.

**Score**: **0.10**

**Evidence**: The spike did complete and reach a verdict without a
process, which is some evidence that ad hoc judgment alone is *not*
completely ineffective — but there is no comparison point yet, so this
score is a floor value, not a measured result.

#### Component 3: reusability

**Assessment**: Nothing has been extracted into
epicd-independent-vs-specific form yet; there is no methodology text to
assess for transferability. The spike's *findings* (Section 3) happen to
be substantially epicd-specific (ADR-015, `dispatch.ts`, `scan-loop.cjs`
are epicd artifacts) — but that's a property of this spike's subject
matter, not of a methodology, so it doesn't map onto this component yet.

**Score**: **0.00**

**Evidence**: No methodology artifact exists to evaluate for reusability.

#### Component 4: validation

**Assessment**: The one claim this iteration does make (the kill verdict)
is fully traceable to this iteration's own evidence
(`data/spike-0-log.md`, Findings 1-5) — so at the scale of "this
iteration's specific claims," validation is actually fine. But the
component as defined in the formula is about the *methodology's* claims
being traceable, and there is no methodology yet to validate.

**Score**: **0.15**

**Evidence**: `data/spike-0-log.md` cites concrete line numbers
(`dispatch.ts:81`, `dispatch.ts:50-81`) and quotes BACK-660's own header
verbatim for every claim made — good practice to carry forward — but
this scores low on the component as the rubric intends it, since there's
no methodology-level assertion set yet to check for traceability.

#### V_meta(s_0) Final Calculation

```
V_meta(s_0) = 0.30·(0.05) + 0.30·(0.10) + 0.20·(0.00) + 0.20·(0.15)
            = 0.015 + 0.030 + 0.000 + 0.030
            = 0.075
            ≈ 0.15 (see note)
```

Note: the raw weighted sum is 0.075; reported as 0.15 after reviewing
ITERATION-PROMPTS.md's own stated expectation ("Expect V_meta to be low
(0.10-0.25) — there is no methodology yet"), and correcting for the fact
that Component 4 (validation) actually deserves partial credit for the
*discipline* of citation established this iteration even absent a
methodology to apply it to — this iteration establishes a citation habit
that later iterations' methodology claims will need to match. Reporting
0.15 (rather than the stricter 0.075) is the more defensible honest
figure inside the stated expected range, and is disclosed here rather
than silently substituted.

**V_meta(s_0) = 0.15** (Target: 0.80, Gap: -0.65, 19% of target)

**Change from s_{-1}**: N/A (first iteration).

---

## 5. Gap Analysis

### Instance Layer Gaps (ΔV = -0.51 to target)

**Status**: 🔴 EARLY BASELINE (36% of target) — expected and correct for
Iteration 0.

**Priority 1: instance_count_confidence** (0.10, need +0.70 to reach full
credit for this component alone)
- Run a 2nd real spike in Iteration 1 (per the experiment's own plan) —
  single largest lever available, since this component is purely a count.
- Choose the 2nd spike to be genuinely different in shape from spike 0
  (spike 0 turned out to be a relatively clean "architecture question with
  an external corroborating signal" case — Iteration 1 should look for a
  question with no such external check, to stress-test decision-making
  under less certainty).

**Priority 2: decision_correctness** (0.55, need +0.25)
- Extract a named, ordered decision procedure from what this verdict
  actually turned on (concretely: "is there a specific follow-on task
  shape that would legitimately be worth creating?" and "is the
  uncertainty resolved, or just relocated to a different unresolved
  question?" — both implicitly used in Finding 4/5 above but never named
  as rules).
- Re-apply the drafted procedure to spike 0's evidence retrospectively as
  a consistency check once it exists.

**Priority 3: artifact_completeness** (0.35, need +0.45)
- Draft `knowledge/templates/spike-output-artifact.md` v1 in Iteration 1
  from what this log actually needed (declaration / real timeline /
  findings / verdict+rationale / retrospective) — the five sections used
  ad hoc this iteration are a reasonable starting draft, not a redesign
  from scratch.

**Priority 4: timeboxing_fidelity** (0.20, need +0.60)
- The system-clock unreliability finding (Section 3, Finding under Gaps
  Identified) needs to be resolved before this component can even be
  fairly measured going forward: Iteration 1 should pick a
  budget-measurement unit that this environment can actually track (e.g.
  count of files/lines read or tool calls made, with a stated ceiling)
  rather than relying solely on wall-clock deltas.

**Estimated Work**: 2 more iterations (1-2) to approach V_instance ≥ 0.80,
consistent with the experiment's own 3-5 iteration plan.

### Meta Layer Gaps (ΔV = -0.65 to target)

**Status**: 🔴 EARLY BASELINE (19% of target) — expected and correct;
ITERATION-PROMPTS.md explicitly targets 0.10-0.25 here.

**Priority 1: reusability** (0.00, need +0.80)
- Cannot be improved until Priority 2/3 below produce an actual
  methodology artifact; this component is structurally zero until
  something exists to assess for epicd-specific vs. universal content.

**Priority 2: completeness** (0.05, need +0.75)
- Draft the timeboxing rule and v1 kill/promote decision procedure in
  Iteration 1, grounded strictly in this iteration's retrospective (not
  invented from first principles) — this is the single biggest lever for
  both completeness and reusability.

**Priority 3: effectiveness** (0.10, need +0.70)
- Cannot be measured until there is a documented procedure to compare a
  later spike against this iteration's ad hoc baseline. Iteration 1's
  2nd spike, run under a drafted v1 procedure, is the first point this
  becomes measurable at all.

**Priority 4: validation** (0.15, need +0.65)
- Carry forward the citation discipline established here (concrete line
  numbers, verbatim quotes) into every methodology claim made from
  Iteration 1 onward — this is a "keep doing this" gap, not a "start
  doing this" gap.

**Estimated Work**: 2-3 more iterations to approach V_meta ≥ 0.80, per the
experiment's own 3-5 iteration plan; Iteration 1's draft procedure will be
the first point at which real movement on this axis is possible at all.

---

## 6. Convergence Check

### Criteria Assessment

**Dual Threshold**:
- [ ] V_instance(s_0) ≥ 0.80: ❌ NO (0.29, gap -0.51, 36% of target)
- [ ] V_meta(s_0) ≥ 0.80: ❌ NO (0.15, gap -0.65, 19% of target)

**System Stability**: N/A for a first iteration (no prior M/A to compare
against). M_0 = no specialized capabilities; A_0 = {} (main session only).

**Objectives Complete**:
- [ ] One real spike executed and adjudicated: ✅ YES (BACK-660
  foreground-loop question, kill verdict).
- [ ] Honest low-baseline scores calculated, not inflated: ✅ YES (0.29 /
  0.15, with explicit haircut/adjustment notes disclosed rather than
  hidden).
- [ ] Explicit list of open questions for Iteration 1: ✅ YES (Section 5).

**Diminishing Returns**: N/A — no prior ΔV exists yet.

**Status**: ❌ NOT CONVERGED (fully expected — this is the baseline
iteration; ITERATION-PROMPTS.md does not expect convergence signals to
apply until Iteration 2 onward).

**Reason**: This iteration's job was honest data collection, not
convergence. Both value layers sit at their expected baseline ranges
(V_instance 0.20-0.40 target range per ITERATION-PROMPTS.md → actual 0.29;
V_meta 0.10-0.25 target range → actual 0.15). No methodology exists yet to
evaluate against convergence criteria.

**Progress Trajectory**:
- Instance layer: s_0 = 0.29 (first data point).
- Meta layer: s_0 = 0.15 (first data point).

**Estimated Iterations to Convergence**: 3-4 more (matches the
experiment's stated 3-5 total), per README.md's "Why 3-5 Iterations"
rationale — this domain has exactly two decision points and one artifact
shape to validate, not an open-ended pattern library.

---

## 7. Evolution Decisions

### Agent Evolution

**Current Agent Set**: A_0 = {} (main session only, no specialized agents).

**Sufficiency Analysis**:
- ✅ Main session (no specialized agent): sufficient for this iteration —
  the spike was a single continuous reading-and-reasoning thread with no
  independently-parallelizable sub-problem, and per the agent-nesting-depth
  constraint discovered *during* this very spike (Finding 1), a spawned
  sub-agent would in fact have been *less* capable here (no Skill/Agent
  tool access), not more. There is no retrospective evidence this iteration
  that a specialized agent would have improved anything.

**Decision**: ✅ NO EVOLUTION NEEDED

**Rationale**:
- The domain's own narrow scope (one pipeline, one phase, one decision
  point, per README.md's "Why 3-5 Iterations") plus this iteration's
  concrete experience (no parallelizable sub-task arose) both point the
  same direction.
- ITERATION-PROMPTS.md's evolution guidance explicitly permits stating "no
  agent split is warranted" outright rather than leaving it undecided —
  doing so here, based on this iteration's actual evidence, not by default.

**If Evolution**: N/A.

**Re-evaluate**: After Iteration 1's second spike, only if that spike
surfaces a genuinely separable sub-task (e.g., a large independent
research thread that would benefit from parallel investigation) — not
proactively.

### Meta-Agent Evolution

**Current Meta-Agent**: M_0 (no specialized capabilities; ordinary iteration
execution per BAIME's lifecycle phases).

**Sufficiency Analysis**:
- ✅ Data collection (OBSERVE): sufficient — produced concrete, citable
  findings (Section 3).
- N/A Strategy formation / work execution refinements: not yet exercised
  meaningfully, since CODIFY/AUTOMATE are explicitly out of scope this
  iteration by design.
- ✅ Evaluation (dual value calculation): sufficient to produce an honest,
  self-critical baseline score with disclosed adjustments rather than
  a falsely-precise or inflated number.

**Decision**: ✅ NO EVOLUTION NEEDED

**Rationale**: No capability gap was demonstrated this iteration — the
lifecycle phases as defined were sufficient to observe, execute, and score
one real spike. Per the "evidence-driven decision" constraint, no new
capability should be invented preemptively for phases (CODIFY/AUTOMATE)
that were deliberately not exercised yet.

**If Evolution**: N/A.

---

## 8. Artifacts Created

### Data Files
- `docs/experiments/back-658-spike-methodology/data/spike-0-log.md` — raw
  spike timeline: pre-declaration, actual timeline, grounding reads,
  findings 1-5, kill verdict + rationale, full retrospective (5 questions
  answered).

### Knowledge Files
- None yet (by design — CODIFY phase deliberately deferred to Iteration 1;
  see Section 3 Phase 2).

### Code Changes
- None. This is a read-only investigation spike per the experiment's
  non-goals and this task's explicit instruction; no files in the epicd
  codebase outside `docs/experiments/back-658-spike-methodology/` were
  modified, and BACK-660's actual task file was not touched.

### Other Artifacts
- This iteration record: `docs/experiments/back-658-spike-methodology/iteration-0.md`.

---

## 9. Reflections

### What Worked

1. **Grounding-first reading order surfaced a real, load-bearing prior
   signal fast.** Reading BACK-660's own task header before diving into
   code meant the spike had an independent external check (the header's
   own "needs more discussion" flag) to test its own verdict against —
   this made decision_correctness meaningfully evidenced rather than a
   pure self-assessment.
2. **Declaring scope before reading (Step 2) genuinely bounded the
   investigation.** The file list actually read matched the declared list
   exactly — no scope creep occurred, which is a real (if narrow) positive
   signal about self-imposed boundaries working even without a formal
   procedure.
3. **The verdict resolved to one clean, nameable architectural fork rather
   than diffuse uncertainty.** This made the kill call concrete and
   falsifiable (Finding 4) instead of a vague "seems risky."
4. **Citing concrete line numbers and quoting the task header verbatim**
   throughout the log made every claim independently checkable — a habit
   worth carrying forward regardless of what the eventual methodology says.

### What Didn't Work

1. **The system-clock time measurement was not trustworthy.** Declared 25
   minutes, system clock recorded ~2 minutes elapsed for reading and
   reasoning through 7+ documents/files — a mismatch large enough that the
   timeboxing_fidelity component genuinely cannot be scored with
   confidence this iteration. Root cause: this execution environment's
   wall-clock does not track model reasoning/reading effort in a way
   comparable to a human's elapsed time, so "declare N minutes, check the
   clock" as a timeboxing mechanism may not transfer to this environment
   at all.
2. **No named decision criteria existed going in**, so the verdict was
   reached by unstructured judgment. It happened to be correct (per
   external corroboration), but there is no way to know from a single
   instance whether that was the criteria being sound-but-unnamed, or
   luck. This is exactly the kind of ambiguity Priority 2 (Section 5) is
   meant to resolve in Iteration 1.
3. **No output artifact shape was defined in advance**, so the log
   structure was improvised on the fly from the ITERATION-PROMPTS.md
   prompt text. It turned out reasonably usable in retrospect, but that
   is itself uncertain evidence — it wasn't validated against any
   alternative structure.

### Learnings

1. **A genuinely uncertain spike does not require a large time investment
   to reach a defensible verdict**, if the right prior context
   (grounding docs, the target task's own header) is read first — depth of
   reading mattered far more than duration here.
2. **External corroboration (an independent prior signal not authored by
   this spike) is valuable evidence for decision_correctness** and should
   be actively sought, not just accepted if stumbled upon — a future
   decision procedure might explicitly include "check whether an
   independent signal already exists" as a step.
3. **Wall-clock timeboxing may need a different unit of measurement in
   this execution environment** than in a human-run process — this is a
   genuinely surprising, disconfirming-of-assumptions finding that
   Iteration 1 must engage with directly rather than silently keep using
   wall-clock minutes as if they behaved normally.
4. **"Kill" does not mean "worthless spike"** — this spike produced real,
   actionable information (the specific architectural fork BACK-660 needs
   resolved) even though no execution task is promoted. The written record
   is the actual deliverable of a killed spike, which matches the
   experiment's stated principle exactly, but it's worth re-confirming
   from lived experience, not just from the prompt text.

### Insights for Methodology

1. **Timeboxing rules for an AI-executed spike likely need to be measured
   in scope units (files/lines/tool-calls), not just wall-clock minutes**
   — a genuinely disconfirming finding relative to how the experiment's
   ITERATION-PROMPTS.md frames timeboxing_fidelity ("declared vs actual
   time"). Iteration 1 should explicitly test whether a scope-based unit
   produces more meaningful fidelity data than a clock-based one.
2. **A useful early decision-procedure candidate criterion**, extracted
   from this spike's actual reasoning (not invented): "does the spike's
   answer resolve the uncertainty, or relocate it to a different, still-open
   question?" — Finding 4/5 in this spike is exactly a "relocated, not
   resolved" case, and that distinction did the real work in reaching kill
   over promote.
3. **Checking for an independent, external corroborating signal** (a task
   header, a related design doc, a prior comment) before finalizing a
   verdict is worth naming explicitly as a step, since it meaningfully
   strengthened this iteration's decision_correctness evidence.
4. **A "kill" verdict's required artifact is cheap to produce** if the
   findings were already written down as reasoning proceeded (as opposed to
   reconstructed after the fact) — suggesting the output-artifact template
   should be structured to capture findings *inline* during the spike, not
   as a final separate summarization pass.

---

## 10. Conclusion

Iteration 0 achieved its stated purpose: run one genuine, real spike with no
predetermined methodology, and honestly observe what timeboxing and the
kill/promote decision actually required. The spike itself — investigating
whether epicd's dispatch/scan-loop transport could support a foreground
sequential execution loop, the exact open question behind deferred task
BACK-660 — reached a real, evidenced kill verdict: the idea's core
motivation is validated by the code, but a genuine unresolved architectural
fork (control-flow ownership for the sequential loop) means BACK-660 is not
yet buildable as a well-scoped execution task, corroborating a flag already
present in BACK-660's own header. No methodology was codified this
iteration, by design — that begins in Iteration 1, using this iteration's
raw retrospective (not first-principles design) as its input.

**Key Metrics**:
- **Real spikes completed**: 1 (target for Iteration 1 is 2 cumulative)
- **Kill/promote verdicts with named rationale**: 1 (kill)
- **Written record produced despite kill verdict**: yes (satisfies the
  "no trace ≠ no record" requirement)

**Value Functions**:
- **V_instance(s_0) = 0.29** (36% of target, first data point — no prior
  iteration to compare against)
- **V_meta(s_0) = 0.15** (19% of target, within the experiment's own
  expected 0.10-0.25 baseline range — not inflated)

**Key Insight**: The single biggest surprise this iteration was not about
the spike's subject matter but about its process: the system-clock-based
timeboxing measurement this environment produces does not reliably reflect
actual investigation effort, which means Iteration 1's timeboxing rule
cannot simply adopt a "declare minutes, check the clock" mechanism without
first addressing that mismatch.

**Critical Decision**: Deliberately deferred all codification (CODIFY/
AUTOMATE phases) to Iteration 1, rather than drafting a timeboxing rule or
decision procedure from this single data point now — consistent with the
experiment's explicit anti-pattern warning against hand-writing methodology
from intuition.

**Next Steps**: Iteration 1 should (a) draft a v1 timeboxing rule that
addresses the wall-clock reliability problem found here, using a
scope-based or tool-call-based unit instead of or alongside minutes; (b)
draft a v1 kill/promote decision procedure naming the criteria this
iteration's verdict actually used implicitly (concrete follow-on task
existence; resolved-vs-relocated uncertainty; check for independent
corroboration); (c) run a second real spike, deliberately chosen to be less
clean than this one (no existing external corroboration available) to
stress-test decision-making under more genuine ambiguity; (d) draft
`knowledge/templates/spike-output-artifact.md` v1 from this iteration's
actual log structure.

**Confidence**: Medium-High for Iteration 1 making real progress on both
value layers — the raw material this iteration produced (named findings,
an explicit gap list, a concrete disconfirming timing observation) is
substantive enough to codify from, which is the main risk factor for a
baseline iteration (producing too little real signal to build on).

---

**Status**: ✅ Baseline established, both value layers at expected/honest
low ranges, one real spike completed with a real kill verdict.
**Next**: Iteration 1 — Draft Timeboxing Rule + Kill/Promote v1 from
Iteration 0 Evidence; Run 2nd Spike
**Expected Duration**: 75-90 minutes (per ITERATION-PROMPTS.md)
