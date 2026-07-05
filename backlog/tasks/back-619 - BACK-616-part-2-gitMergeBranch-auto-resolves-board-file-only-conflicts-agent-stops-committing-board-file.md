---
id: BACK-619
title: >-
  BACK-616 part 2 - gitMergeBranch auto-resolves board-file-only conflicts;
  agent stops committing board file
status: 'Basic: Needs Human'
assignee: []
created_date: '2026-07-04 23:23'
updated_date: '2026-07-05 00:02'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 31000
phase: needs-human
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

`engine complete` (the autonomous merge path) routes a task to `needs-human` whenever `gitMergeBranch` (`src/harness/real-primitives.ts:78`) hits ANY merge conflict — it does a plain `git merge --no-ff` and, on non-zero exit, aborts and returns `{conflict:true}`.

In a real monitor-driven run (proven on BACK-610, 2026-07-04) this fires on a **structural, unavoidable** collision, not a genuine code conflict: the engine owns the task's board markdown file on `main` — it writes `status`/`phase` there and commits `board: <id> -> <verdict>`. Meanwhile the implementation agent, per the `basic-ready.md` template Step 6, is permitted to run `bun run cli task edit <id> --append-notes "..."` (which rewrites the board file) and then `git add -A && git commit` — so the **branch also commits the same board file**. The two board-file edits (frontmatter `assignee`/`updated_date`/`status` + an `## Implementation Notes` block on each side) overlap and `git merge` conflicts every time. Verified empirically on BACK-610: two consecutive `needs-human` routings until the branch's board-file change was manually dropped, after which the merge was clean and the task reached `done`.

This is the second half of the board-merge-friction work. BACK-616 (part 1) fixed the engine not committing its *own* board write after merge; this task (part 2) fixes the *branch's* board write colliding with the engine's. Together they unblock genuinely unattended runs — otherwise every task lands in `needs-human` on merge and the autonomous loop cannot self-complete.

## Goals

1. A board-file-only merge collision (conflicts confined to `backlog/tasks/**`) auto-resolves in favor of `main` and the merge completes (`{merged:true}`), instead of routing to `needs-human`.
2. A genuine code conflict (any conflicted path outside `backlog/tasks/**`) still aborts cleanly and returns `{conflict:true}` — the safety property that human review catches real conflicts is preserved.
3. Defense-in-depth: the `epicd-run` implementation-agent template no longer instructs the agent to commit the task's own board file, so the collision is avoided at the source too.

## Proposed Approach

- Harden `gitMergeBranch`: on merge failure, inspect `git diff --name-only --diff-filter=U`. If every unmerged path is under `backlog/tasks/`, resolve those paths with `git checkout --ours -- <paths>`, `git add` them, `git commit --no-edit` to finish the merge, and return `{merged:true}` (main's engine-owned board state wins; the branch's board notes are intentionally discarded — the engine is the sole authority on board state). If any unmerged path lies outside `backlog/tasks/`, keep today's behavior: `git merge --abort` and return `{conflict:true}`.
- Harden the template: change `basic-ready.md` Step 6 so the agent commits with the board file excluded (do not stage `backlog/tasks/**`), keeping `--append-notes` allowed for the human-readable trail without ever committing the board file on the branch.

## Trade-offs and Risks

- Auto-resolving board conflicts in favor of `main` silently drops any board-file content the branch produced (agent `--append-notes`). This is intentional and correct: the engine owns board state; agent progress notes belong in `.agent-summary-<id>` (already the template's mechanism), not the committed board file.
- Scope is limited to `backlog/tasks/**`. Other `backlog/` subtrees (decisions, docs, drafts) are NOT auto-resolved — if a task legitimately edits those and they conflict, that still routes to `needs-human` (conservative; revisit only with a proven need).
- Not doing: a general merge-strategy rewrite or a `.gitattributes` merge driver — a targeted post-conflict resolver is simpler and keeps the "code conflicts still escalate" guarantee obvious.

## Implementation Plan

# Plan: gitMergeBranch auto-resolves board-file-only conflicts; template stops committing the board file (BACK-616 part 2)

## Phase A: gitMergeBranch resolves board-only conflicts in favor of main

### Tests (write first)
- `src/test/engine-merge.test.ts`: add a `describe("gitMergeBranch — board-file-only conflicts auto-resolve (BACK-619)")` block using the existing real-tmp-git-repo helpers:
  - `"board-file-only conflict resolves in favor of main and merges"`: init repo with a committed `backlog/tasks/t.md`; on `main` change its frontmatter and commit; on `task/TASK-1` change the same file differently and commit; `gitMergeBranch` returns `{merged:true}`, the working tree is clean, the merged `backlog/tasks/t.md` equals main's version, and branch `task/TASK-1` is deleted.
  - `"code-file conflict still aborts to conflict"`: conflict on a `src/x.ts`-style path → returns `{merged:false, conflict:true}`, repo left clean (no in-progress merge, `git status` porcelain empty).
  - `"mixed board+code conflict aborts to conflict (code path dominates)"`: simultaneous conflict in `backlog/tasks/t.md` and `foo.ts` → `{conflict:true}` (not auto-resolved), repo clean.

### Implementation
- `src/harness/real-primitives.ts` `gitMergeBranch`: after `git merge --no-ff` exits non-zero, run `git diff --name-only --diff-filter=U` to list unmerged paths. If the list is non-empty AND every path starts with `backlog/tasks/`: `git checkout --ours -- <paths>`, `git add -- <paths>`, `git commit --no-edit`; on success delete the branch and return `{merged:true}`. Otherwise `git merge --abort` and return `{merged:false, conflict:true}` (unchanged). Keep the existing clean-merge (exit 0) path as-is.

### DoD
- [ ] `bun test src/test/engine-merge.test.ts src/test/engine-merge-wire.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: implementation-agent template stops committing the board file

### Tests (write first)
- `src/test/epicd-run-wiring.test.ts`: add assertions that `.codex/skills/epicd-run/templates/basic-ready.md` Step 6 commit guidance excludes the board file — the template body contains a pathspec excluding `backlog/tasks` from `git add` (e.g. `:!backlog/tasks` / `:(exclude)backlog/tasks`) and does NOT contain a bare `git add -A && git commit` without that exclusion.

### Implementation
- `.codex/skills/epicd-run/templates/basic-ready.md`: change the Step 6 agent constraint from `git add -A && git commit` to stage everything except the task board file (e.g. `git add -A -- . ':!backlog/tasks'` then commit), with a one-line note that board state is engine-owned and `--append-notes` is for the human trail only, never committed on the branch.

### DoD
- [ ] `bun test src/test/epicd-run-wiring.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints

- Only `backlog/tasks/**` conflicts auto-resolve; all other paths (including other `backlog/` subtrees) keep escalating to `needs-human`.
- `gitMergeBranch` must stay a pure harness primitive (shell-out only, no engine-core imports) and keep its `{merged, conflict?}` return contract unchanged.
- No `.gitattributes` merge driver, no `-X ours/theirs` global strategy — resolution is an explicit, path-scoped post-conflict step so the "code conflicts still escalate" guarantee is visible in the code.
- Branch cleanup (`git branch -d`) behavior on successful merge is unchanged.

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
claimed: 2026-07-04T23:51:50Z
<!-- SECTION:NOTES:END -->
