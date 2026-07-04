---
id: BACK-605.6
title: >-
  Re-add optional stored `role` field (pre-declared compound) to Task schema —
  prereq for epic-decompose
status: 'Basic: In Progress'
assignee: []
created_date: '2026-07-04 08:17'
updated_date: '2026-07-04 08:29'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-600.7
parent_task_id: BACK-605
ordinal: 17500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
epic-decompose（BACK-605.5）须靠**存储的 `role`** 认出"未 decompose 的 epic"（它没子，不能靠子数判）。但 600.7（四轴 reconcile）把 role 当**纯派生**从 schema 移除了（架构评审实测确认 type/parser/serializer 均无 role）。ADR-011 D-1.1：role **通常派生自树，但预声明意图时可存**——epic 正是这个 case（声明 compound 却还没子）。本 task 把 `role` 作**可选存储字段**加回（不改"默认派生"语义，只补"可预声明"）。

## 范围
- `src/types/index.ts`：Task 加 `role?: "compound" | "primitive"`（可选，预声明用）。
- `src/markdown/parser.ts` / `serializer.ts`：读写 `role`（frontmatter）+ 往返测试。
- helper `roleOf(task)`：显式 `task.role` 优先，否则从树派生（有子=compound / 叶=primitive）——供 605.5 的 compound 检测用。

## 非目标
- 不改四轴"role 默认派生"裁决；只加"可预声明"的存储位。decompose 逻辑（605.5）。

## 归属/协调
`role` 是 **E1 field-registry** 内容（BACK-601 child2 schema 收敛）。本 task 作为 decompose 的**手动 bootstrap 前置**前移；E1 field-registry 落地时须复用/不重复此字段。

## 参考
ADR-011 D-1.1；600.7（移除 role）；BACK-605.5（消费者）；BACK-601（E1 field-registry）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: optional stored `role` field (pre-declared compound)

Proposal: 见 Description。**只加可选存储位，不改四轴"role 默认派生"裁决。**

## Phase A: role 字段 + parser/serializer 往返
### Tests (write first)
- `src/test/engine-role-roundtrip.test.ts`：frontmatter 带 `role: compound` 的 task parse→serialize 往返无损、`task.role==='compound'`；不带 role → `task.role` undefined（不写空 role）。
### Implementation
- `src/types/index.ts`：`Task` 加 `role?: "compound" | "primitive"`（可选）。
- `src/markdown/parser.ts`：读 frontmatter `role`。`src/markdown/serializer.ts`：仅当 role 非空时写。
### DoD
- [ ] `bun test src/test/engine-role-roundtrip.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: roleOf(task) helper（显式优先，否则派生）
### Tests (write first)
- `src/test/engine-roleof.test.ts`：`roleOf(task)` = `task.role`（若设）；否则 `subtasks?.length>0 ? 'compound' : 'primitive'`。childless + `role:compound` → compound；childless 无 role → primitive。
### Implementation
- `src/engine/role.ts`：`roleOf(task)`（供 605.5 compound 检测）。
### DoD
- [ ] `bun test src/test/engine-roleof.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- 只加可选存储位；不改四轴默认派生。role 归 E1 field-registry，本 task 前移不重复。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog（orchestrator=main session）：ProposalLoop。Plan review: **APPROVED**（independent architect，合并审 605.6+605.7，GCL E=5 C=2 H=1）——role 字段实测不存、subtasks 在、parser/serializer 位置确认；roleOf 纯函数放 src/engine/role.ts seam 干净。minor：Phase A 测试须断言 role===undefined 时不写 role: key（已在 roundtrip 测覆）。适配：跳 baime-plugin Step D。推到 Basic: Ready 供 worker 执行。

claimed: 2026-07-04T08:29:38Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-role-roundtrip.test.ts
- [ ] #2 bun test src/test/engine-roleof.test.ts
- [ ] #3 bunx tsc --noEmit
- [ ] #4 bunx biome check src/engine/ src/types/ src/markdown/
<!-- DOD:END -->
