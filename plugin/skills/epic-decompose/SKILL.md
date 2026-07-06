---
name: epic-decompose
description: "Propose and apply a child-task decomposition for an execution/decomposing epic, following ADR-018-style PR-sizing and fold-test heuristics. Invoke with an epic task id."
---

# epic-decompose

Executes the `execution/decomposing` machine-actor phase (see
`docs/task-lifecycle-model.md` §3) for one epic. This packages the same decomposition
methodology already crystallized in the engine's own dispatch payload for this phase
(`src/engine/dispatch.ts`'s `renderEpicReadyDispatch`) as a standalone, independently
invokable skill — same method, described here so it can be run without going through
that specific dispatch transport.

## Preconditions

- You have an epic task id (e.g. `BACK-123`) whose board phase is `decomposing`.
- Decompose runs directly in the repo root — there is no worktree for this phase
  (children are main-board artifacts, not a branch's own work).

## Method

### Phase 0 — Read the epic's plan

Run `bun run cli task view <epicId> --plain` and read the full Description, in
particular its `## Sub-Task Decomposition` section (if present) — that section is the
epic author's own proposed breakdown and the starting point for what to propose.

### Phase 1 — Judge granularity before proposing children

The judgment call this skill packages is: **is this epic's work correctly split into
the children it names, at the correct granularity?** Apply the PR-sizing and fold-test
heuristics (the decomposition methodology referenced as "ADR-018" in
`docs/task-lifecycle-model.md`, whose converged, currently-enforced form lives in this
repo's `CLAUDE.md` under "Task decomposition granularity" — the same heuristics this
very skill's own task, BACK-657.3, was created and scoped against):

- A Basic child ≈ one reviewable PR, up to ~2000 lines of change.
- Decompose by deliverable, not by concern/file — do not create a separate child per
  field, filter, or small edit; fold related changes into one PR-sized child.
- Only split into multiple children when BOTH hold: (a) you can name ≥2 independently
  reviewable/mergeable deliverables (a sequence of steps toward one deliverable is not
  multiple deliverables), and (b) the combined size estimate has real margin over the
  ~2000-line ceiling (aim for ≥1.8–2x, not a marginal overage).
- A child that is a trivial administrative/verification step (a marker file, a
  smoke-test stub, an audit-only note) rather than a real deliverable is a
  concern-based-over-decomposition red flag — fold it back into its parent's Stages
  instead of proposing it as its own child.
- If the epic's own plan already proposes a reasonable breakdown, use it; only revise it
  when it visibly violates these heuristics (e.g. it names a marker-file child, or
  splits one deliverable into several children with no independent size margin).

### Phase 2 — Propose the children

Do NOT create the children yourself with `task create` — the engine creates them.
Instead, emit a JSON array describing the proposed children:

```json
[{ "title": "...", "description": "...", "touches": ["optional/path/hints"] }]
```

`touches` is optional (files/modules this child is expected to touch — best-effort,
used only for an advisory sibling-overlap check, never blocks). An empty array `[]`
routes the epic to `needs-human` instead of creating children — use this only if the
plan genuinely has no viable decomposition (e.g. it should stay a single Basic task).

### Phase 3 — Apply the proposal

```bash
echo '<json array>' | bun run cli engine decompose-apply <epicId>
```

`engine decompose-apply` creates each child with engine fields
(`pipeline_id`/`phase`/`parent_id`) and advances the epic's phase to
`awaiting-children`. This is the only creation/merge implementation this skill uses —
never fall back to `task create` for children or hand-edit the epic's phase.

## Constraints

- Do not run `git merge` or `git push` — this phase has no worktree/branch of its own.
- Do not modify engine mechanics (complete/adjudicate/DoD re-run/merge-lock/worktree/
  claim/pipeline-as-data) while executing this phase — this skill only describes how to
  judge and propose a decomposition, never how to change the mechanics that apply it.
- Do not spawn further nested agents from inside this skill's execution.
- contracts-lint (this skill's `contract.json`) validates structure/portability only —
  it is not, and cannot be, a validity check on the decomposition judgment itself.
