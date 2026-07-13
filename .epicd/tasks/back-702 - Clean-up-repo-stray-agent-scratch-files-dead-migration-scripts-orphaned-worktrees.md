---
id: BACK-702
title: >-
  Clean up repo: stray agent-scratch files, dead migration scripts, orphaned
  worktrees
assignee:
  - '@claude'
created_date: '2026-07-13 14:21'
updated_date: '2026-07-13 14:25'
labels:
  - cleanup
dependencies: []
priority: low
ordinal: 115000
pipeline_id: execution
phase: done
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cleanup discovered while closing out BACK-701: root-level .agent-summary-BACK-*/.agent-done-phase-* worker scratch files were committed to git across ~20+ historical tasks (same leak class as the one found in BACK-701's own audit), .gitignore never had a pattern for them (only .epicd/.agent-done-* is ignored). Also found 3 unreferenced one-time migration scripts still hardcoding backlog/tasks, and 15 orphaned git worktrees for already-merged tasks. User confirmed removing all three categories.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root-level .agent-summary-* and .agent-done-* (excluding .epicd/) are removed from git tracking
- [x] #2 .gitignore gains patterns preventing these scratch files from being committed again
- [x] #3 scripts/fixpoint-back665.ts, scripts/migrate-drafts-to-tasks.ts, scripts/migrate-remove-status.ts are removed
- [x] #4 15 orphaned worktrees for already-merged tasks are removed from disk
- [x] #5 bun test still passes after cleanup
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
audit skipped: pure repo-hygiene cleanup (removing tracked scratch files, dead unreferenced scripts, orphaned merged-branch worktrees; one .gitignore addition) — no engine/security code touched, low risk, RiskGated(False) per fixpoint-convergence skill.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed 28 committed .agent-summary-BACK-*/.agent-done-phase-* worker scratch files (root-level leak, same class as the BACK-701 audit finding), added .gitignore patterns (/.agent-summary-*, /.agent-done-*) to stop recurrence. Deleted 3 unreferenced one-time migration scripts hardcoding backlog/tasks. Removed 15 orphaned git worktrees + branches for already-merged tasks. bun test (2113 pass/0 fail), tsc, and bun run check . all clean (13 pre-existing warnings, unrelated).
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
