---
id: BACK-606
title: 'E6: trust ratcheting 与自治'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-14 05:55'
labels:
  - 'epicd:E6'
dependencies:
  - BACK-602
  - BACK-605
ordinal: 7000
pipeline_id: authoring
phase: drafting
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
<!-- AC:BEGIN -->
- [ ] #1 gate 模型含 actor + escalation predicate
- [ ] #2 `promote` gate 以 shadow 模式起步，记录 llm-vs-human 一致率
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-04 对齐四轴终版：E6 的 gate-actor 棘轮是 E3 PipelineState.actor（结构，machine|human|none）之上的**运行时信任层**，而非改写该结构字段。结构 actor 恒定（promote gate 结构上=human）；trust ratchet 让“有效 actor”随棘轮向 machine（=E6 语境里的 llm）滞动（shadow→抽样→auto），escalation predicate = 回落到结构 human。好处：E3 的 actor 保持稳定且永可 escalate，E6 只叠运行时策略。词汇：E6 的 llm = E3 的 machine actor。UI（E4）的 👤/🤖 指示读的是“有效 actor”（结构 actor 经 trust 调制后）。

2026-07-05 granularity review (git-history churn audit): downgraded Epic→Basic. Rationale: this task cannot name a 2nd independently-mergeable deliverable right now — only the `promote` gate shadow-mode MVP (old AC#1/#2) is concretely scoped; the ratchet auto-advance mechanism (old AC#3/#4) and the E4 UI increment are still directional/unscoped research, not decomposable children. Per AGENTS.md 'Task decomposition granularity' plan-time test: no 2nd deliverable yet + size estimate for the shadow-mode-only scope (gate actor field + escalation predicate + shadow recording + unit tests) is well under the ~2000-line ceiling, nowhere near the ~3600-line margin needed to justify an Epic. Scope narrowed to the promote-gate shadow MVP; escape-rate generalization, auto-ratchet advance, and the E4 UI increment are deferred to separate future Basic tasks to be scoped when concretely needed — not pre-declared as Epic children now.
<!-- SECTION:NOTES:END -->
