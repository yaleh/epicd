---
id: BACK-605.1
title: >-
  E5 worker slice: real WorkerRunner via Monitor-hosted harness spawn (completes
  M1 autonomy)
status: 'Basic: Done'
assignee: []
created_date: '2026-07-04 06:16'
updated_date: '2026-07-04 06:44'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies: []
parent_task_id: BACK-605
ordinal: 1000
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: real WorkerRunner via Monitor-hosted harness spawn

Proposal: 见本任务 Description（为什么 / 范围 / 非目标 / 边界 / 参考）。
Plan review: iter1 NEEDS_REVISION（phase 序 + 重复接线）→ iter2 APPROVED（已修，见下）。

> 本质约束：**真 Claude Code Agent spawn 无法用 `bun test` 验**（需活的 harness）。TDD 覆盖"注入式 runner + brief 构造 + run 循环闭环"（注入 fake spawn primitive）；真 spawn 由 soak/手工 e2e 证明（见 Constraints）。seam：引擎 core（src/engine）绝不 `Agent(`/子进程——真 primitive 由 harness 注入。

## Phase A: real WorkerRunner（src/harness/，注入式 spawn primitive）
### Tests (write first)
- `src/test/engine-worker-runner.test.ts`：`makeWorkerRunner(spawnPrimitive)` → `WorkerRunner`；`run(task, worktreePath)` 用注入 **fake spawnPrimitive** → 断言 brief 含 task 实现要点 + DoD + worktreePath，返回 `CompletionResult`。
### Implementation
- `src/harness/worker-runner.ts`（**core 之外**）：`makeWorkerRunner(spawnPrimitive)`；`run()` 构造 brief + 调 `spawnPrimitive(brief, worktreePath)` → `CompletionResult`。真 primitive 由 harness/Monitor 注入；测试注 fake。
### DoD
- [ ] `bun test src/test/engine-worker-runner.test.ts`
- [ ] `! grep -rq 'Agent(' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase B: engine run 去 stub → 真 runner 为唯一默认（依赖 Phase A）
### Tests (write first)
- `src/test/engine-run-runner.test.ts`：`engine run` 的 runner 可注入；**fake runner** 驱动一条 `Basic: Ready` fixture → completeTask → done；断言 CLI 默认已用 `makeWorkerRunner`（stub `success:true` 常量消失）。
### Implementation
- 改 `src/cli.ts` `engine run`：删 stub，import Phase A 的 `makeWorkerRunner`，构造真 runner 注入（经 `realSpawn`）；`worktree.spawn` 委托 runner.run。**这是唯一的默认接线点。**
### DoD
- [ ] `bun test src/test/engine-run-runner.test.ts`
- [ ] `! grep -q 'success: true as const' src/cli.ts`
- [ ] `bunx tsc --noEmit`

## Phase C: Monitor 托管 skill + e2e 闭环（fake primitive）
### Tests (write first)
- `src/test/engine-monitor-e2e.test.ts`：Monitor 托管 run 循环（注入 fake spawnPrimitive）驱动隔离 fixture 真板 `Basic: Ready` → run→realSpawn→completeTask→merge→`Basic: Done`；single-active-driver guard 生效。
### Implementation
- 薄 harness skill（`epicd:run` / SKILL.md）用 **Monitor** 承载 `engine run`（baime loop-backlog SKILL 模式）；skill 本体不 bun-test（harness），其 wiring 由 e2e double 覆盖。**默认 runner 接线已在 Phase B，不重复。**
### DoD
- [ ] `bun test src/test/engine-monitor-e2e.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- **真实 Claude Code Agent spawn（真 spawnPrimitive）+ Monitor 承载 = harness 侧，无法 bun test 验**；由 soak/手工 e2e 证明（引擎自治跑通一条**真** Basic task），结果记 notes——这才是真 M1 自治证明。
- 引擎 core（src/engine）绝不 spawn；harness 适配层放 `src/harness/`（core 之外）。
- 单 pipeline execution；多 pipeline 泛化 + 插件打包 = E5 其余 children。
- single-active-driver + 旧 baime loop 冷备（共享 `.merge-lock`）。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog（/baime:feature-to-backlog，orchestrator=main session）：existing task → ProposalLoop。
Plan review iter1: NEEDS_REVISION（independent architect agent，GCL E=6 C=3 H=0）：① phase 序缺陷（Phase A 去-stub 依赖 Phase B 的 makeWorkerRunner，tsc 先挂）→ 互换；② A/C 重复默认接线 → 收敛到去-stub phase；③ Phase C 补 tsc DoD。
Plan review iter2: APPROVED（三项修正已应用：Phase A=makeWorkerRunner 先行、Phase B=去-stub 唯一默认接线、C 纯 Monitor skill+e2e）。
适配说明：跳过 baime-plugin 专属 Phase-5 Step D（与 600.4–.6/600.9 一致）。诚实约束：真 Agent spawn 在 Constraints（soak/手工 e2e），非 bun-test。

claimed: 2026-07-04T06:34:46Z

workerLoop DoD #0: PASS — bun test src/test/engine-worker-runner.test.ts

workerLoop DoD #1: PASS — ! grep -rq 'Agent(' src/engine

workerLoop DoD #2: PASS — bun test src/test/engine-run-runner.test.ts

workerLoop DoD #3: PASS — ! grep -q 'success: true as const' src/cli.ts

workerLoop DoD #4: PASS — bun test src/test/engine-monitor-e2e.test.ts

workerLoop DoD #5: PASS — bunx tsc --noEmit

workerLoop DoD #6: PASS — bunx biome check src/engine/ src/cli.ts

Phase A ✓ 2026-07-04T00:00:00Z
DoD #4: PASS — bun test src/test/engine-worker-runner.test.ts (9 pass)
DoD #5: PASS — ! grep -rq 'Agent(' src/engine
Phase B ✓ 2026-07-04T00:00:00Z
DoD #6: PASS — bun test src/test/engine-run-runner.test.ts (6 pass)
DoD #7: PASS — ! grep -q 'success: true as const' src/cli.ts
Phase C ✓ 2026-07-04T00:00:00Z
DoD #8: PASS — bun test src/test/engine-monitor-e2e.test.ts (6 pass)
DoD #1: PASS — bunx tsc --noEmit
DoD #2: PASS — bun run check . (warnings only, no errors)
DoD #3: PASS — bun test --parallel (1501 pass, 0 fail)

Completed: 2026-07-04T06:44:35Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-worker-runner.test.ts
- [ ] #2 ! grep -rq 'Agent(' src/engine
- [ ] #3 bun test src/test/engine-run-runner.test.ts
- [ ] #4 ! grep -q 'success: true as const' src/cli.ts
- [ ] #5 bun test src/test/engine-monitor-e2e.test.ts
- [ ] #6 bunx tsc --noEmit
- [ ] #7 bunx biome check src/engine/ src/cli.ts
<!-- DOD:END -->
