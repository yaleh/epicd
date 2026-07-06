---
name: primitive-executor
description: "Execute a single execution/ready task end to end using the LFDD methodology: read the task's Phase plan, TDD each Phase (red before green), run its structured DoD, checkpoint via engine complete. Invoke with a task id."
---

# primitive-executor

Executes the `execution/ready` machine-actor phase (see `docs/task-lifecycle-model.md`
§3) for one Basic task. This packages the same LFDD methodology already crystallized in
the engine's own dispatch payload for this phase (`src/engine/dispatch.ts`'s
`renderBasicReadyDispatch`) as a standalone, independently invokable skill — same
method, described here so it can be run without going through that specific dispatch
transport.

## Preconditions

- You have a task id (e.g. `BACK-123`) whose board phase is `ready` (or you have just
  claimed it) and a git worktree checked out for its branch.
- `cd` into the worktree before doing anything else — every command below assumes the
  worktree is the current directory.

## Method

### Phase 0 — Read the plan

Run `bun run cli task view <taskId> --plain` and read the full Description. The
Description's `## Phase` sections (if present) are the sole authority on what to build
and in what order — do not invent scope beyond them. If the task carries prior
Implementation Notes from a human reply (e.g. after a `needs-human` round-trip), that
reply supersedes any open question in the original plan.

### Phase N — TDD each Phase in the plan, in order

For each `## Phase` section in the Description (or, if the Description has no explicit
Phase breakdown, treat the whole task as one Phase):

1. **Red** — write or adjust the test(s) that describe the Phase's expected behavior;
   run them and confirm they fail for the expected reason (not a typo/setup error).
2. **Green** — implement the minimum change to make those tests pass.
3. **DoD for this Phase** — run the Phase's own Definition of Done commands if the plan
   lists Phase-scoped ones; otherwise run the task-level DoD commands relevant to what
   you touched (e.g. `bunx tsc --noEmit` when TypeScript changed, `bun run check .` when
   formatting/linting changed, `bun test` or a scoped test file).
4. **Checkpoint the Phase** — record progress so the state survives a restart, e.g.
   `bun run cli task edit <taskId> --append-notes "Phase <n> done: <one-line summary>"`.
   Never pass `--status`/`--dod`/`--check-dod` here — the task's terminal phase is a
   merge gate owned by `engine complete`, not something a worker self-attests.

Do not skip Phases and do not merge two Phases into one commit unless the plan itself
says they are one recoverable checkpoint.

### Phase — Simplify before finishing

Before declaring the task done, re-read what you built with the hindsight you now have
and simplify anything that turned out more layered than the problem needed. This mirrors
the project's own simplicity-first rule (`CLAUDE.md`): prefer one implementation for
similar concerns, keep APIs minimal, avoid speculative layers.

### Finalise — commit and hand off to the merge gate

1. Stage and commit your working-tree changes (never stage `backlog/tasks/**` — the
   board file is engine-owned and `engine complete` writes it after merge):
   `git add -A -- . ':!backlog/tasks' && git commit -m "<taskId> - <short title>"`.
2. Run the full task-level DoD one last time in the worktree.
3. Checkpoint completion, then hand off to the engine's own completion handshake:
   `bun run cli engine complete <taskId> --worktree <worktreePath>`.
   This independently re-runs the task's DoD shell-gates in the worktree (the worker
   never self-attests done) and either merges under the board lock (task reaches its
   terminal `done` phase) or routes the task to `needs-human`. This is the only merge
   step this skill uses — never fall back to a different merge/lock mechanism, and
   never re-claim or re-spawn once the task is terminal.

## Constraints

- Do not run `git merge` or `git push` yourself — `engine complete` owns the merge.
- Do not modify engine mechanics (complete/adjudicate/DoD re-run/merge-lock/worktree/
  claim/pipeline-as-data) while executing a task — this skill only describes how to do
  the Phase work that sits on top of those mechanics, never how to change them.
- Do not spawn further nested agents from inside this skill's execution.
