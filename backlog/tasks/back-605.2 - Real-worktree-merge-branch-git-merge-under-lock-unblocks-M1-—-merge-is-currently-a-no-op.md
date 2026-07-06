---
id: BACK-605.2
title: >-
  Real worktree merge: branch + git merge under lock (unblocks M1 — merge is
  currently a no-op)
status: 'Basic: Done'
assignee: []
created_date: '2026-07-04 07:05'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.1
parent_task_id: BACK-605
ordinal: 1000
pipeline_id: execution
phase: done
parent_id: BACK-605
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
M1 确认实跑前的 pre-run 检查发现**阻塞缺口**：`cli.ts` `engine run` 的 `merge: async () => {}` 是**空 no-op**（唯一 merge 调用 `driver.ts:60` 透传到它）；`gitWorktreeRunner.add` 用 `--detach`（游离 HEAD、无分支）；**全仓无任何 `git merge`**。→ 真 worker 在 worktree 内实现+提交，但 merge 空转、worktree 随即被删 → **worker 改动被丢弃**，task 却 →`done`（空壳）。这是 E0 driver "merge"（ADR-010 ENG-3）的真实缺口（600.8 stub 了它）。**不修，M1 自治跑通 = 丢工。**

## 范围
- `gitWorktreeRunner.add`：改 `-b task/<id>`（建分支，非 `--detach`）；worker 在该分支提交。
- **真 merge**：引擎在 `withMergeLock` 下对该分支跑 `git merge --no-ff`（或 rebase）到主分支；**冲突/失败 → `needs-human`**（绝不置 done）；merge 后再清理分支+worktree（承 `withWorktree` finally）。
- **ENG-8 补齐（相关，可同 PR）**：`adjudicate` 目前只查 DoD **checkbox 状态**——改为**引擎 pre-merge 重跑 DoD shell 命令**（worker 不可自证 done）。
- 端到端（sandbox/soak）：真 worker 改动**真的落到主分支**，才算 done。

## 非目标
- 多 pipeline 泛化 / 插件打包（E5 其余）；epic decompose。

## 边界
这是让 M1 自治**真能留住工作**的最后一块。修完 → M1 确认实跑（真 worker 跑通一条 task 且改动落主分支）才有意义。

## 参考
ADR-010 ENG-3（merge 串行化）/ENG-8（引擎重跑 DoD、worker 不自证 done）；`src/engine/driver.ts`、`complete.ts`、`safety.ts`（withMergeLock/withWorktree）、`src/harness/real-primitives.ts`（gitWorktreeRunner）、`src/cli.ts`（engine run 的 no-op merge）；BACK-600.8/600.9/605.1。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: real worktree merge (branch + git merge under lock)

Proposal: 见本任务 Description。**范围收窄（architect fix 5）：本 task 只做 merge**；ENG-8（DoD-在-worktree-重跑，需 worktree-lifecycle 重构）拆到 **BACK-605.3**。merge 不需 worktree 存活——分支 `task/<id>` 在 worktree 删后仍存，merge 分支即可。
Plan review: iter1 NEEDS_REVISION（5 项）→ iter2（fixes 已应用，见下）。

> seam：真 git 全在 harness（src/harness），引擎 core 不 shell out；merge 串行化经 `withMergeLock`（ENG-3）。

## Phase A: 分支式 worktree + 真 merge primitive（含分支清理）
### Tests (write first)
- `src/test/engine-merge.test.ts`（tmp git repo，真 git）：`gitWorktreeRunner.add` 建分支 `task/<id>`（非 detached）；worker 在分支提交；`gitMergeBranch(repoPath, taskId)` `git merge --no-ff task/<id>` → 主分支含该提交；成功后 `git branch -d task/<id>`（fix 4）；冲突 → `git merge --abort` + 返回 `{conflict:true}`（不留半 merge）；**预存 `task/<id>`（crash 残留）时 add 前先清**（fix 4）。
### Implementation
- `src/harness/real-primitives.ts`：`add` → `git worktree add -b task/<id> <path>`（去 `--detach`；add 前 `git branch -D task/<id>` best-effort 清残留）；新增 `gitMergeBranch(repoPath, taskId): Promise<{merged:boolean; conflict?:boolean}>`（merge --no-ff → 成功则 `branch -d`；失败 `merge --abort` + conflict）。
### DoD
- [ ] `bun test src/test/engine-merge.test.ts`
- [ ] `! grep -q -- '--detach' src/harness/real-primitives.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: 接真 merge（带 safety 锁）进 engine run + 冲突路由
### Tests (write first)
- `src/test/engine-merge-wire.test.ts`：**cli `engine run` 构造 `runEngine` 时传 `safety`**（fix 2）→ merge 在 `withMergeLock` 下跑（断言用共享 `.merge-lock`，ENG-3 串行化生效于 production 路径）；成功 → 改动落主分支；**merge 冲突 → `needs-human`**（fix 3，不置 done）。断言 cli 不再有 no-op merge 且**已传 safety**。
### Implementation
- `WorktreeOps.merge` / `CompleteTaskOptions.merge` 返回类型改带 conflict 信号（fix 3）；`completeTask` 冲突 → `needs-human` verdict（不进 adjudicate）。
- `src/cli.ts` `engine run`：`merge` 从 `async () => {}` 换成调 `gitMergeBranch`；**构造并传 `safety: {backlogDir, repoPath, lockFs: realMergeLockFs, worktreeRunner: gitWorktreeRunner}` 给 `runEngine`**（fix 2）。
### DoD
- [ ] `bun test src/test/engine-merge-wire.test.ts`
- [ ] `! grep -q 'merge: async (_taskId' src/cli.ts`
- [ ] `grep -q 'safety:' src/cli.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- merge 串行化经 `withMergeLock`（ENG-3，共享 `.merge-lock`）；**production（cli）路径必须真的传 safety**（fix 2——wire-test 须覆盖 cli 遗漏，而非只测自建 completeTask）。
- 真 git 全在 `src/harness`；引擎 core（src/engine）不 shell out。
- **ENG-8（引擎 pre-merge 重跑 DoD shell、worker 不自证）= BACK-605.3**（需把 DoD-runner 放进 spawn seam / 延后 worktree teardown）。
- 端到端（真 worker 改动落主分支）由 sandbox/soak e2e 证明（M1 确认实跑），非 bun-test。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog（orchestrator=main session）：existing task → ProposalLoop。
Plan review iter1: NEEDS_REVISION（independent architect，GCL E=8 C=1 H=0）—5 项深度发现：① worktree-lifecycle 矛盾（withWorktree 在 spawn 步删 worktree，merge/DoD 看不到）；② merge 在 production 路径未上锁（cli 未传 safety）；③ conflict 返回型 vs Promise<void> 未对；④ 分支清理/crash 残留未覆；⑤ 建议拆 ENG-8。
Plan review iter2: fixes 已应用——本 task **收窄为 merge-only**（fix 5），因分支在 worktree 删后仍存、merge 不需 worktree 存活（解 fix 1）；Phase B 显式传 safety 入 runEngine（fix 2）+ conflict→needs-human 改签名（fix 3）+ 分支清理/残留处理（fix 4）。ENG-8+lifecycle 重构 → **BACK-605.3**。
未重跑第二次 full review：本次为范围缩减 + 逐条实现 reviewer 所列 fix，最大风险项（lifecycle）已拆出。适配：跳 baime-plugin Step D。

claimed: 2026-07-04T07:17:26Z

workerLoop DoD #0: PASS — bun test src/test/engine-merge.test.ts

workerLoop DoD #1: PASS — ! grep -q -- '--detach' src/harness/real-primitives.ts

workerLoop DoD #2: PASS — bun test src/test/engine-merge-wire.test.ts

workerLoop DoD #3: PASS — ! grep -q 'merge: async (_taskId' src/cli.ts

workerLoop DoD #4: PASS — grep -q 'safety:' src/cli.ts

workerLoop DoD #5: PASS — bunx tsc --noEmit

workerLoop DoD #6: PASS — bunx biome check src/engine/ src/harness/ src/cli.ts

Phase A ✓ 2026-07-04T00:00:00Z
DoD #4: PASS — bun test src/test/engine-merge.test.ts (5 pass)
DoD #5: PASS — ! grep -q -- '--detach' src/harness/real-primitives.ts
Phase B ✓ 2026-07-04T00:00:00Z
DoD #6: PASS — bun test src/test/engine-merge-wire.test.ts (6 pass)
DoD #7: PASS — ! grep -q 'merge: async (_taskId' src/cli.ts
DoD #8: PASS — grep -q 'safety:' src/cli.ts
DoD #1: PASS — bunx tsc --noEmit
DoD #2: PASS — bun run check . (exit 0, 8 pre-existing warnings)
DoD #3: PASS — bun test --parallel (1511 pass, 1 pre-existing flaky timeout in parallel)

Completed: 2026-07-04T07:29:28Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-merge.test.ts
- [ ] #2 ! grep -q -- '--detach' src/harness/real-primitives.ts
- [ ] #3 bun test src/test/engine-merge-wire.test.ts
- [ ] #4 ! grep -q 'merge: async (_taskId' src/cli.ts
- [ ] #5 grep -q 'safety:' src/cli.ts
- [ ] #6 bunx tsc --noEmit
- [ ] #7 bunx biome check src/engine/ src/harness/ src/cli.ts
<!-- DOD:END -->
