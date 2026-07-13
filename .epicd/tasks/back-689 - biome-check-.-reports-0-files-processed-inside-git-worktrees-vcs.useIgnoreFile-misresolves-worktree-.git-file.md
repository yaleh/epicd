---
id: BACK-689
title: >-
  biome check . reports 0 files processed inside git worktrees
  (vcs.useIgnoreFile misresolves worktree .git file)
assignee:
  - '@claude'
created_date: '2026-07-08 16:50'
labels: []
dependencies: []
ordinal: 102000
pipeline_id: authoring
phase: drafting
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
biome.json has vcs.useIgnoreFile=true with clientKind=git. Inside a git worktree (where .git is a file pointing to .git/worktrees/<name>, not a directory), 'npx biome check .' / 'bun run check .' reports 'Checked 0 files' and treats every path as ignored — even with explicit file arguments in some invocations. Explicit file-path invocations (e.g. npx biome check src/cli.ts) work correctly; only the '.' / whole-repo-scan path is affected. This silently defeats the bun run check . DoD gate for every task executed in a worktree (the normal execution mode per fixpoint-convergence), forcing a workaround of listing touched files explicitly instead. Discovered while completing BACK-687 in worktree /home/yale/work/epicd/.claude/worktrees/agent-a5768d98c08b3aa54; reproduced independently of that task's diff (same failure with no changes staged).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reproduce: in a fresh git worktree of this repo, run 'npx biome check .' and observe 'Checked 0 files in Xms' / 'No files were processed in the specified paths'
- [ ] #2 After fix, 'npx biome check .' in a git worktree processes the expected file count (comparable to running it in the main checkout) and reports the same warnings/errors
- [ ] #3 bun test passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
