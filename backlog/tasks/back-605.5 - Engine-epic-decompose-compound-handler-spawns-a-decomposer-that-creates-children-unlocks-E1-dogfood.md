---
id: BACK-605.5
title: >-
  Engine epic-decompose: compound handler spawns a decomposer that creates
  children (unlocks E1 dogfood)
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 08:04'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.4
parent_task_id: BACK-605
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
M1 已证明引擎自治跑**真 Basic task**。但 `src/engine/driver.ts` 对 **compound/epic → `needs-human` stub**（不会 decompose）。所以 **epic 还不能被引擎自驱**——E1（epic）作第一个引擎自驱 dogfood 卡在这里。本 task 让引擎能 **decompose 一个 epic**：为其创建 children、推进到 awaiting-children。

## 关键设计难点（须在 refine 解决）
- **compound 检测**：现 `isPrimitive(task) = 无 subtasks`。但**未 decompose 的 epic 没有 children → 会被误判 primitive 去执行**。须靠**存储的 `role: compound`**（ADR-011 D-1.1「预声明意图时存储」）区分。→ (a) `isPrimitive`/新 `isCompound` 读 `task.role`（compound=显式或有子）；(b) E1–E7 等 epic 须带 `role: compound`（设值/回填，协调 E1）。
- **decomposer = 真 worker（spawn seam）**：compound handler 经**注入的 spawn primitive** 起一个**真 claude 决composer worker**，读 epic 的 plan（Sub-Task Decomposition 骨架）→ **创建 child tasks**（带引擎字段 pipeline_id/phase/parent；经 CLI/IssueSource）→ park 至 backlog/ready。引擎 core 不 spawn（seam 纪律，`! grep -rq 'Agent(' src/engine`）。对应 baime `epic-ready` 决composer。
- **推进**：decompose 成功 → epic phase → `awaiting-children`；失败/无子 → needs-human。
- **幂等**：重跑不得重复建 children（cap/已存子检测）。

## 范围
- compound 检测（读 role）+ driver 的 compound 分支从 stub 改为 decompose handler。
- decomposer worker（harness，注入 spawn primitive）+ 创建 children 的引擎侧写入（pipeline_id/phase/parent 落对）。
- 推进 epic → awaiting-children；幂等守卫。

## 非目标（后续/其它）
- **epic evaluate**（all-children-terminal → done/needs-human）= 单独一件（可 605.6）——本 task 只做 decompose。
- 多 pipeline / 插件打包（E5 其余）。

## 依赖 / 边界
BACK-605.4（M1 worker 链就位）。decomposer 复用 605.1 的 spawn seam + 605.2 的 worktree（若在 worktree 内建子，须协调；或 decompose 直接在主板建子、不走 worktree——refine 决定）。

## 参考
ADR-011 D-1.1（role 派生/预声明）；execution-class.puml（Decompose/Evaluate）；`src/engine/driver.ts`（compound→needs-human stub）、`adjudicate.ts`（isPrimitive）；baime `handle`/`epic-ready` 决composer（参照）；E1（BACK-601）plan 骨架（被 decompose 的对象）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
