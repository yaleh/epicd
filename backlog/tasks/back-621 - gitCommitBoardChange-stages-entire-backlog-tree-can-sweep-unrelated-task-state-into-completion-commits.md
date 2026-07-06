---
id: BACK-621
title: >-
  gitCommitBoardChange stages entire backlog tree, can sweep unrelated task
  state into completion commits
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 00:09'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 33000
pipeline_id: execution
phase: done
dod:
  - text: bun test src/test/engine-merge.test.ts src/test/engine-merge-wire.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

`gitCommitBoardChange` (`src/harness/real-primitives.ts:175`) is called by `completeTask` (`src/engine/complete.ts`) after every phase-write (`done`/`needs-human`) to commit the board file's state change. Its implementation stages the entire `backlog` directory:

```ts
const add = Bun.spawn(["git", "add", "-A", "--", "backlog"], { cwd: repoPath, ... });
```

`-A -- backlog` stages every modified/untracked path under `backlog/`, not just the completing task's own board file. Found empirically on 2026-07-05: while completing BACK-619, this swept in an unrelated, already-dirty, uncommitted claim-edit sitting in the main worktree for a different task (BACK-612 — itself corrupted by BACK-620's bug), silently folding BACK-612's field-loss into BACK-619's `board: BACK-619 -> needs-human` commit. The commit message and the actual diff no longer matched — a completion commit that also mutates an unrelated task's board state is a correctness and auditability hazard: any operator (or the engine itself) reading `board: <id> -> <verdict>` commits to reconstruct history would draw a wrong conclusion about what changed and why.

This is independent of BACK-620 (which fixes *why* a stray dirty board-file edit could exist in the first place) — even after BACK-620 lands, any other legitimate source of a dirty `backlog/` file at commit time (a concurrent claim, a manual edit, a half-finished `task edit`) would still get silently absorbed by this commit's `-A -- backlog` scope. Defense in depth: the completion commit should only ever touch the task it is completing.

## Goals

1. `gitCommitBoardChange` only stages the completing task's own board file(s), never any other path under `backlog/`.
2. If unrelated dirty state exists elsewhere under `backlog/` at commit time, it is left untouched (still dirty) rather than silently absorbed — visible on the next `git status`, not hidden inside an unrelated commit.
3. A regression test proves a concurrent dirty file belonging to a different task survives a `gitCommitBoardChange` call untouched.

## Proposed Approach

Scope the `git add` to the specific task's board file glob (the same `backlog/tasks/<slug-containing-taskId>*.md` pattern already used elsewhere in this session's manual recovery steps, e.g. `git checkout <sha> -- backlog/tasks/back-610*.md`), rather than the whole `backlog` directory. `gitCommitBoardChange` already receives `taskId` as a parameter — resolve the matching file(s) via a glob and pass that explicit path list to `git add`, instead of the directory-wide `-A`.

## Trade-offs and Risks

- If a task's completion legitimately needs to commit changes to more than its own board file (none currently do — `completeTask`'s only writes are to the task's own record), this narrows what gets committed automatically; that's the intended, safer default. Revisit only if a proven need for multi-file board commits emerges.
- Glob-matching by task ID assumes board filenames are prefixed with the task ID (current convention, e.g. `back-619 - ...md`) — if that convention ever changes, this resolution needs to change with it. Not a new risk: the same assumption already exists in this session's manual recovery commands and in `handle-basic-ready.sh`'s `.wt`/`.signal` file-naming.
- Not doing: a general "never `git add -A` in this codebase" lint rule — scoped to this one call site where the blast radius (silently committing unrelated task state) is concrete and proven.

## Implementation Plan

# Plan: gitCommitBoardChange scopes `git add` to the completing task's own board file only (BACK-621)

## Phase A: scope the commit + regression test

### Tests (write first)
- `src/test/engine-merge.test.ts` (or a new `src/test/engine-commit-board.test.ts` alongside it, same real-tmp-git-repo helpers): 
  - "commits only the target task's board file, leaving an unrelated dirty board file untouched": create two task board files (`backlog/tasks/task-a.md`, `backlog/tasks/task-b.md`), commit both; modify `task-a.md` (simulating the completion write) AND leave `task-b.md` modified-but-uncommitted (simulating an unrelated in-flight claim); call `gitCommitBoardChange(repo, "TASK-A", "done")`; assert the resulting commit's changed-files list contains only `task-a.md`, and `git status` still reports `task-b.md` as modified (untouched, not swept in).
  - "still commits when only the target file is dirty" (existing behavior, keep passing).

### Implementation
- `src/harness/real-primitives.ts` `gitCommitBoardChange`: replace `git add -A -- backlog` with a glob resolution scoped to the task (e.g. list `backlog/tasks/` entries matching the task ID prefix, same convention as `.wt`/`.signal` files) and pass that explicit file list to `git add --`.

### DoD
- [ ] `bun test src/test/engine-merge.test.ts src/test/engine-merge-wire.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints

- `gitCommitBoardChange` keeps its existing `(repoPath, taskId, verdict) => Promise<void>` signature — no new parameters.
- No behavior change to the no-op case (nothing staged → no commit).
- Stay a pure harness primitive (shell-out only, no engine-core imports), consistent with `gitMergeBranch` in the same file.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-05T00:17:08Z
<!-- SECTION:NOTES:END -->
