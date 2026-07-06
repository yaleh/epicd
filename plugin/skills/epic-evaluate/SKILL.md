---
name: epic-evaluate
description: "Evaluate an execution/evaluating epic: run its own Integration Acceptance, then aggregate its children's terminal phases into its own terminal phase. Invoke with an epic task id."
---

# epic-evaluate

Executes the `execution/evaluating` machine-actor phase (see
`docs/task-lifecycle-model.md` §3) for one epic. This packages the same evaluation
method already crystallized in the engine's own dispatch payload for this phase
(`src/engine/dispatch.ts`'s `renderEpicEvalDueDispatch`) as a standalone, independently
invokable skill — same method, described here so it can be run without going through
that specific dispatch transport.

This is a **mechanical** skill: a thin wrapper around one deterministic engine
CLI call. There is no methodology judgment call to make here (unlike
`epic-decompose`) — evaluation is a fixed procedure, not a choice.

## Preconditions

- You have an epic task id (e.g. `BACK-123`) whose board phase is `evaluating`.
- Evaluate runs directly in the repo root — there is no worktree for this phase.

## Method

### Step 1 — Evaluate

```bash
bun run cli engine evaluate <epicId>
```

`engine evaluate` (`evaluateEpic` in `src/harness/evaluator.ts`) does two things, in
order:

1. **Runs the epic's own Integration Acceptance.** If the epic Description's
   `## Integration Acceptance` section contains fenced shell code blocks, each one is
   spawned and its exit code checked. If ANY of them exits non-zero, the epic is routed
   straight to `needs-human` — children are not even consulted. This is the ADR-019 gap
   fix (BACK-657.3): an epic can no longer reach `done` with its own end-to-end
   acceptance never having run, just because all of its children happened to be
   `done`. An epic with no Integration Acceptance section declared has nothing to gate
   on here and falls through to step 2 unchanged.
2. **Aggregates children's terminal phases**, exactly as before: any child
   `needs-human` → epic `needs-human`; otherwise (all children `done`) → epic `done`.

This is the only evaluation implementation this skill uses — do not hand-edit the
epic's phase, and do not re-implement this aggregation elsewhere.

## Constraints

- Do not run `git merge` or `git push` — this phase has no worktree/branch of its own.
- Do not modify engine mechanics (complete/adjudicate/DoD re-run/merge-lock/worktree/
  claim/pipeline-as-data) while executing this phase.
- Do not spawn further nested agents from inside this skill's execution.
- No methodology claim is made by this skill — see `contract.json`'s
  `creation_path: "mechanical"` and its explicit "no methodology" provenance.
