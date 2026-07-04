---
id: BACK-616
title: 'engine complete: commit board-file phase write after merge'
status: 'Basic: In Progress'
assignee:
  - '@claude'
created_date: '2026-07-04 16:10'
updated_date: '2026-07-04 16:19'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 28000
phase: done
dod:
  - text: >-
      bun test src/test/engine-complete-cli.test.ts
      src/test/engine-safety-worktree.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
engine complete (completeTask in src/engine/complete.ts) merges the task worktree branch via gitMergeBranch, then calls store.updateTask to write the adjudicated phase (done/needs-human) to the task's board markdown file — but nothing commits that write. src/engine/store.ts's makeBoardStore hardcodes updateTask: (task) => core.updateTask(task, false), explicitly passing autoCommit=false 'so the engine controls when changes are persisted to git' — but no commit is ever issued. Verified empirically on BACK-611: after 'engine complete BACK-611 --worktree ...' succeeded (merge + phase->done), git status showed an uncommitted modification to backlog/tasks/back-611*.md that had to be committed by hand. This leaves main's working tree dirty after every engine complete call, which is a hard blocker for unattended/monitor-driven runs: the next worktree's merge can hit 'local changes would be overwritten by merge' against that same dirty board file, or the dirty state can be silently lost/overwritten.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a successful 'engine complete <id> --worktree <path>' run, git status in the main repo shows no uncommitted changes to the completed task's board file — the phase/status write lands in its own git commit
- [ ] #2 The commit happens whether the verdict is done or needs-human (not just the success path)
- [ ] #3 No change to engine complete's behavior when store.updateTask is not backed by a real git repo (e.g. in-memory test doubles) — the commit step must be an injectable primitive, not hardcoded shell-out inside engine core
- [ ] #4 Existing engine-complete-cli.test.ts and related tests still pass; a new test asserts the board file is committed (not just written) after completeTask succeeds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: engine complete commits the board-file phase write after merge

## Phase A: completeTask commits the final phase write under the merge lock

### Tests (write first)
- src/test/engine-complete.test.ts (or wherever completeTask unit tests live): add cases
  asserting `options.commit(taskId, verdict)` is invoked exactly once after
  `store.updateTask`, for all three exit paths (dodResults-fail early-return,
  merge-conflict early-return, normal adjudicate path) — and NOT invoked when
  `options.commit` is omitted (back-compat / in-memory test doubles).
- src/test/engine-complete-cli.test.ts: extend the two existing CLI tests (DoD pass →
  done, DoD fail → needs-human) with an assertion that `git status --porcelain` in
  projectRoot is empty after the CLI run completes.

### Implementation
- src/engine/complete.ts: add `commit?: (taskId: string, verdict: string) => Promise<void>`
  to `CompleteTaskOptions`. Restructure `completeTask` so the whole body (dodResults
  check, merge, adjudicate, updateTask) runs inside a single `withMergeLock` scope
  (when `options.safety` is given) instead of only wrapping the merge call — this
  closes the race where a concurrent completeTask could interleave with the
  post-merge board write. Call `await options?.commit?.(taskId, verdict)` right after
  each `store.updateTask` call (both the early needs-human returns and the final
  adjudicated path).
- src/harness/real-primitives.ts: add `gitCommitBoardChange(repoPath, taskId, verdict)`:
  `git add -A -- backlog`, then `git diff --cached --quiet` to detect whether anything
  is staged (skip commit if nothing staged — idempotent no-op), otherwise
  `git commit -m "board: <taskId> -> <verdict>"`.
- src/cli.ts (`engine complete` action): pass
  `commit: (taskId, verdict) => gitCommitBoardChange(cwd, taskId, verdict)` into the
  `completeTask` options alongside the existing `merge`/`safety`.

### DoD
- [ ] `bun test src/test/engine-complete-cli.test.ts src/test/engine-safety-worktree.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- Do not change completeTask's public return type or the adjudicate() verdict logic.
- `commit` must be optional and default to a no-op so every existing caller (including
  in-memory TaskStore test doubles) keeps working unmodified.
- Do not scope the git add wider than `backlog/` — this primitive must never stage
  unrelated working-tree changes.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
