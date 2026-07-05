---
id: BACK-605.10
title: 阶段2：gate-event 只读观测面 — CLI 查询命令 + Web 只读 gate-inbox 页面
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 11:15'
updated_date: '2026-07-05 11:15'
labels:
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.9
parent_task_id: BACK-605
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
BACK-602（E2 gate-event log）已 Done，appendGateEvent/queryGateEvents API 已存在，但**只有写路径接了 CLI**（--record），人类现在读不到任何 gate 事件——CLI 和 Web 都没有读接口。按 docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §6.3/§7：尽早提供可观测版本是唯一的 ground-truth 采样通道，且这是当前最便宜能补的观测缺口。

本任务与阶段1的 inbox skill **共用同一实现**：先在 CLI 层实现 queryGateEvents 的只读包装，inbox skill 直接复用它，一次实现两处消费。

## 做什么
1. **CLI 读命令**：新增 engine gate-log 子命令（或等价名），支持 --pipeline/--gate/--actor/--since 过滤，包 src/core/gate-event-store.ts 的 queryGateEvents。
2. **Web 只读页面**：复用现有 web 骨架（Layout/SideNavigation/BoardPage 已存在的组件模式），新增一个只读 GateInboxPage；如无现成读 API 端点，加一个薄 REST 端点转发 queryGateEvents。
3. **明确边界**：只读、不做多车道、不做 auth、不做交互式 gate-review 提交——那些是完整 BACK-604 的范围。本任务只解决'人类现在完全看不到 gate 事件在发生'这个真空。

## 非目标
- 不做 BACK-604 的多车道/auth/内联 gate-review 提交。
- 不等 BACK-603（pipeline 泛化）完成——只读观测不依赖 actor 字段泛化。

参考：BACK-602 · docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §6.3/§7 · BACK-604（后续硬前置，本任务先垫底层读接口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLI 存在只读命令，包 queryGateEvents，支持按 pipeline/gate/actor/since 过滤
- [ ] #2 Web 存在一个只读 GateInboxPage，数据源 = 同一 queryGateEvents（经 REST 端点或直接调用）
- [ ] #3 该读接口被阶段1 的 inbox skill 复用，不重复实现
- [ ] #4 范围明确不含多车道/auth/交互提交（留给 BACK-604）
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
