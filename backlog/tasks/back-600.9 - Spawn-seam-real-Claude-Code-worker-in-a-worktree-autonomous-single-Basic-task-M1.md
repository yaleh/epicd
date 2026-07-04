---
id: BACK-600.9
title: >-
  Spawn seam: real Claude Code worker in a worktree (autonomous single Basic
  task = M1)
status: 'Basic: Backlog'
assignee: []
created_date: '2026-07-04 04:53'
updated_date: '2026-07-04 05:21'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies:
  - BACK-600.8
parent_task_id: BACK-600
ordinal: 1000
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
