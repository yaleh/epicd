---
id: BACK-605.2
title: >-
  Real worktree merge: branch + git merge under lock (unblocks M1 — merge is
  currently a no-op)
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 07:05'
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
