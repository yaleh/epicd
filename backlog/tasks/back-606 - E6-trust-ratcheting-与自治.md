---
id: BACK-606
title: 'E6: trust ratcheting 与自治'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-06-26 08:37'
labels:
  - 'kind:epic'
  - 'epicd:E6'
dependencies:
  - BACK-602
  - BACK-605
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 gate 的 actor 从恒为 human 演进为默认 llm + 校准风险触发的异步升级。每个 gate 有一个 `actor`（llm/human）和一个 escalation predicate；演进 = actor 默认 llm，仅当升级条件触发时升级到 human。

**trust ratcheting**：shadow 模式 → auto + 抽样审计 → full-auto + 升级。**escape rate** 作为 ratchet 度量。首个 gate（`promote`，风险最低）以 shadow 模式起步，用一致率喂 trust ratchet。属持续/研究性工作。

参考：baime 讨论记录 §11/§15.3 E6。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1 之后由 epicd 引擎自驱**，且依赖 E2（gate-event log）与 E5（操作 skill 已退役旧机制）。属**持续/研究性**工作，没有单一"完成"切换点；其推进本身就是"gate actor 从 human → llm"的渐进切换——每个 gate 经 shadow→抽样→auto 棘轮独立推进，可逐 gate 滚动，不要求一次性切换。

## 测试 / build 机制
- **单元测试**：gate actor/escalation predicate 模型；shadow 模式（llm 裁决记录但不生效）；一致率与 escape rate 采集；ratchet 状态机（shadow→抽样→auto 的状态转移与回退）。
- **e2e**：研究性，浏览器 e2e 可选；但 shadow 模式下 llm-vs-human 一致率须能从 E2 gate-event log 回放验证。
- **build**：`bunx tsc --noEmit` + `bun run check .` + `bun run build` 全绿；ratchet 度量须可离线从 gate-event log 重算（不依赖运行时状态）。

## Web UI 改进方向
须在 E4 gate-inbox 上加**最小可视化**：
- 每条 gate 显示 `actor`（llm/human）及 shadow 模式下的"llm 裁决 vs human 裁决"对比；
- 暴露每个 gate 的 trust 档位（shadow / 抽样 / auto）与当前 escape rate；
- human 可在 inbox 内逐 gate 推进或回退棘轮档位。
属 E4 UI 的增量，不另起新 UI。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] gate 模型含 actor + escalation predicate
- [ ] `promote` gate 以 shadow 模式起步，记录 llm-vs-human 一致率
- [ ] escape rate 作为 ratchet 度量被采集
- [ ] shadow→抽样→auto 的棘轮机制可逐 gate 推进
