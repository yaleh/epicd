---
id: BACK-605.3
title: >-
  ENG-8: engine re-runs DoD shell in worktree pre-merge (worker cannot
  self-attest done)
status: 'Basic: Backlog'
assignee: []
created_date: '2026-07-04 07:12'
updated_date: '2026-07-04 07:26'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: ENG-8 — engine re-runs DoD in worktree pre-merge

Proposal: 见本任务 Description。**依赖 BACK-605.2（merge）；序在其后。**
Plan review: iter1 NEEDS_REVISION（4 项）→ iter2（fixes 已应用，见下）。

> seam：DoD shell 在 harness、注入；引擎 core 不 shell out。lifecycle：DoD-runner 在 `withWorktree` 内、teardown 前跑，结果经 `CompletionResult.dodResults` 带出。

## Phase A: harness DoD-runner + dodResults + DoD-defaults 可执行化
### Tests (write first)
- `src/test/engine-dod-runner.test.ts`：`runDoD(task, cwd)` 把 task 的 DoD 项（`definitionOfDoneItems[].text` = feature-to-backlog 落的 shell 命令）逐条在 cwd 跑 → `{cmd, passed}[]`；一条 `false` → `passed:false`；**空 DoD → 空数组**。
### Implementation
- `src/harness/dod-runner.ts`：`runDoD(task, cwd)`（`Bun.spawn` 每条 `definitionOfDoneItems[].text` 于 cwd，exit 0 = passed）。`src/engine/complete.ts`：`CompletionResult` 加 `dodResults?: {cmd: string; passed: boolean}[]`。
- **fix 3**：把 3 条 NL 项目 DoD-defaults 改为可执行命令（`definition_of_done_defaults_upsert`：`bunx tsc --noEmit` / `bun run check .` / `bun test`），使所有 DoD 项 verbatim 可执行（否则引擎 verbatim 跑 NL 文本必挂）。
### DoD
- [ ] `bun test src/test/engine-dod-runner.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: dodRunner（可选）进 spawn seam，teardown 前跑 + seam 守卫
### Tests (write first)
- `src/test/engine-spawn-dod.test.ts`：`realSpawn` 加**可选** `dodRunner`；给了 → `withWorktree` 内 worker 后、**teardown 前**跑（断言 worktree 仍在），返回含 `dodResults`；**不给 → 跳过、`dodResults` undefined、现有 4-arg 调用不破**（fix 1）。
### Implementation
- `src/engine/spawn.ts`：`realSpawn(task, repoPath, runner, worktreeRunner, dodRunner?)`（fix 1：**可选**参数，保留 cli + 4 测试文件的 6+ 个 4-arg 调用）；`src/cli.ts` 注入真 `runDoD`。
### DoD
- [ ] `bun test src/test/engine-spawn-dod.test.ts`
- [ ] `! grep -rqE 'Bun.spawn|child_process' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase C: adjudicate/completeTask 据 dodResults 判 + 与 605.2 复合序
### Tests (write first)
- `src/test/engine-adjudicate-eng8.test.ts`：复合序（fix 4）——**(1) `dodResults` 任一 fail → needs-human、跳过 merge；(2) 否则 merge（605.2）冲突 → needs-human；(3) 否则 → done**。worker 勾 checkbox 不能绕过；**空 `dodResults` → needs-human**（不降级 done，守 ENG-8）。
### Implementation
- `src/engine/adjudicate.ts`：有 `dodResults` 时据它（任一 fail 或空 → needs-human）替代 checkbox-only。`completeTask`（**建在 605.2 的 conflict-signal merge 之上**，fix 4）：dod fail → needs-human 不 merge；dod pass → merge →（conflict ? needs-human : done）。
### DoD
- [ ] `bun test src/test/engine-adjudicate-eng8.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- 真 shell 全在 `src/harness`；引擎 core（src/engine）不 shell out（Phase B DoD 守卫 fix 2）。
- **序在 605.2 后**（同改 `completeTask` / cli engine-run 闭包，预期 rebase 冲突；本 task 建在 605.2 的 merge conflict-signal 之上，fix 4）。
- 空/失败 DoD → needs-human，绝不降级 done（ENG-8 核心）。
- 真 DoD-在-worktree e2e 由 soak/M1 实跑证明，非 bun-test。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog（orchestrator=main session）：existing task → ProposalLoop。
Plan review iter1: NEEDS_REVISION（independent architect，GCL E=5 C=1 H=1）—4 项：① realSpawn 加必需 5th 参破 6+ 个 4-arg 调用；② seam 守卫仅 prose 未执行；③ DoD 源歧义（task.dod frontmatter vs definitionOfDoneItems body；NL defaults verbatim 会挂；空不得降级 done）；④ 与 605.2 的 completeTask/merge 复合序未明。
Plan review iter2: fixes 已应用——fix1 dodRunner 改**可选**（保留 4-arg 调用）+ 无-runner 测试；fix2 seam 守卫提为 Phase B 可执行 DoD；fix3 runDoD 跑 definitionOfDoneItems 的 shell 命令 + **把 3 条 NL DoD-defaults 改为可执行命令** + 空→needs-human；fix4 明写三路复合序（dod-fail→skip merge；merge conflict→needs-human；else done）、建在 605.2 之上、序在其后。
未重跑第三次 full review（逐条实现 reviewer fix）。适配：跳 baime-plugin Step D。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 bun test src/test/engine-dod-runner.test.ts
- [ ] #5 bun test src/test/engine-spawn-dod.test.ts
- [ ] #6 ! grep -rqE 'Bun.spawn|child_process' src/engine
- [ ] #7 bun test src/test/engine-adjudicate-eng8.test.ts
<!-- DOD:END -->
