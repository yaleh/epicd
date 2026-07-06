---
id: BACK-662
title: >-
  gitMergeBranch board-only-conflict auto-resolve breaks on non-ASCII task
  filenames (quoting bug)
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-06 09:19'
labels:
  - 'kind:bug'
  - 'area:engine'
dependencies: []
priority: high
ordinal: 80000
pipeline_id: authoring
phase: draft
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during BACK-655's engine complete --worktree run: src/harness/real-primitives.ts gitMergeBranch() detects a board-only conflict via 'git diff --name-only --diff-filter=U' and passes the resulting lines straight to 'git checkout --ours --' / 'git add --' as pathspecs. Without -z, git shell-quotes/escapes non-ASCII filenames (e.g. any task title containing Chinese characters, which is most of this repo's real board) in that output, so the pathspec never matches the real file and the auto-resolve silently falls through to abort+needs-human — even though the conflict is the expected, harmless board-file-only case this code path exists to handle. Repro: any task whose title has non-ASCII characters and needs an automated engine-complete merge past a stale worktree-branch copy of its own board file. Fix: use 'git diff --name-only -z --diff-filter=U' and split on NUL, or pass core.quotepath=false, when building the pathspec list in gitMergeBranch(). Manually verified the -z form resolves cleanly on BACK-655's own board file.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
