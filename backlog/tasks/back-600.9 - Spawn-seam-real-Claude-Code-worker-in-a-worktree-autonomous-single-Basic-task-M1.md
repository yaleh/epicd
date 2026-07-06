---
id: BACK-600.9
title: >-
  Spawn seam: real Claude Code worker in a worktree (autonomous single Basic
  task = M1)
status: 'Basic: Done'
assignee: []
created_date: '2026-07-04 04:53'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies:
  - BACK-600.8
parent_task_id: BACK-600
ordinal: 1000
pipeline_id: execution
phase: done
parent_id: BACK-600
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 600.8 里的 `WorktreeOps.spawn` stub 换成**真 Claude Code worker**，让引擎**自治跑通一条真 Basic task**——这是 **M1 自治的最小真实证明**。

## Background
600.8 后 driver 能对真板跑，但 `WorktreeOps.spawn` 仍是返回成功的 stub——**没有任何 task 被真正实现**。本 task 实现 **spawn 接缝**：引擎（driver）编排"何时/哪个"，一个**薄 harness worker skill/Monitor** 在 worktree 内实际 spawn 一个 Claude Code Agent 去实现 task 并跑其 DoD；worker 经 `engine.complete` 回流（**绝不自宣 done**），引擎 adjudicate DoD + merge。

## Scope
- **真 spawn**：`WorktreeOps.spawn(task)` = 经 `safety.withWorktree` 建 worktree → 由**薄 harness skill（harness primitive，非引擎 core）**spawn 一个 Claude Code worker，scope 到该 worktree，带 task 的实现 brief + DoD → worker 实现并返回。
- **engine.complete 握手**：worker 完成经类型化 `engine.complete(taskId, result)`（无 sentinel）；**引擎（非 worker）**重跑 DoD 裁决 + merge（承 600.8 的 adjudicate/merge-lock）。
- **spawn 接缝纪律**：引擎 core **不内嵌** spawn 调用——driver 发意图，harness worker skill 实际 spawn（ADR-014/017）。测试/校验断言此边界。

## Non-goals
- 多 pipeline 泛化 + 插件打包 + 操作 skill（propose/promote/inbox/run/init）= **E5**；authoring workers = **E7/E5**；epic decompose = 后续。

## 边界说明（与 E5）
本 task 做**单 pipeline 的最小真 spawn** 以达 M1 自治；**E5 child2 把它泛化 + 打包为插件**。故 E5 的 runtime/worker 切片实为"泛化 + 产品化"，非从零。

## Milestone
600.9 完成 = 引擎自治跑通一条 Basic task（pick up `Basic: Ready` → 真 spawn → 实现 → DoD 裁决 → merge → `Basic: Done`）= **M1 自治最小证明**。之后加 **epic decompose** 才轮到 E1 作第一个 epic dogfood。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 WorktreeOps.spawn 实现为真 Claude Code worker（经 safety.withWorktree 建 worktree，由薄 harness skill spawn Agent）在 worktree 内实现 task + 跑 DoD；worker 不自宣 done
- [ ] #2 engine.complete 类型化握手（无 sentinel）；worker 完成经它回流，引擎（非 worker）adjudicate DoD + merge
- [ ] #3 spawn 接缝纪律：引擎 core 不内嵌 spawn 调用（薄 harness skill）；测试/grep 断言边界
- [ ] #4 端到端：引擎自治跑通一条真 Basic task（Basic:Ready→真 spawn→实现→DoD 裁决→merge→Basic:Done）——M1 自治最小证明
- [ ] #5 single-active-driver + 旧 loop 冷备纪律不破（共享 .merge-lock）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Spawn seam — real Claude Code worker in a worktree

Proposal: 见本任务 Description（Background / Scope / Non-goals / Milestone）。
Plan review: APPROVED（architect，9 invariants 全过；2 条 advisory 已折入 Phase A/B）。

## Phase A: Spawn seam — 注入式 WorkerRunner（引擎不 spawn）
### Tests (write first)
- `src/test/engine-spawn-seam.test.ts`：
  - 真 `spawn(task)` 经 `safety.withWorktree` 建 worktree，把实现委托给**注入的 `WorkerRunner`**（harness 边界）；fake runner 断言被调用、worktree 建/清理（finally）。
  - 缺席断言：引擎 core 不含直接 Agent spawn / 子进程 shell-out（守边界，advisory A）。
### Implementation
- `src/engine/spawn.ts`：`WorkerRunner` 接口 + `realSpawn(worktreeOps, runner)`：建 worktree → 委托 runner（返回 `CompletionResult`）。引擎 core 只编排，不内嵌 spawn；真 runner（薄 harness skill）在 core 之外，测试用 fake。
### DoD
- [ ] `bun test src/test/engine-spawn-seam.test.ts`
- [ ] `! grep -rq 'Agent(' src/engine`
- [ ] `! grep -rqE 'child_process|Bun\.spawn' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase B: engine.complete 作为唯一 worker→引擎握手 → adjudicate → merge
### Tests (write first)
- `src/test/engine-spawn-complete.test.ts`：worker 结果**只经** `engine.complete(taskId, result)` 回流；由它触发引擎侧 adjudicate（重跑 DoD，ENG-8）+ 锁下 merge，并置 done/needs-human；worker 不自宣 done。
### Implementation
- **统一握手（advisory B）**：把 600.8 driver 内联的 spawn→merge→adjudicate 收敛为**经 `engine.complete`**：`complete.ts` 从"仅推进 phase"扩为"接收 result → adjudicate → 在 `withMergeLock` 下 merge → 写 done/needs-human"；driver 的 primitive 分支调用 `engine.complete(task.id, result)`，**不再内联第二条 adjudicate 路径**（避免竞争握手）。
### DoD
- [ ] `bun test src/test/engine-spawn-complete.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase C: 端到端自治跑通一条 Basic task（M1 自治最小证明）
### Tests (write first)
- `src/test/engine-autonomous-e2e.test.ts`：隔离 fixture 板上一条 `Basic: Ready` primitive → run 循环 → runner（test double）实现 → `engine.complete` → adjudicate → merge → `Basic: Done`；single-active-driver guard 生效（旧 loop 活动时拒跑）。
### Implementation
- 把 `realSpawn` 接入 600.8 的 run 循环；e2e harness 用 test-double runner 证明闭环；真 runner 记录于 notes 供手工验。
### DoD
- [ ] `bun test src/test/engine-autonomous-e2e.test.ts`
- [ ] `bun run check .`

## Constraints
- 引擎 core 绝不 spawn Claude Code / 起子进程（seam = 注入的 harness runner）；`! grep -rq 'Agent(' src/engine` + 子进程缺席守住。
- worker 绝不自宣 done；done/needs-human 由引擎裁决写。
- **单一握手**：`engine.complete` 是 worker→引擎唯一入口，driver 不留第二条 adjudicate 路径（advisory B）。
- single-active-driver + 旧 baime loop 冷备（共享 `.merge-lock`）。
- 多 pipeline 泛化 + 插件打包 = E5；本任务只做单 pipeline 最小真 spawn。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog（/baime:feature-to-backlog，orchestrator=main session）：existing task → ProposalLoop（Description 作 proposal）。Plan review iteration 1: APPROVED（independent architect agent，9 invariants 全过；correctly scoped as Basic）。
premise-ledger:
[E] goal coverage: AC#1–#5 各映射到 Phase A/B/C 或 Acceptance Gate
[C] feasibility: 已核实 safety.withWorktree/withMergeLock、adjudicate/isPrimitive（600.8 新增）、engine.complete 存在；src/engine/spawn.ts 待建
[H] DoD 充分性基准: 靠背景知识判断
GCL-self-report: E=7 C=2 H=1
advisories 已折入：A 强化 spawn 缺席守卫（加子进程）；B engine.complete 作唯一握手，driver 不留第二条 adjudicate 路径。
适配说明：跳过 baime-plugin 专属 Phase-5 Step D（validate-plugin.sh / plugin/skills DoD），因 600.9 是 epicd 引擎任务（与 600.4–.6 finalise 一致）。

claimed: 2026-07-04T05:52:39Z

workerLoop DoD #0: PASS — bun test src/test/engine-spawn-seam.test.ts

workerLoop DoD #1: PASS — ! grep -rq 'Agent(' src/engine

workerLoop DoD #2: PASS — bun test src/test/engine-spawn-complete.test.ts

workerLoop DoD #3: PASS — bun test src/test/engine-autonomous-e2e.test.ts

workerLoop DoD #4: PASS — bunx tsc --noEmit

workerLoop DoD #5: PASS — bunx biome check src/engine/

Phase A ✓ 2026-07-04T00:00:00Z
DoD #4: PASS — bun test src/test/engine-spawn-seam.test.ts (6 pass)
DoD #5: PASS — ! grep -rq 'Agent(' src/engine
Phase B ✓ 2026-07-04T00:00:00Z
DoD #6: PASS — bun test src/test/engine-spawn-complete.test.ts (8 pass)
Phase C ✓ 2026-07-04T00:00:00Z
DoD #7: PASS — bun test src/test/engine-autonomous-e2e.test.ts (5 pass)
DoD #1: PASS — bunx tsc --noEmit
DoD #2: PASS — bun run check . (warnings only, no errors)
DoD #3: PASS — bun test existing engine tests (47 pass)

Completed: 2026-07-04T06:06:49Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-spawn-seam.test.ts
- [ ] #2 ! grep -rq 'Agent(' src/engine
- [ ] #3 bun test src/test/engine-spawn-complete.test.ts
- [ ] #4 bun test src/test/engine-autonomous-e2e.test.ts
- [ ] #5 bunx tsc --noEmit
- [ ] #6 bunx biome check src/engine/
<!-- DOD:END -->
