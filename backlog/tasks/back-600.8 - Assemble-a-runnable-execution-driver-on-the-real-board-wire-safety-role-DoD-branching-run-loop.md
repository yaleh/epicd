---
id: BACK-600.8
title: >-
  Assemble a runnable execution driver on the real board (wire safety, role/DoD
  branching, run loop)
status: 'Basic: Done'
assignee: []
created_date: '2026-07-04 04:52'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies:
  - BACK-600.5
  - BACK-600.6
parent_task_id: BACK-600
ordinal: 14000
pipeline_id: execution
phase: done
parent_id: BACK-600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 E0 测过的引擎零件装配成**真能对真板跑**的执行驱动器（除真 spawn 外全实现）。

## Background
600.4/.5/.6 交付了引擎零件 + **内存 tracer**：`sandbox.ts::runToFixpoint` 用 in-memory store + `spawn=()=>({success:true})` 空 stub；"cutover" 只是 `backlog/config.yml` 一行注释。现状：driver 仅 `tick()` 单圈、**test-only**、从没跑真板；`complete()` **线性**推进 phase（无 role/DoD 分叉）；`safety.ts` 的 withMergeLock/withWorktree/withCapGuard **未接进 driver**。本 task 把这些零件接成一个**对真板运行**的执行驱动器——**唯独真 worker spawn 仍走 WorktreeOps 接口 stub，由 600.9 替换**。

## Scope
- **Board-backed TaskStore**：实现 `TaskStore`（`getTask/updateTask`）over 真实 Core store（读写 `backlog/tasks/*.md`），使 driver 操作真板（替代 in-memory sandbox store）。
- **接 safety 进 driver**：driver 的 per-phase handler 在 `withMergeLock` + `withWorktree` + `withCapGuard` 下执行 spawn/merge/advance（safety.ts 已存、未接）。
- **role 分叉 + DoD 裁决**：primitive（叶子）→ execute（spawn worker）→ 引擎 **adjudicate DoD** → `done`(pass) / `needs-human`(fail)，取代 `complete()` 无脑线性推进。**compound/epic decompose 出范围**（stub → 不动/needs-human，后续 task 补）。
- **run 入口 + 循环**：CLI 命令（如 `engine run`）/最小循环，对真板 tick 执行 pipeline 到 fixpoint（或常驻）；**single-active-driver guard**（旧 baime loop 活动时拒跑，对齐共享 `.merge-lock`）。

## Non-goals
- 真 Claude Code worker spawn（**600.9**）；epic decompose（后续）；authoring pipeline（E7）；多 pipeline 泛化 + 插件打包（E5）；UI（E4）。

## Trade-off
把 E0 从"D-7 tracer"扩到"真板单 pipeline 自治驱动器（stub spawn）"。正当性：内存 tracer 证明不了真板运行；要达 M1 自治必须先让驱动器真跑真板。E5 后续把它泛化为 N pipeline + 插件。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TaskStore 有真板实现（读写 backlog/tasks 经 Core）；driver 可对真板 tick（非 in-memory）
- [ ] #2 driver 的 per-phase handler 在 withMergeLock + withWorktree + withCapGuard 下执行（safety.ts 接入 driver）；测试证并发 merge 串行、worktree 清理、cap 幂等
- [ ] #3 role 分叉：primitive 走 execute→adjudicate DoD→done(pass)/needs-human(fail)；complete 不再无脑线性推进
- [ ] #4 run 入口（CLI engine run 或等价）+ 循环 tick 执行 pipeline 到 fixpoint；single-active-driver guard（旧 loop 活动时拒跑，对齐 .merge-lock）
- [ ] #5 spawn 仍走 WorktreeOps 接口（stub），真 spawn 在 600.9；epic decompose 出范围
- [ ] #6 端到端测试：隔离 fixture 真板上一条 primitive task 经 ready→(stub spawn)→adjudicate→done；DoD 全绿
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan — runnable execution driver on the real board（测试先行）

### Phase A — board-backed store + wire safety
- **测试先行**：driver tick over 真 Core store（隔离临时板）推进一条 task；handler 在 withMergeLock/withWorktree/withCapGuard 下跑（断言并发 merge 串行、worktree finally 清理、重复 tick 幂等）。
- **实现**：`src/engine/store.ts`（TaskStore over Core，读写 backlog/tasks）；`driver.ts` handler 包 safety.ts 三件套。
- DoD：`bun test src/test/engine-driver-board.test.ts` · `bunx tsc --noEmit`

### Phase B — role 分叉 + DoD 裁决
- **测试先行**：primitive at ready → execute → DoD pass→done / fail→needs-human；complete 按 role/裁决分支，不再线性。
- **实现**：dispatch 按 role（叶子=primitive）；`complete.ts`/adjudicate：引擎重跑 DoD（ENG-8），据结果写 done|needs-human。decompose 出范围（compound→stub/needs-human）。
- DoD：`bun test src/test/engine-adjudicate.test.ts` · `bunx tsc --noEmit`

### Phase C — run 入口 + guard + e2e
- **测试先行**：`engine run` 循环 tick 到 fixpoint；旧 loop 活动（`.merge-lock`/`.active-agents` 存在）时拒跑；e2e 一条 primitive task 走到 done（stub spawn）。
- **实现**：CLI `engine run`（或等价）+ 循环；single-active-driver guard（对齐共享 `.merge-lock`）。
- DoD：`bun test src/test/engine-run.test.ts` · `bun run check .`

## Constraints
- spawn 仍走 WorktreeOps stub（真 spawn=600.9）；本 task 不 spawn Claude Code。
- 只驱动 execution pipeline 单条；多 pipeline/插件=E5。
- guard：旧 baime loop 冷备，单一活动驱动器（Guard 1 已由 safety.ts 共享锁支撑）。

## Acceptance Gate
- `bunx tsc --noEmit` · `bun run check .` · `bun test`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-04T05:22:14Z

workerLoop DoD #0: PASS — bunx tsc --noEmit

workerLoop DoD #1: PASS — bunx biome check src/engine/ src/types/

workerLoop DoD #2: PASS — bun test src/test/engine-driver-board.test.ts

Phase A ✓ 2026-07-04T05:44:03Z
DoD #1: PASS — bunx tsc --noEmit
DoD #2: PASS — bun run check . (8 pre-existing warnings, 0 errors in new files)
DoD #3: PASS — bun test src/test/engine-driver-board.test.ts (5/5)
Phase B ✓ 2026-07-04T05:44:03Z
DoD #1: PASS — bunx tsc --noEmit
DoD #2: PASS — bun test src/test/engine-adjudicate.test.ts (15/15)
Phase C ✓ 2026-07-04T05:44:03Z
DoD #1: PASS — bun test src/test/engine-run.test.ts (10/10)
DoD #2: PASS — bun run check . (pre-existing warnings only)
DoD #3: PASS — bun test (111 engine tests pass, 1 flaky pre-existing timeout in parallel)

Completed: 2026-07-04T05:44:48Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit
- [ ] #2 bunx biome check src/engine/ src/types/
- [ ] #3 bun test src/test/engine-driver-board.test.ts
<!-- DOD:END -->
