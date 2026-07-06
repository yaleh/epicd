---
id: BACK-664.2
title: 删除 role 持久字段
status: Done
assignee:
  - '@claude'
created_date: '2026-07-06 14:00'
updated_date: '2026-07-06 14:43'
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
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged to main (fast-forward, f2e1849). role: field fully removed from Task type, field-registry, engine-fields-backfill, and all 89 task files that had it. roleOf() now purely tree/kind:epic-label derived. no-persisted-status-role meter check confirms 0 files with role: remaining (status: remains, that's BACK-664 child 4). tsc clean, biome clean, full suite green modulo known parallel-load flakiness (confirmed passes in isolation).
<!-- SECTION:NOTES:END -->
