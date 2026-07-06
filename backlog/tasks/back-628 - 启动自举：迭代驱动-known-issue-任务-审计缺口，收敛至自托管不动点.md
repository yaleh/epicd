---
id: BACK-628
title: 达成自托管：自审计 epic（审计即 decompose/eval，零新增 blocker 即不动点）
status: 'Epic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 05:53'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:epic'
  - 'epicd:bootstrap'
dependencies:
  - BACK-627
  - BACK-601.1
ordinal: 41000
pipeline_id: execution
phase: done
role: compound
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 目标
普通 epic（role=compound 由树派生，**无 bespoke 收敛逻辑**）：把内核驱过自托管不动点。epic 不特殊——它只是一个 decompose 出 blocker、eval 到审不出新东西就 done 的 task。

## 机制（= 标准 epic 生命周期，非专用编排）
- **decompose/eval handler = 独立上下文审计**：以 fresh reviewer（不复用执行 agent 的 context）核对内核不变量确实成立，尽量用 **negative-control**（构造应失败输入、确认 gate 真拦）；把发现的 blocker/stub 作为子任务 emit。
- **不动点 = eval 审出零新增 blocker**（loop-until-dry）。有新增 → reopen；零新增 → done。
- 新发现的 blocker 用 backlog CLI 建 task 并 --dep 挂上，**不在本文件手记**。

## 已知 blocker（seeded）
- 归本 epic 管的子任务：**628.1 点火** · **628.2 内化 supervisor**。
- 归别处管的依赖：**BACK-627**（phase→status 派生集中，关 desync 类）· **BACK-601.1**（IssueSource 数据面）。

## 守住暗礁
E1 memory：每个 DoD-green 都藏过 stub、门禁从没抓到。故审计核心手段是 **negative-control**，非自证；机器门控条款须带 negative-control（见本 epic DoD + adr-as-contract-harness 切片任务）。

简化自初版：原 628.3'审计'子任务已归并为本 epic 的 decompose/eval 语义（archived）；原四条散文收敛判据删除，不动点改由引擎 eval 结果判定。

关联：ADR-013 载体律 · ADR-015 · ADR-016 · memory e1-engine-executable-milestone / issuesource-runtime-architecture / bootstrap-ignition-epic。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 已定义的 known-issue 任务 BACK-627（phase→status 派生集中）与 BACK-601.1（IssueSource 数据面）被执行至 Done（作为依赖门槛）
- [x] #2 子任务'点火 E1 dogfood'完成：epicd 引擎自身分解 BACK-601 并驱动其 children 至 terminal，无手工推进 phase，证据记入 docs/research/gcl-events.jsonl
- [x] #3 子任务'内化 supervisor'完成：执行车道不再依赖 baime Monitor+scan-loop 供电，swap-litmus 通过
- [x] #4 子任务'自举可行性审计'为可重跑的独立上下文检查：每轮产出可行性证据 + 把新发现阻塞建成 task；连续一轮零新增阻塞即判不动点到达
- [x] #5 收敛判据 a–d 全满足，并由一次 negative-control 复核（呼应 E1 memory 的 recurring stub 暗礁：DoD-green 不等于真实现）
- [x] #6 达不动点时由一次 negative-control 复核背书（DoD-green≠真实现）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-05 不动点复核（本轮）：独立 fresh-context 审计代理复查 BACK-627/628.2/628.3/628.4 四项——均 CLEAN（真实调用方 + 非平凡断言核验，非仅 DoD 勾选）；TODO/FIXME/HACK 扫描 src/engine、src/harness、src/core/backlog.ts 零命中。唯一发现：BACK-601.1 的 IssueSource/LocalIssueSource 落地后零生产调用方（仅自身测试使用）——违反 CLAUDE.md simplicity-first。经用户确认选择移除（非新开 follow-up task，因解决方案即删除本身）：删除 src/engine/store.ts 中的 IssueSource/IssueSourceFilter/IssueSourceUpsertInput/makeLocalIssueSource 及测试 src/test/engine-store-issuesource.test.ts（commit 0d05c73），makeBoardStore 保留不变。BACK-601.1 notes 已记录移除原因与回退路径。移除后 bunx tsc --noEmit / bun run check . / bun test --parallel 全绿（2 个已知 flaky 超时测试单独重跑均通过，与本次改动无关）。BACK-601 epic 自身仍处于 'Epic: Needs Human'——经核实这是 BACK-622 bug（decomposer status/phase 脱节）导致的历史性人工修正（commit c6391a3），发生在 601.1/609-612 完成之前，与本 epic AC#2（要求 children 被引擎驱动至 terminal，未要求 epic 自身经引擎 evaluate 收口）无关，不构成新 blocker，不在本次不动点范围内动它。本轮零新增 blocker → 不动点达成，epic 收口。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
- [x] #4 机器门控条款须带 negative-control（构造违例输入证明 gate 拒绝）——本 epic 及其子任务的完成前提
<!-- DOD:END -->
