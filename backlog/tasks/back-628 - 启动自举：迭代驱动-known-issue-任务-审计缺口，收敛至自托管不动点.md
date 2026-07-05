---
id: BACK-628
title: 达成自托管：自审计 epic（审计即 decompose/eval，零新增 blocker 即不动点）
status: 'Epic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 05:53'
updated_date: '2026-07-05 06:06'
labels:
  - 'kind:epic'
  - 'epicd:bootstrap'
dependencies:
  - BACK-627
  - BACK-601.1
ordinal: 41000
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
- [ ] #1 已定义的 known-issue 任务 BACK-627（phase→status 派生集中）与 BACK-601.1（IssueSource 数据面）被执行至 Done（作为依赖门槛）
- [ ] #2 子任务'点火 E1 dogfood'完成：epicd 引擎自身分解 BACK-601 并驱动其 children 至 terminal，无手工推进 phase，证据记入 docs/research/gcl-events.jsonl
- [ ] #3 子任务'内化 supervisor'完成：执行车道不再依赖 baime Monitor+scan-loop 供电，swap-litmus 通过
- [ ] #4 子任务'自举可行性审计'为可重跑的独立上下文检查：每轮产出可行性证据 + 把新发现阻塞建成 task；连续一轮零新增阻塞即判不动点到达
- [ ] #5 收敛判据 a–d 全满足，并由一次 negative-control 复核（呼应 E1 memory 的 recurring stub 暗礁：DoD-green 不等于真实现）
- [ ] #6 达不动点时由一次 negative-control 复核背书（DoD-green≠真实现）
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 机器门控条款须带 negative-control（构造违例输入证明 gate 拒绝）——本 epic 及其子任务的完成前提
<!-- DOD:END -->
