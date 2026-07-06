# Iteration Prompts: Spike/Exploration Methodology

**Experiment**: back-658-spike-methodology
**Objective**: Develop and validate a methodology for scoping, timeboxing,
executing, and adjudicating (kill vs promote) exploration/spike tasks in
epicd's task pipeline.
**Target**: V_instance ≥ 0.80, V_meta ≥ 0.80, proven against ≥2-3 real spikes,
converge in 3-5 iterations.

**Grounding documents to read before Iteration 0** (all iterations):
- `backlog/tasks/back-658 - *.md` (parent task, full text — background,
  goals, non-goals)
- `docs/task-lifecycle-model.md` §3 (exploration pipeline) and §4 (status/role
  as projection, `provenance.spawned_from` vs `parent_id`)
- `src/engine/pipeline.ts` (`explorationPipeline` + the AC#3 comment block
  explaining why kill/promote is a data+handler decision, not a new phase)
- `src/engine/exploration-handlers.ts` (`SpikeVerdict`, `SpikeRunner`,
  `makeExplorationWorktreeOps`, `PromoteToExecution`, `makeStorePromoter`)
- `src/test/exploration-pipeline.test.ts` (how kill/promote is currently
  tested — the *mechanical* seam, not the methodology)

---

## Value Function Definitions

### V_instance(s) — methodology proven in practice

```
V_instance = 0.30 × timeboxing_fidelity
           + 0.35 × decision_correctness
           + 0.20 × artifact_completeness
           + 0.15 × instance_count_confidence
```

- **timeboxing_fidelity**: across all spikes run, did the actual budget
  match the declared budget within a documented tolerance, and was
  scope-creep-if-any caught and stopped rather than silently absorbed?
  Evidence: per-spike declared vs actual time, explicit stop/continue notes.
- **decision_correctness**: for each spike's kill/promote call, is there a
  concrete, falsifiable reason recorded, and does a second look (by you,
  retrospectively, or by re-applying the current-iteration decision
  procedure) reach the same verdict? Evidence: decision rationale text +
  a "would the current rule set reproduce this verdict" check.
  Note: for a "promote" verdict, correctness is checked against whether a
  real execution task *would legitimately be worth creating*
  (`provenance.spawned_from` semantics) — you do not have to actually
  create it in the live backlog for this experiment's evidence, but you
  must state precisely what that follow-on task would be.
- **artifact_completeness**: does each spike, regardless of verdict, leave
  behind the defined output artifact shape (see Iteration 1+ objective)? A
  "kill" with zero written record fails this component even if the verdict
  itself was right — "no trace" is a pipeline-mechanics statement (no
  derived task), not a license to leave no evidence trail.
- **instance_count_confidence**: 2 real spikes = partial credit, 3+ = full
  credit for this component (statistical confidence in a 2-scenario
  decision space is inherently thin; a 3rd instance that lands in the
  "hard" middle of the kill/promote spectrum is worth more than a 4th easy
  one).

### V_meta(s) — methodology quality (rubric-based, per BAIME dual-value-functions)

```
V_meta = 0.30 × completeness
       + 0.30 × effectiveness
       + 0.20 × reusability
       + 0.20 × validation
```

- **completeness** (checklist): timeboxing rule documented with concrete
  parameters (not "timebox appropriately" — an actual default budget +
  escalation rule) / kill criteria enumerated / promote criteria enumerated
  / output artifact template exists / decision procedure has explicit
  ordering (what's checked first, what breaks ties).
- **effectiveness**: does using the documented procedure measurably reduce
  ambiguity or rework versus the Iteration 0 baseline (which has no
  procedure)? Evidence: compare Iteration 0's ad-hoc decision process
  (time spent deliberating, false starts) against later iterations using
  the drafted procedure.
- **reusability**: what fraction of the documented procedure is genuinely
  epicd-independent (i.e., would transfer to "how do I run a timeboxed
  spike and decide whether to build on it" in any codebase) versus
  epicd-specific (references to `provenance.spawned_from`,
  `explorationPipeline`, backlog CLI mechanics)? State this split
  explicitly rather than asserting a single aggregate number.
- **validation**: is every claim in the methodology traceable to a specific
  iteration's evidence (which spike, which iteration file, what was
  observed)? A methodology assertion with no traceable iteration source is
  not validated — flag and fix it, don't average it away.

---

## Iteration 0: Baseline — Run a Real Spike, Observe Raw Decision-Making

**Objective**: Run one genuine, small spike against a real epicd unknown
with **no predetermined methodology** — just normal judgment — and observe
in detail what timeboxing and kill/promote actually required. This
iteration's job is honest data collection, not a good score.

**Prompt**:
```
Context: This is Iteration 0 of the back-658 spike-methodology BAIME
experiment. Read the grounding documents listed at the top of this file
in full before starting.

1. Pick ONE real, small, genuine unknown in the epicd codebase to spike on.
   It must be something you don't already know the answer to. Candidates
   to consider (pick whichever is most genuinely uncertain right now, or
   substitute a better one you find while reading the code):
   - Does `provenance.spawned_from` already have a query/index path, or
     would surfacing "which execution tasks came from which spikes" require
     new plumbing?
   - What does `engine promote` (backlog → authoring gate, per
     task-lifecycle-model.md §2) actually require as input shape, and does
     that generalize to spike-promote's `makeStorePromoter` call shape?
   - Is there an existing place in the CLI/web UI that would need to
     change to *display* a spike's kill/promote outcome, or is it fully
     invisible today (adjudicates silently to done)?
   - Any other small, real, currently-unanswered question you notice while
     reading src/engine/exploration-handlers.ts and its test file.

2. Before starting the spike, write down (this is the raw material for
   later codification, not something to make good yet):
   - What you think the scope is.
   - What time budget you're giving yourself, and why that number.
   - What you'd need to observe/learn to call it "done".

3. Run the spike for real. Actually investigate the codebase, actually try
   things if relevant. Timebox yourself to what you declared in step 2 —
   but if you go over, don't hide it: record by how much and why.

4. At the end, make a real kill-or-promote call:
   - Kill: state precisely why no follow-on execution task is warranted.
   - Promote: state precisely what execution task should exist
     (title/shape), even though you will not create it in the live backlog
     for this experiment.

5. Immediately after, write a candid retrospective:
   - Did your declared budget match reality? By how much did it drift and
     why?
   - What made the kill/promote call hard or easy?
   - What information, if you'd had it up front, would have made scoping
     or the verdict faster/more confident?
   - What would you have done differently if someone else's spike
     process/checklist existed?

6. Calculate V_instance(s_0) and V_meta(s_0) honestly using the formulas
   above. Expect V_meta to be low (0.10-0.25) — there is no methodology yet,
   only raw observation. Do not inflate.

7. Identify problems/gaps explicitly: what's genuinely unclear about
   timeboxing, decision criteria, or output shape based on this one data
   point.

Deliverables:
   - iteration-0.md (full BAIME 10-section structure; see
     methodology-bootstrapping skill's iteration-structure-template.md)
   - data/spike-0-log.md (raw timeline: declared budget, actual time,
     scope notes, verdict + rationale, retrospective)

Target time: 60-90 minutes total (spike + writeup).
```

**Expected Output**:
- One real spike executed and adjudicated (kill or promote), with a
  written rationale.
- Honest low baseline: V_instance likely 0.20-0.40 (no repeatable procedure
  yet, only n=1), V_meta likely 0.10-0.25 (nothing codified yet).
- Explicit list of open questions for Iteration 1 (e.g., "budget felt
  arbitrary — what should set it?", "the kill/promote call took most of
  the time deliberating over an implicit criterion I never named").

---

## Iteration 1: Draft Timeboxing Rule + Kill/Promote v1; Run 2nd Spike

**Objective**: From Iteration 0's evidence (not from first-principles
design), draft an explicit timeboxing rule and a v1 kill/promote decision
procedure. Test it immediately against a second real spike.

**Prompt**:
```
Context: Read iteration-0.md and data/spike-0-log.md in full. Read the
grounding documents again if capability files/context have changed.

1. From Iteration 0's retrospective, extract (do not invent from scratch):
   - A timeboxing rule: given what made budget-setting hard/easy in
     iteration 0, propose a concrete default (e.g., a time ceiling
     expressed in wall-clock effort) and an explicit trigger for when to
     stop even if unresolved (a "stop rule", not just a target). Ground
     each parameter in what iteration-0 actually needed, not intuition.
   - A v1 kill/promote decision procedure: enumerate the specific
     questions/criteria iteration 0's rationale actually turned on (e.g.,
     "is there a concrete follow-on task shape?", "does the answer change
     existing plans?", "is the uncertainty resolved or just relocated?").
     Order them (what's checked first).

2. Pick a SECOND real, small, genuine unknown in the epicd codebase
   (different from Iteration 0's, similarly genuine — you must not already
   know the answer). Apply the drafted timeboxing rule and decision
   procedure exactly as written (don't silently improve them mid-spike —
   note friction instead).

3. Run the spike. Record where the v1 procedure worked and where you
   deviated from it or found it ambiguous/insufficient.

4. Make the kill/promote call using the v1 procedure. Record whether the
   procedure's mechanical application matches your independent judgment
   (if they diverge, that's a critical finding — write it down, don't
   paper over it).

5. Draft the output artifact shape (what any spike, kill or promote, must
   leave behind) based on what was actually useful across both spike-0 and
   spike-1's logs — not a theoretical "complete" template.

6. Calculate V_instance(s_1) and V_meta(s_1). Show the delta from Iteration
   0 and what specifically drove it (e.g., "decision_correctness rose
   because verdict now traces to a named, reusable rule instead of ad hoc
   judgment").

7. Gap analysis: where does v1 still fail on ambiguous cases? What
   evidence from spike-1 (not speculation) suggests a 3rd spike is needed
   to stress-test a different part of the decision space (e.g., spike-0/1
   might both have been clear-cut; deliberately pick something closer to
   the kill/promote boundary for Iteration 2 if that gap is real).

Deliverables:
   - iteration-1.md (full 10-section structure)
   - data/spike-1-log.md
   - knowledge/templates/spike-output-artifact.md (draft v1)
   - knowledge/principles/ or knowledge/patterns/ entries for the
     timeboxing rule and decision procedure drafted this iteration

Target time: 75-90 minutes.
```

**Expected Output**:
- Documented v1 timeboxing rule + v1 kill/promote procedure, each traceable
  to specific Iteration 0/1 evidence.
- 2 real spikes completed.
- V_instance ≥ 0.45-0.55, V_meta ≥ 0.35-0.45 (methodology exists but
  single-instance-tested; expect it to still be rough).
- Explicit, evidence-based selection criterion for Iteration 2's 3rd spike
  (should stress a genuinely uncertain part of the decision space, not be
  chosen for convenience).

---

## Iteration 2: Stress-Test on a Hard Case; Refine Decision Procedure; Finalize Artifact Shape

**Objective**: Run a 3rd real spike deliberately chosen to be closer to the
kill/promote boundary (per Iteration 1's gap analysis) to find where v1
breaks, then refine.

**Prompt**:
```
Context: Read iteration-0.md, iteration-1.md, and both spike logs in full.
Re-read capability/knowledge files fresh (this iteration may revise them).

1. Run the 3rd real spike selected per Iteration 1's gap analysis. Apply
   the CURRENT (v1, possibly already-revised) timeboxing rule and
   decision procedure as written.

2. If the procedure produces an ambiguous or wrong-feeling verdict,
   diagnose precisely which criterion failed to discriminate and why —
   this is the most valuable data point in the experiment; do not rush
   past it. If the procedure worked cleanly, that's also real evidence —
   note explicitly that you deliberately tried to find failure and didn't.

3. Revise the decision procedure and/or timeboxing rule ONLY in response
   to concrete friction observed across the 3 spikes so far (evidence-
   driven evolution — do not add speculative branches for cases you
   haven't seen; do not pattern-match to "what a thorough process should
   cover"). If no revision is needed, say so explicitly and explain why
   the existing v1 already covers this case.

4. Finalize the output artifact shape (knowledge/templates/spike-output-
   artifact.md v2): confirm it captures what all 3 spike logs actually
   needed, nothing speculative.

5. Explicitly separate epicd-specific parts of the methodology (references
   to `provenance.spawned_from`, `explorationPipeline`, backlog CLI) from
   universal parts (timebox-then-decide structure, decision-criteria
   pattern) — this is required input for V_meta's reusability component.

6. Calculate V_instance(s_2) and V_meta(s_2) with full evidence and deltas.

7. Convergence check (do this rigorously, don't skip):
   - V_instance ≥ 0.80? V_meta ≥ 0.80?
   - System stable (no new capability/agent needed this iteration vs
     last)?
   - Diminishing returns (ΔV < 0.02 for 2 consecutive iterations)?
   - If not converged: state exactly which component(s) are short and by
     how much, feeding directly into Iteration 3's objective.

Deliverables:
   - iteration-2.md (full 10-section structure)
   - data/spike-2-log.md
   - knowledge/templates/spike-output-artifact.md (v2, finalized or noted
     as still-open)
   - knowledge/principles/timeboxing-rule.md, knowledge/principles/
     kill-promote-decision-procedure.md (or patterns/, per what actually
     emerged) — each stating epicd-specific vs universal parts explicitly
   - knowledge/INDEX.md (create/update: catalog of what's been extracted
     so far, cross-referenced to source iterations)

Target time: 75-90 minutes.
```

**Expected Output**:
- 3 real spikes completed, spanning easy and hard cases.
- A decision procedure that has survived at least one deliberate stress
  test, revised only where evidence demanded it.
- V_instance ≥ 0.65-0.80, V_meta ≥ 0.55-0.75 (may or may not fully
  converge here — that's fine, it's a checkpoint not a deadline).
- A precise, evidence-based list of what's missing if not yet converged.

---

## Iteration 3: Consolidate, Validate Transferability, Check Dual Convergence

**Objective**: Close remaining instance- or meta-layer gaps identified in
Iteration 2. Reach dual convergence if the evidence supports it.

**Prompt**:
```
Context: Read iteration-0.md through iteration-2.md in full, plus all
knowledge/ artifacts produced so far.

1. Address the SPECIFIC gaps named at the end of Iteration 2 — do not
   introduce new, unrelated improvements ("theoretical completeness" is an
   anti-trigger for evolution here; only close what's evidenced as
   missing).

2. If V_instance's instance_count_confidence component is still capped
   because only 3 spikes have run and one was ambiguous, consider running
   a 4th short confirmatory spike ONLY if Iteration 2 left genuine doubt
   about the decision procedure's reliability — not as a default action.

3. Write the transferability analysis explicitly: what % of the
   methodology is epicd-independent vs epicd-specific, backed by the
   iteration-2 split, not re-derived from scratch.

4. Recalculate V_instance(s_3) and V_meta(s_3) with full evidence.

5. Run the full convergence check (dual threshold, system stability,
   objectives complete, diminishing returns). State the verdict plainly:
   CONVERGED or NOT CONVERGED, and why.

6. If converged:
   - Write results.md per the BAIME experiment-template.md structure
     (convergence state, knowledge output catalog, transferability
     analysis, effectiveness analysis, lessons learned). Do NOT perform
     knowledge-extraction into a plugin/skills/ artifact in this
     experiment — that is BACK-658's explicit next step, run separately
     via /baime:knowledge-extractor.
   - Finalize knowledge/INDEX.md with validation status for every
     pattern/principle/template.

7. If NOT converged:
   - State precisely which component(s) of V_instance or V_meta remain
     short, by how much, and what concrete evidence (not speculation)
     would close the gap.
   - Scope a single, bounded Iteration 4 (gap-closure only — do not expand
     the domain).

Deliverables:
   - iteration-3.md (full 10-section structure)
   - results.md (only if converged)
   - knowledge/ updates (finalized versions, validation status recorded)
   - data/spike-3-log.md (only if a 4th confirmatory spike was run)

Target time: 60-90 minutes.
```

**Expected Output**:
- Either: dual convergence (V_instance ≥ 0.80, V_meta ≥ 0.80, system
  stable, results.md written), or
- A tightly-scoped Iteration 4 plan addressing only the named, evidenced
  gaps.

---

## Iteration 4 (Only If Needed): Bounded Gap Closure

**Objective**: Close exactly the gaps named at the end of Iteration 3.
Nothing else.

**Prompt**:
```
Context: Read iteration-3.md's gap analysis and convergence check in full.

1. Address only the specific, named V_instance and/or V_meta component
   gaps from Iteration 3. If closing a gap requires new evidence, run the
   smallest additional real spike or targeted re-check that would produce
   it — do not add scope for its own sake.

2. Recalculate V_instance(s_4) and V_meta(s_4).

3. Run the full convergence check.

4. If converged: write results.md now.

5. If still not converged after this iteration: stop and escalate —
   re-examine whether the domain or value-function design itself needs
   revision (this would be a rare, notable finding worth surfacing to the
   parent task BACK-658 rather than continuing to iterate indefinitely).

Deliverables:
   - iteration-4.md
   - results.md (if converged)

Target time: 45-75 minutes.
```

**Stopping Criteria** (apply from Iteration 2 onward):
- V_instance ≥ 0.80 AND V_meta ≥ 0.80, sustained (not a one-iteration
  spike in the score), OR
- Meta-Focused Convergence explicitly justified (V_meta ≥ 0.80,
  V_instance ≥ 0.55) with written rationale for why instance-layer
  ceiling effects are inherent to this narrow domain — not chosen by
  default.
- System stable (no new capabilities/agents) for 2 consecutive iterations.
- No critical, evidenced gaps remain in either the timeboxing rule,
  the kill/promote procedure, or the output artifact shape.

---

## Evolution Guidance (applies to every iteration)

- **Meta-Agent capabilities and any specialized agents this experiment
  might introduce must evolve only from retrospective evidence** — a
  documented friction point from a completed spike, a gap analysis entry,
  an explicitly attempted-and-failed alternative. Do not add a capability
  or agent because "a thorough methodology-bootstrapping setup usually
  has one" (anticipatory design) or because it pattern-matches other BAIME
  experiments' architectures.
- Given this domain's narrow scope (one pipeline, one phase, one decision
  point), it is plausible the whole experiment can run without any
  specialized sub-agents beyond the main iteration executor — do not
  invent agent/capability modularity the domain doesn't need. If in
  Iteration 0-1 no agent split is warranted, say so explicitly rather than
  leaving it undecided.
- Every value-component score must cite the specific spike log or
  iteration section it's evidenced from. A score with no citation is not
  acceptable.
- Low scores in Iteration 0 (V_meta as low as 0.10-0.20) are expected and
  correct — do not inflate to look more mature than the actual state.
- The kill/promote verdict is always adjudicated to `explorationPipeline`'s
  single terminal phase `done` (see AC#3 comment in `src/engine/
  pipeline.ts`) — never invent or reference a new phase name like
  "killed"/"promoted" anywhere in the methodology's own documentation;
  that would misrepresent the mechanical seam this methodology drives.
