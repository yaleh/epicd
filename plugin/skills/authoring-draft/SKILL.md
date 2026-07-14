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

Separately from the Description markdown above, draft the task's Acceptance
Criteria — the engine's structured `## Acceptance Criteria` field (persisted via
`epicd task edit --ac`, not written into the Description). Follow CLAUDE.md's
"Acceptance Criteria conventions when authoring a task":

- A convergence target (the task's deliverable *is* a mechanism meant to reach
  some end state) becomes a machine-checkable AC: what monotonically shrinks,
  the termination condition, and the exact command that goes green — never a
  prose claim that it terminates.
- An invariant ("X must not change") becomes a negative AC naming its own
  concrete check (e.g. "MCP server name stays `backlog`; verify:
  `grep MCP_SERVER_NAME src/cli.ts`"). Only write one if it is literally true
  for this task's actual scope — otherwise it belongs in Non-Goals, not as an
  AC that misdescribes the change.
- Never phrase an AC as a safety argument ("this is an extension, not a
  rewrite") — state a checkable fact instead.
- If an AC claims a change is visible to an external consumer (another tool,
  file format, downstream process), name the exact field or code path that
  consumer reads — verified by reading its real logic/schema — not just "the
  value appears in the file somewhere."
- Do not add a separate "不动点"/"严格不改" section to the task. Fold
  convergence targets and invariants into Acceptance Criteria as above; keep
  un-checkable scope prose in the Description's Non-Goals / Trade-offs instead.

For an Epic (`kind:epic`), write the Acceptance Criteria at the epic level too —
this repo's own precedent (e.g. BACK-600, BACK-664) always states the epic's
overall done-state as real, checkable ACs, not an empty list left for children to
define; children each cover a sub-scope of the same epic-level criteria.

### Phase 2 — Self-review loop (up to 3 rounds)

After each draft (including the first), check it against this fixed checklist:

- **Motivation**: does Background explain WHY, not just WHAT, in roughly 3-8 lines?
- **Goals**: is every goal concretely verifiable (by inspection or a shell command),
  with no vague language ("improve", "better", "robust" without a check attached)?
- **Feasibility**: does the Approach match what the codebase can actually support —
  did you search to confirm, rather than assume?
- **Completeness**: are non-goals/trade-offs stated, not left implicit?
- **Consistency**: no section contradicts another?
- **AC discipline**: does every Acceptance Criterion name a concrete, checkable
  fact (a command, a file path, a grep, an assertion) rather than prose intent?
  Are convergence targets phrased as machine-checkable termination conditions,
  and invariants phrased as negative ACs with a named check? Adversarially ask:
  "could every AC here go green while the task's actual goal is still unmet?" —
  if yes, this round fails; add the AC that closes that gap.

If every criterion passes: record the outcome and stop (see Finalise below).

If any criterion fails and this was round 1 or 2: fix the failing section(s)
in place and re-run the checklist as the next round.

If any criterion still fails after round 3: stop revising, leave the draft as-is,
and route to human review (append a note explaining which criteria did not
converge) rather than silently shipping an unresolved proposal.

### Finalise

Persist the converged Acceptance Criteria as the task's actual `--ac` list
(replace, don't append — remove any stale/placeholder criteria first with
`--remove-ac <index>` if the task already carried some):

```bash
epicd task edit <taskId> --ac "<criterion 1>" --ac "<criterion 2>" ...
```

Then record the review outcome:

```bash
epicd task edit <taskId> --append-notes "authoring/draft self-review: <APPROVED|NEEDS_HUMAN> after <n> round(s)<: unresolved criteria if NEEDS_HUMAN>"
```

Do not change the task's phase/status yourself — that transition belongs to
whatever drives the pipeline forward next (today: a human promoting the task;
later, once E7/BACK-608 lands, the monitor's own dispatch).

## Constraints

- This skill produces/revises the task's Description text and its Acceptance
  Criteria field — nothing else. It does not create branches, worktrees, or
  child tasks, and does not touch engine mechanics (complete/adjudicate/DoD
  re-run/merge-lock/worktree/claim/pipeline-as-data).
- Do not invent scope beyond what the Background/Goals justify — a proposal that
  smuggles in unrelated work fails the Consistency criterion.
- Do not spawn further nested agents from inside this skill's execution.
