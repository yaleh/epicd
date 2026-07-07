---
name: authoring-draft
description: "Draft an initial proposal for a task or epic and self-review it against a fixed checklist, revising up to 3 rounds until it converges or is explicitly parked for human input. Invoke with a task id."
---

# authoring-draft

> **Runtime wiring status: NOT yet connected.** This skill executes the
> `authoring/draft` machine-actor phase (see `docs/task-lifecycle-model.md` §3), but
> the production driver that would let the monitor invoke it automatically at
> dispatch time is a separate, not-yet-done piece of work (E7/BACK-608). Until that
> lands, this skill can only be invoked manually, or by an agent a human has
> explicitly directed to run it — never assume it fires on its own.

## Background

Every task in this repository's own history — every `Basic`/`Epic` entry under
`backlog/tasks/` — starts life as a rough idea and only becomes actionable once it
has passed through a drafting step that turns that idea into a structured proposal:
a stated motivation, a set of goals someone can actually check, and a plain
statement of what is explicitly out of scope. Skipping straight to implementation
plans off an unreviewed idea repeatedly produces scope creep, unverifiable goals,
and rework once a reviewer finally asks "why does this exist?" — the drafting step
exists to catch exactly that class of defect before it's expensive to fix.

## Method

### Phase 0 — Read the seed

Run `epicd task view <taskId> --plain` and read the current Description. If
the task already carries a substantive Description, treat it as the seed to refine
in place — do not throw it away and start from a blank page. If the Description is
thin (a title-only stub or a one-line idea), you are drafting from scratch.

### Phase 1 — Draft the proposal

Write (or rewrite) the task's Description as a proposal with these sections:

```markdown
## Background
(3-8 lines: WHY this is needed — what problem it solves, not just what it does)

## Goals
1. (a concrete, verifiable outcome — checkable by reading code or running a command)
2. ...

## Approach
(High-level shape of the change: what to build, the key pieces involved — no
implementation code, no file-by-file diff)

## Non-Goals / Trade-offs
(What this explicitly will NOT do, and any risks or alternatives considered)
```

Search the codebase enough to ground the Background and Approach in what actually
exists today — a proposal that contradicts the current architecture fails review
before it ever reaches a human.

### Phase 2 — Self-review loop (up to 3 rounds)

After each draft (including the first), check it against this fixed checklist:

- **Motivation**: does Background explain WHY, not just WHAT, in roughly 3-8 lines?
- **Goals**: is every goal concretely verifiable (by inspection or a shell command),
  with no vague language ("improve", "better", "robust" without a check attached)?
- **Feasibility**: does the Approach match what the codebase can actually support —
  did you search to confirm, rather than assume?
- **Completeness**: are non-goals/trade-offs stated, not left implicit?
- **Consistency**: no section contradicts another?

If every criterion passes: record the outcome and stop (see Finalise below).

If any criterion fails and this was round 1 or 2: fix the failing section(s)
in place and re-run the checklist as the next round.

If any criterion still fails after round 3: stop revising, leave the draft as-is,
and route to human review (append a note explaining which criteria did not
converge) rather than silently shipping an unresolved proposal.

### Finalise

```bash
epicd task edit <taskId> --append-notes "authoring/draft self-review: <APPROVED|NEEDS_HUMAN> after <n> round(s)<: unresolved criteria if NEEDS_HUMAN>"
```

Do not change the task's phase/status yourself — that transition belongs to
whatever drives the pipeline forward next (today: a human promoting the task;
later, once E7/BACK-608 lands, the monitor's own dispatch).

## Constraints

- This skill only produces/revises the task's Description text. It does not create
  branches, worktrees, or child tasks, and does not touch engine mechanics
  (complete/adjudicate/DoD re-run/merge-lock/worktree/claim/pipeline-as-data).
- Do not invent scope beyond what the Background/Goals justify — a proposal that
  smuggles in unrelated work fails the Consistency criterion.
- Do not spawn further nested agents from inside this skill's execution.
