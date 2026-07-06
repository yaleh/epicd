---
id: BACK-664.2
title: 删除 role 持久字段
status: Done
assignee:
  - '@claude'
created_date: '2026-07-06 14:00'
updated_date: '2026-07-06 17:01'
labels:
  - 'kind:basic'
dependencies: []
parent_task_id: BACK-664
ordinal: 85000
pipeline_id: execution
phase: done
parent_id: BACK-664
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-664 child 2（monitor-free，依赖 BACK-643 已完成）。

从所有 task 文件与 field-registry（field-registry.ts:333 附近）删除 `role:` 持久字段；
role 100% 由 roleOf(tree) 派生（BACK-643 已使 pre-decompose epic 通过 kind:epic label 正确派生）。

收敛信号：bun scripts/fixpoint-back665.ts 的 no-persisted-status-role check（role 部分）应转绿——
任务文件 frontmatter 不再出现 role: 字段；serializer/field-registry 不再写它。

参考：docs/task-lifecycle-model.md §2/§4，BACK-664 plan child 2，BACK-643（已 done）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged to main (fast-forward, f2e1849). role: field fully removed from Task type, field-registry, engine-fields-backfill, and all 89 task files that had it. roleOf() now purely tree/kind:epic-label derived. no-persisted-status-role meter check confirms 0 files with role: remaining (status: remains, that's BACK-664 child 4). tsc clean, biome clean, full suite green modulo known parallel-load flakiness (confirmed passes in isolation).

Follow-up (2026-07-06, this session): the f2e1849 commit above had branched off before BACK-657.1-4 landed and was never actually merged into main (board-state-only commit had landed instead) — 89 files still carried role: on disk. Cherry-picked f2e1849 onto main to land the real deletion; resolved this task file's own add/add conflict.

2026-07-06 (续): cherry-pick 已提交 main（e4b9a33, 476d416，另修复一处 BACK-657.3 之后新增、仍写 role: 的测试）。独立验证：tsc/biome/full suite 全绿（唯一失败为已知 has-children-indicator 并行竞态，单跑通过）。grep 确认 0/102 role: 残留，field-registry 已移除 role descriptor。fixpoint meter 的 no-persisted-status-role 已拆分为 no-persisted-role（绿）与 no-persisted-status（红，待 BACK-660）。
<!-- SECTION:NOTES:END -->
