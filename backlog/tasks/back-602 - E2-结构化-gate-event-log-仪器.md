---
id: BACK-602
title: 'E2: 结构化 gate-event log（仪器）'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-06-26 08:36'
labels:
  - 'kind:epic'
  - 'epicd:E2'
dependencies:
  - BACK-600
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
人面向 task 仍是 markdown（视图）；gate event **同时**追加到结构化、可查询的日志（仪器）。引擎只知道 `GateEvent` 的通用形状 `{id, item_id, pipeline_id, gate, actor, verdict, timestamp, payload}` 与读写 API（可上游）。

**边界（§7）**：E/C/H、GCL、delta_H 的语义全在 `payload`，由 baime 的 GCL 管线解释——引擎 core 永不硬编码这些。存储 append-only、可查询（JSONL 或 SQLite，实现待定）。

参考：ADR-011 D-4；baime 讨论记录 §7/§15.3 E2。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1（E0 完成）之后由 epicd 引擎自驱**；旧 loop-backlog 仅作 soak fallback，本 epic 不触发旧机制退役。注意：当前 GCL 事件已临时落在 `docs/research/gcl-events.jsonl`，本 epic 须把该临时格式收敛进正式 `GateEvent` 存储——即这是"临时 JSONL → 引擎正式 gate-event log"的切换点（数据迁移须在 plan 中明确）。

## 测试 / build 机制
- **单元测试**：GateEvent append-only 写入、并发写串行化、读写 API、查询过滤；payload 不被 core 解释的边界测试（core 不含 E/C/H 字段）。
- **e2e**：CLI/API 层集成测试（写入 → 查询往返）；属基质层，无浏览器 e2e。
- **build**：存储选型（JSONL vs SQLite）须在 plan 定下并说明理由；`bunx tsc --noEmit` + `bun run check .` + `bun run build` 全绿。

## Web UI 改进方向
本 epic **不建 UI**，但须提供 **Web 可消费的读 API**——它是 E4（BACK-604）gate-inbox 页面的唯一数据源。读 API 须支持按 pipeline/gate/actor/时间过滤与分页，以便移动优先 inbox 增量加载。E4 依赖此契约，故 API 形状须在本 epic 冻结。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] `GateEvent` 通用 schema + append-only 存储（JSONL/SQLite）
- [ ] 读写 API（引擎给基质，不解释 payload）
- [ ] baime GCL 管线可从 log 读取并解释 payload 中的 E/C/H
- [ ] 引擎 core 不含任何 E/C/H/GCL 硬编码
