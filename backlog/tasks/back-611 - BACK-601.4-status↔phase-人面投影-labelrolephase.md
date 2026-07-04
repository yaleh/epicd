---
id: BACK-611
title: 'BACK-601.4 - status↔phase 人面投影 label(role,phase)'
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 10:44'
updated_date: '2026-07-04 13:31'
labels: []
dependencies: []
ordinal: 22000
pipeline_id: execution
phase: ready
parent_id: BACK-601
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
引入唯一 label(role, phase) 投影函数（config 已声明的 "<Role>: <Phase>" 串）作为 status 显示计算的唯一处，将 web/CLI/board/status-callback 的显示读指向它，收敛当前隐式 status-vs-phase 分裂。turn/role 保持派生、绝不持久。Scope：新投影 helper（与 registry 同处，单函数）、显示消费点（web/CLI/board/status-callback）。E1 只产出投影；E4 消费（lane 渲染不在 E1）。依赖 601.2（A）；与 601.3（B）、601.5（D）并行。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Phase A done: added label(role,phase) + displayStatus(task,statuses) to src/core/field-registry.ts; projection tests green (src/test/status-label-projection.test.ts). Starting Phase B: repoint web/CLI/board/status-callback display reads.

Phase B done: repointed display-status consumers to displayStatus(task, statuses): board grouping (src/board.ts), CLI plain-text Status line (src/formatters/task-plain-text.ts + task view call sites in src/cli.ts), and onStatusChange callback old/new status (src/core/backlog.ts). DoD verified in worktree: bunx tsc --noEmit clean; bun run check . clean (pre-existing warnings only, none in touched files); bun test green except pre-existing environmental build.test.ts timeout (confirmed failing on clean base, unrelated).
<!-- SECTION:NOTES:END -->
