---
id: BACK-628.3
title: 自举可行性审计：独立上下文 inspection 识别 stub/gap，产出新 task，直至零新增阻塞
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 05:54'
labels:
  - 'kind:chore'
  - 'epicd:bootstrap'
dependencies: []
parent_task_id: BACK-628
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
E1 memory 记的 recurring meta-pattern：**每个 DoD-green 的 done 都藏过 stub，只被 inspection / 独立 architect review / negative-control 抓到，从没被门禁抓到**。一个会自证的自驱环会累积假绿。本任务是 BACK-628 的**收敛闸**：一个可重跑的、独立上下文的审计，判定自举是否真的可行/达成。

## 每轮审计做什么（loop-until-dry）
1. 以**独立上下文**执行（fresh reviewer，不复用执行 agent 的 context）——禁止自证。
2. 核对内核不变量确实成立，尽量用 **negative-control**（构造应失败的输入，确认门禁真的拦）：scan 是纯函数、ENG-8 引擎在 worktree 重跑 DoD、merge-lock 串行、cap 幂等、场身份 (sourceId,pipeline_id)。
3. 排查 DoD-green 背后的空实现/stub、status↔phase desync 残留、stale-in-progress 孤儿（In Progress + 空 worktree + 无 agent）。
4. 每发现一个新点火阻塞/ stub，**经 backlog CLI 新建 task 并 --dep 链接 BACK-628**（不在本文件手记）。
5. 连续一轮零新增阻塞 → 记录不动点到达证据（含所用 negative-control）。

这是 chore（研究/审计→checklist），不写产品代码。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 每轮审计以独立上下文（fresh reviewer）执行，产出物注明未复用执行 agent 的 context——禁止自证
- [ ] #2 内核不变量以 negative-control 复核：至少对 ENG-8（worker 不能自证 done）与 cap 幂等各构造一个应失败输入并确认被拦
- [ ] #3 每个新发现的点火阻塞/stub 经 backlog CLI 建成 task 并 --dep BACK-628；stub（DoD-green 但空实现）单独标注
- [ ] #4 存在'连续一轮零新增阻塞'的记录作为不动点证据；否则明确列出仍未闭合的阻塞
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
