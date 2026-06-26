---
id: BACK-603
title: 'E3: pipeline-as-data 泛化 + exploration pipeline'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-06-26 08:36'
labels:
  - 'kind:epic'
  - 'epicd:E3'
dependencies:
  - BACK-601
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
补全 pipeline-as-data 泛化（ADR-011 D-2/D-3）：引擎为任意 DAG 的解释器。以 **exploration pipeline**（`spike→evaluate→kill/promote`）作为验证扩展性的第三条实例——它与 execution 的成功定义根本不同，正是"多 pipeline"的存在理由。

包含 **cross-pipeline edge**（`provenance.spawned_from`，区别于 `parent_id`），以及把完整 ADR-010 不变量折入引擎测试套件。

**验收测试（耦合纪律）**：加一条新 pipeline 只触碰「数据定义 + 新 handler」，永不触碰解释器/引擎 core。

参考：ADR-011 D-2/D-2.3/D-3；baime 讨论记录 §12/§15.3 E3。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1（E0 完成）之后由 epicd 引擎自驱**；exploration pipeline 本身是新增的第三条 pipeline 实例，正好用引擎自驱链路验证"加 pipeline 不改 core"。旧 loop-backlog 仅作 soak fallback，本 epic 不触发旧机制退役。

## 测试 / build 机制
- **单元测试**：解释器对任意 DAG 的 `(pipeline,state)` 分派；cross-pipeline edge（`provenance.spawned_from` vs `parent_id`）区分；handler-registry 注册/查找。
- **集成测试**：exploration pipeline 端到端跑通 `spike→evaluate→kill/promote`（与 execution 不同的成功定义）。
- **耦合纪律测试**：以"新增一条 pipeline 只改数据定义 + 新 handler、diff 不触碰解释器/core"为可执行断言（AC#3）。
- **完整 ADR-010 不变量**进引擎测试套件（AC#4），细分 unit（不变量逐条）+ 集成（多 pipeline 并行）。
- **build**：`bunx tsc --noEmit` + `bun run check .` + `bun run build` 全绿。

## Web UI 改进方向
多 pipeline 引入后，kanban / board 视图**不得硬编码 execution 状态列**——须能渲染 exploration 的 `spike/evaluate/kill/promote` 等任意 pipeline 状态。本 epic 须确认 board 渲染由 pipeline 数据定义驱动（列由 pipeline 的 state 集派生），与 E4 看板 repoint 协调；如现有 board 硬编码了 Basic/Epic 状态，须在此暴露并记为 E4 的改造输入。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] exploration pipeline（spike→evaluate→kill/promote）以纯数据定义并跑通
- [ ] cross-pipeline 派生经 `provenance.spawned_from` 记录，与 `parent_id` 区分
- [ ] 加新 pipeline 不触碰解释器/core（耦合纪律验收）
- [ ] 完整 ADR-010 不变量进引擎测试套件
