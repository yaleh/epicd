---
id: BACK-605.3
title: >-
  ENG-8: engine re-runs DoD shell in worktree pre-merge (worker cannot
  self-attest done)
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 07:12'
updated_date: '2026-07-04 07:13'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.2
parent_task_id: BACK-605
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
从 BACK-605.2 拆出（architect 评审 fix 1/5）：两件耦合的事，独立成 PR。
1. **ENG-8 未真做**：`src/engine/adjudicate.ts` 只查 DoD **checkbox 状态**——worker 自己勾 checkbox 就能过 gate。ADR-010 ENG-8 要求**引擎重跑 DoD shell 命令**判定，**worker 不可自证 done**。
2. **worktree-lifecycle 矛盾**：`realSpawn` 的 `withWorktree` 在 spawn 步的 `finally` **删 worktree**；而 DoD-在-worktree-重跑需 worktree 存活。须重构：把 **DoD-runner 放进 spawn seam（`withWorktree` 内、teardown 前）**并把结果经 `CompletionResult` 带出；或**延后 teardown** 到 DoD+merge 后。

## 范围
- harness **DoD-runner**：在 worktree 内跑 `task.dod` 的 shell 命令，返回逐条结果（shell 在 harness、注入；引擎 core 不 shell out）。
- **seam 重构**：在 `withWorktree` 内、teardown 前跑 DoD-runner，结果经 `CompletionResult`（加 `dodResults` 字段）带出。
- `adjudicate` / `completeTask` 改**消费注入的 DoD 结果**替代 checkbox-only：任一 DoD fail → `needs-human`（即使 worker 勾了）。

## 非目标
- merge（BACK-605.2）；多 pipeline 泛化 / 插件打包；epic decompose。

## 依赖
BACK-605.2（merge）——本 task 与 605.2 同触 spawn/complete 路径，须序在其后或协调（避免 worktree-lifecycle 改动互撞）。

## 参考
ADR-010 ENG-8；`src/engine/spawn.ts`（realSpawn/withWorktree）、`adjudicate.ts`（checkbox-only）、`complete.ts`（completeTask）；`src/harness/`。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
