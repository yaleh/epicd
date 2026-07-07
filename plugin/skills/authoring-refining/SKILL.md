---
name: authoring-refining
description: "Turn an approved proposal into a concrete, TDD-shaped implementation plan and put it through an independent review loop (up to 8 iterations) until it converges on APPROVED or is routed to a human. Invoke with a task id."
---

# authoring-refining

> **Runtime wiring status: NOT yet connected.** This skill executes the
> `authoring/refining` machine-actor phase (see `docs/task-lifecycle-model.md` §3),
> but the production driver that would let the monitor invoke it automatically at
> dispatch time is a separate, not-yet-done piece of work (E7/BACK-608). Until that
> lands, this skill can only be invoked manually, or by an agent a human has
> explicitly directed to run it — never assume it fires on its own.

## Background

An approved proposal (the `authoring/draft` output) states WHAT and WHY, but not
yet HOW: a plan someone can actually execute needs ordered phases, tests written
before implementation, and executable Definition-of-Done commands instead of prose
checkboxes. This repo's own history shows this refinement step catching real
defects before implementation starts — e.g. a phase-ordering bug where a later
phase's code depended on something an earlier phase hadn't built yet, or a plan
whose scope didn't actually cover one of the proposal's stated goals. An
independent review pass, repeated until the plan converges, is what catches these
before a worker starts implementing against a broken plan.

## Method

### Phase 0 — Read the approved proposal

Run `backlog task view <taskId> --plain` and read the Description (the
approved `authoring/draft` output). This is the sole source of Goals/Background —
do not invent scope the proposal didn't state.

### Phase 1 — Draft the plan

Search the codebase to identify concrete file paths, then write the task's
Implementation Plan with this shape:

```markdown
# Plan: <title>

## Phase A: <title>
### Tests (write first)
(test file paths / case names; must fail before implementation)
### Implementation
(files to create or modify)
### DoD
- [ ] `<test command for this Phase>`   <- first item proves red before green
- [ ] `<other verification command>`

## Phase B: ...

## Constraints
(non-executable criteria — never put prose here in the DoD list)

## Acceptance Gate
- [ ] `<full test-suite command>`       <- first item is the project's full suite
- [ ] `<final verification command>`
```

Every `### DoD` and `## Acceptance Gate` entry must be an executable shell command
(exit 0 = pass) — prose belongs in `## Constraints`, never in a DoD list.

### Phase 2 — Review loop (up to 8 iterations)

Each iteration, review the current plan against the proposal with this checklist:

- **Goal coverage**: every proposal Goal is addressed by at least one Phase or
  Acceptance Gate item.
- **TDD structure**: every Phase has a `### Tests` section before
  `### Implementation`, and its first DoD command is the project's per-change test
  command (proves red-before-green).
- **Acceptance gate**: the first `## Acceptance Gate` item is the full test-suite
  command.
- **Executability**: every DoD/Acceptance item is a real shell command, not a
  natural-language checkbox.
- **Phase ordering**: earlier phases produce what later phases consume — no phase
  depends on something a later phase builds.
- **Scope discipline**: no Phase implements something not backed by a stated Goal.
- **File paths**: referenced files/paths actually exist (or are clearly new) —
  search to confirm rather than assume.

If all criteria pass: record `APPROVED` (see Finalise) and stop.

If any criterion fails: fix the plan in place (and the proposal too, if the defect
traces back there) and re-run the checklist as the next iteration, up to 8 total.

If iteration 8 is reached with unresolved criteria: stop revising, leave the plan
as-is, and route to human review rather than silently shipping a plan that never
converged.

### Finalise

```bash
backlog task edit <taskId> --append-notes "authoring/refining review: <APPROVED|NEEDS_HUMAN> after <n> iteration(s)<: unresolved criteria if NEEDS_HUMAN>"
```

Do not change the task's phase/status yourself — that transition belongs to
whatever drives the pipeline forward next (today: a human promoting the task;
later, once E7/BACK-608 lands, the monitor's own dispatch).

## Constraints

- This skill only produces/revises the task's Implementation Plan text (and, when
  a defect traces back there, the Description). It does not create branches,
  worktrees, or child tasks, and does not touch engine mechanics (complete/
  adjudicate/DoD re-run/merge-lock/worktree/claim/pipeline-as-data).
- Do not invent Phases beyond what the proposal's Goals justify.
- Do not spawn further nested agents from inside this skill's execution.
