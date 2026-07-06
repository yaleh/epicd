---
id: BACK-643
title: >-
  roleOf() ignores kind:epic label for pre-decompose epics, causing cosmetic
  Basic:/Epic: status mislabel
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-05 14:56'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:bug'
dependencies: []
ordinal: 63000
pipeline_id: authoring
phase: draft
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
任务发现于 BACK-604 派发流程：对一个 label 含 kind:epic、但尚未 decompose（无 children、无 role 字段）的 Epic 跑 `task edit --phase decomposing` 或 --status "Epic: Decomposing"，展示状态都会被 roleOf()（src/types/index.ts:150-154）派生成 Basic:，因为它只看 role 字段/children 是否存在，不看 kind:epic label。engine promote（src/cli.ts:4753-4762）已经知道这个坑，预先写 role: compound 绕开，但普通 task edit / TaskUpdateInput 完全没有暴露 --role 这个字段，所以没有支持的 CLI 路径能在 decompose 之前把一个 Epic 声明成 compound。底层数据（phase/status 持久化值）是对的，只是显示层（task-plain-text.ts:87 → displayStatus → label(roleOf(task), phase)）派生错了前缀。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
