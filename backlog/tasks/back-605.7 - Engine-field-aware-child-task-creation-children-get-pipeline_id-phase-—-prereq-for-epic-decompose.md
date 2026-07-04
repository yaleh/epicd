---
id: BACK-605.7
title: >-
  Engine-field-aware child task creation (children get pipeline_id/phase) —
  prereq for epic-decompose
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 08:17'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-600.7
parent_task_id: BACK-605
ordinal: 17600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
decomposer（BACK-605.5）建的 children 若无 `pipeline_id`/`phase`，**引擎 scan 看不见**（`run.ts` 按 `pipeline_id===executionPipeline.id` 过滤；`interpreter.scan` 跳过无 pipeline_id/phase 的 task）。现 `backlog task create` / `TaskCreateInput` **不带引擎字段**（board 现用 `createTaskFromInput` + 单独 `updateTask` frontmatter patch，见 engine-driver-board.test.ts:50-55）。本 task 提供**建子即带引擎字段**的路径，供 decompose 用。

## 范围
- 提供 helper（core 或 harness）`createChild(parentId, input, { pipeline_id, phase })`：`createTaskFromInput(...)` 后 stamp `pipeline_id`/`phase`/`parent_id`（复用现有 create + updateTask patch 模式），或扩展 `TaskCreateInput` 接受引擎字段——**refine 决定**（后者更收敛，前者更简、复用现模式）。
- 测试：建出的 child load 回来 `pipeline_id==='execution' && phase==='ready' && parent_id===<epic>`；随后 `interpreter.scan` 能识别它。

## 非目标
- decompose 逻辑（605.5）；多 pipeline；status↔phase 迁移（E1）。

## 归属/协调
属 **E1 field-registry**（TaskCreateInput/create 派生）。作为 decompose 的**手动 bootstrap 前置**前移；E1 落地须复用。

## 参考
`src/engine/run.ts`（pipeline_id 过滤）、`src/engine/interpreter.ts`（scan）；engine-driver-board.test.ts:50-55（create+updateTask patch 模式）；`src/types/index.ts`（TaskCreateInput）；BACK-605.5（消费者）；BACK-601（E1）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
