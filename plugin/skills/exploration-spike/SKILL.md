---
name: exploration-spike
description: "Timebox a real unknown as a scope-unit-budgeted spike, then apply a 5-step procedure to call it KILL or PROMOTE, leaving a 5-section output artifact behind either way. Invoke with a one-line spike question."
---

# exploration-spike

> **Provenance and validation status: read before trusting this beyond its evidence.**
> This skill packages the methodology produced by the
> methodology-bootstrapping experiment at
> `docs/experiments/back-658-spike-methodology/` (see that directory's
> `results.md` for the full write-up). It converged under the **Practical
> Convergence** pattern: V_instance = 0.80 (met) on 5 real spikes run inside the
> experiment; V_meta = 0.71 — short of the 0.80 target, with the gap explicitly
> diagnosed as structural, not hand-waved. See "Known limitations" below before
> relying on this for a high-stakes call.

## Background

Executes the `exploration/spike` machine-actor phase (see
`docs/task-lifecycle-model.md` §3). This phase always mechanically adjudicates to
`done` (see `src/engine/exploration-handlers.ts`'s `SpikeRunner`/`SpikeVerdict`) —
the real decision this skill makes is **kill** (no derived task; a written record
still exists) vs **promote** (spawn a follow-on execution-pipeline task carrying
`provenance.spawned_from`, per BACK-638/`src/core/field-registry.ts`'s `provenance`
descriptor).

## Method

### Phase 0 — Declare before investigating

Before running any exploratory tool call, write down (as the first section of the
output artifact, see below):

1. **Scope** — the file/doc list you expect to need.
2. **Tool-call ceiling** — default **12 tool calls**. Candidate-scan calls (finding
   *which* question to spike on) do not count against this ceiling — only calls
   spent investigating the declared question do. Use a smaller, explicitly
   non-default ceiling only when deliberately stress-testing this rule itself, not
   as an ordinary default.
3. **Done bar** — the specific question(s) that, once answerable, end the
   investigation regardless of remaining budget.

Do not start investigating before this declaration exists.

### Phase 1 — Investigate under the stop rule

Stop at the first of:

- (a) the tool-call ceiling is reached, or
- (b) every declared done-bar question is answerable, or
- (c) three consecutive investigation actions in a row produce no new information
  relevant to the done-bar questions.

**Tie-break**: if (a) and (b) fire on the same action, treat it as (b) — a resolved
done bar is stronger evidence than an exhausted budget alone.

**Ceiling reached strictly before the done bar resolves** (the harder case):

1. Ask whether the done bar is **close** — a narrow, specifically nameable
   remaining check (e.g. "does file X contain keyword Y"), not a broad, still
   open-ended unknown.
2. If close: take **exactly one extension tool call**, spent only on that narrow
   check. If it resolves the done bar, proceed to Phase 2 as normal.
3. If the done bar is **not** close, or the one extension does not resolve it:
   stop. Do not take a second extension. Apply Phase 2's step 1 with the done bar
   explicitly marked **unresolved** — this defaults to
   **KILL-with-named-open-question** (the open question itself is the artifact;
   no follow-on task is manufactured from an unresolved investigation).

Record the actual tool-call count, the actual sequence of actions, and a
scope-drift note in the output artifact's timeline section as you go.

### Phase 2 — Kill/Promote decision procedure

Apply in order; stop at the first decisive answer:

1. **Re-state** the declared done-bar question(s) from Phase 0.
2. **Check for an independent, external corroborating signal** — an existing
   doc/comment/prior decision/regression test/precedent that already speaks to the
   question. This step has repeatedly been the one that actually resolves a
   plausible-but-wrong gut read; do not skip it even when a verdict feels obvious.
3. **Resolved vs. relocated test.** Does the investigation's answer *resolve* the
   original uncertainty, or does it *relocate* it (surface a new, equally-open
   question in its place)?
   - Relocated -> lean **KILL**, naming the new open question.
   - Resolved -> continue to step 4.
   - **Mixed case**: if the investigation resolves the *declared* done-bar question
     but also surfaces a *separate, narrower, emergent* question the declaration
     did not name, verdict the two **separately** in the output artifact (see
     Phase 3) — do not let a clean main-question KILL silently swallow a genuinely
     open emergent one.
4. **Concrete follow-on shape test.** Is there a specific, nameable follow-on the
   resolved answer justifies?
   - Yes -> **PROMOTE**.
   - No -> **KILL**, even if step 3 resolved cleanly.
   - Nameability is separate from size: a one-line docstring fix and a multi-file
     feature port are equally "yes" once a follow-on exists at all — do not use
     follow-on size as a proxy for whether it is nameable.
5. **Ambiguity default.** If step 3 does not resolve cleanly for whichever question
   is being verdicted, default to **KILL**, recording the ambiguity as the reason.
   When this branch fires, the output artifact must also record: the mechanical
   result, an independent gut check, and whether a reasonable alternative reader
   could disagree — even when gut and mechanism agree.

**PROMOTE mechanics (epicd-specific)**: create the follow-on task with
`backlog task create --pipeline execution --phase ready "<title>"`, then set its
`provenance.spawned_from` to the spike task's id. As of this writing neither
`task create` nor `task edit` exposes a CLI flag for the `provenance` field (see
`src/core/field-registry.ts`'s `provenance` descriptor and BACK-641, the separate
production-wiring prerequisite this skill's non-goals exclude) — set it directly in
the created task's frontmatter, or via whatever provenance-setting mechanism lands
first. Do not invent a new field or bypass `provenance.spawned_from` with a
different convention.

### Phase 3 — Output artifact

Every spike, regardless of verdict, leaves a written record with exactly these 5
sections, in order:

1. **Pre-spike declaration** — Phase 0's scope/ceiling/done-bar, written before
   investigating.
2. **Real timeline** — the actual sequence of investigation actions, a scope-drift
   note, and the actual tool-call count against the declared ceiling; note
   explicitly if the ceiling and done-bar-answered condition fired together.
3. **Findings** — numbered, each with a concrete citation (file:line, quoted text,
   or both).
4. **Kill/Promote verdict** — the verdict plus which Phase 2 step was decisive,
   with citations. If an emergent question was found (Phase 2 step 3's mixed
   case), state two separate verdicts, each with its own rationale. If the
   ambiguity default (Phase 2 step 5) fired, also record the mechanical output, the
   independent gut check, and the reasonable-alternative-reader disclosure.
5. **Retrospective** — did the declared budget hold, was it actually tested under
   pressure or only comfortably held, and where did the procedure produce
   friction, ambiguity, or a result diverging from independent judgment.

No 6th section, no minimum length per section, and no separate "conclusion"
section — this shape has held across 5 real spikes and 3 distinct verdict shapes
(flat KILL, flat PROMOTE, split main/emergent) without needing one.

### Finalise

Record the artifact in the task (e.g.
`backlog task edit <taskId> --append-notes "<the 5-section artifact>"`, or as
the task's final summary). Do not change the task's phase/status yourself — the
spike phase's own `done` adjudication and any follow-on task creation are the only
state transitions this skill drives; it does not touch engine mechanics (complete/
adjudicate/DoD re-run/merge-lock/worktree/claim/pipeline-as-data).

## Universal vs. epicd-specific

Everything above — scope-unit budgeting, the 3-branch stop rule, the
ceiling-before-done-bar extension mechanism, the 5-step kill/promote procedure, and
the 5-section output shape — is universal to any spike/exploration process, not
epicd-specific. Exactly two parts are epicd-specific and must be substituted for
reuse outside this repo:

- **The default ceiling of 12 tool calls** — calibrated against epicd's own
  investigative shapes (code reading, grepping, test running); a different
  codebase/toolset needs its own calibration pass, not a blind reuse of "12."
- **The promotion mechanism** — `provenance.spawned_from` + `backlog task create`
  is epicd's own "turn this into real work" plumbing; a non-epicd context
  substitutes its own (a linked issue, a "derived from" ticket comment).

## Known limitations (carried forward honestly, not smoothed over)

1. **The harder ceiling-before-done-bar sub-branch** (extension insufficient, or
   the done bar not close at all) has a reasoned default
   (KILL-with-named-open-question, no second extension) but has never occurred in
   a real spike — the first real instance in actual use of this skill is genuine
   new evidence, not a re-derivation.
2. **`effectiveness`'s strongest form** — this procedure overriding a persistent,
   evidence-informed gut disagreement — has never been observed across the 5
   spikes that produced this skill, including one spike deliberately run to hunt
   for exactly that. Real usage is the natural place this could finally show up.
3. **Self-referential validation**: the source experiment was authored, executed,
   and scored by the same agent throughout. Real usage by a different agent, on a
   spike that experiment did not select, is the genuine external test this skill
   has not yet had.
4. **Reusability outside epicd** rests on one hypothetical worked example (a
   Django/DRF team's middleware-redundancy spike), not a real cross-project
   application — treat the "universal vs. epicd-specific" split above as
   well-reasoned, not yet empirically confirmed outside this repo.

## Constraints

- Do not skip Phase 0's declaration and start investigating first.
- Do not manufacture a follow-on task's nameability or size to force a verdict
  either way — apply Phase 2 in order and stop at the first decisive step.
- Do not touch engine mechanics (complete/adjudicate/DoD re-run/merge-lock/
  worktree/claim/pipeline-as-data) from inside this skill.
- Do not spawn further nested agents from inside this skill's execution.
