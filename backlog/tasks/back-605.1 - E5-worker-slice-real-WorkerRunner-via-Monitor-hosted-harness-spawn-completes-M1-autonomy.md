---
id: BACK-605.1
title: >-
  E5 worker slice: real WorkerRunner via Monitor-hosted harness spawn (completes
  M1 autonomy)
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 06:16'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies: []
parent_task_id: BACK-605
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan；勿手工直入 Backlog】

## 为什么
E0 引擎 core 已完整（interpreter/pipeline/driver/safety/adjudicate/统一握手/board-store/run 循环/spawn 接缝），**但 `engine run` 仍 stub spawn**（`spawn: () => ({success:true})`），全仓无任何 `WorkerRunner` 实现——所以"自治跑通一条 Basic task"目前只用 test-double 证明过。本 task 实现**真 WorkerRunner**，把 `engine run` 从 stub 换真，**完成 M1 全自治**。这是 E5 worker 切片（child1 supervisor/run + child2 worker/spawn 的最小交集）前移为 M1 收尾。

## 范围
- **真 WorkerRunner**（`src/engine/spawn.ts::WorkerRunner` 的实现，**在引擎 core 之外**）：在 `safety.withWorktree` 建的 worktree 内 **spawn 真 Claude Code Agent** 去实现 task + 跑其 DoD；结果经 `engine.complete`（`completeTask`）回流，引擎裁决 + merge。
- **Monitor 托管**：一个持久 `Monitor` 承载 `engine run`（或等价 loop），在 `item-ready` 时驱动真 WorkerRunner——对应 baime 的 `handle-basic-ready.sh` + Monitor 模式。
- 把 `engine run` CLI 的 stub worktree 换成注入**真 runner**（默认真、测试可注 fake）。
- **引擎 core 仍零 `Agent()`/子进程**（接缝纪律；`! grep -rq 'Agent(' src/engine` 守住）。
- **端到端**：引擎自治跑通一条**真** Basic task（真 Claude Code worker 实现）= **真 M1 自治证明**（替代 600.9 的 test-double）。

## 非目标（E5 其余 children）
- 多 pipeline 泛化（driver-per-pipeline）；操作 skill（propose/promote/inbox/run/init）；插件打包；authoring refine/reviewer workers。本 task 只做**单 pipeline execution 的真 worker + Monitor 托管**。

## 边界
E5 后续把它泛化为 N pipeline + 打包为插件（child1/child2 完整版）。本 task 是最小真 worker，解锁真 M1。

## 参考
docs/uml/runtime-deployment.puml；ADR-014/017（spawn 接缝：引擎编排、harness spawn）；baime `plugin/scripts/handle-basic-ready.sh` + loop-backlog Monitor（参照实现）；BACK-600.9（seam）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
