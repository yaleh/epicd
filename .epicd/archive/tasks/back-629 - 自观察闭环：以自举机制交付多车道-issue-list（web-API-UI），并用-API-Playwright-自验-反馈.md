---
id: BACK-629
title: 自观察闭环：以自举机制交付多车道 issue-list（web API + UI），并用 API + Playwright 自验/反馈
status: 'Epic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 05:55'
labels:
  - 'kind:epic'
  - 'epicd:bootstrap'
dependencies:
  - BACK-628
  - BACK-601
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 目标
把（已自托管的）内核**投影到人类易观察/交互的形态**——多车道 issue-list 的 web API + UI——并且这次交付本身**由 BACK-628 点着的自举环来做**（不是手工搭）。这既是人面主视图，也是自举环的第一个'真功能' dogfood。

## 与 E4（BACK-604）的关系（不另开车道）
人面**功能范围**沿用 E4/BACK-604：多车道 issue-list（pipeline 泳道 + phase 分列 + 驱动者指示 👤/🤖）、内联 gate-review、kanban 降级、auth——BACK-604 已含 web API + UI + @playwright/test e2e。本 epic **不复制**该车道；它在 BACK-604 之上**加两样新东西**：
1. **过程约束**：该功能由 epicd 引擎自身分解并驱动交付（证明自举环能出 ~多 PR 的真功能）。
2. **自观察反馈通道**：一个 agent 经 web API + 浏览器（Playwright）观察**运行中的**板，把看到的异常（status/phase desync、stale claim、空 worktree 孤儿）自动经 backlog CLI 建成 task 回流——闭合 observe→task 环，给 BACK-628 的审计装上'眼睛'。
> 建议：落地时把 BACK-604 折进本 epic 的分解（或反过来把本 epic 的两点并入 BACK-604），避免两条平行车道——**请人类 gate owner 裁一次**（见交付说明）。

## 人面纪律（呼应 BACK-627 收敛）
human 只在 actor=human 行动（👤 gate / gate-review）；machine 行只读。人面严格是**同一事件流的 filter + 回写**——不得读取任何 driver 不读取的字段，不制造第二真相源。投影函数 project(board)→rows 应是 crystal 里的纯函数，三面（CLI/Web/TUI）只是它的渲染。

参考：BACK-604（E4）· docs/proposals/2026-07-04-multi-lane-issue-list.md · presentation-class.puml · use-case-model.md（四轴/三平面）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 多车道 issue-list 人面（web API + UI）交付并满足 E4/BACK-604 的验收；其分解与驱动由 epicd 引擎自身完成（非手工），dogfood 证据记入 gcl-events.jsonl
- [ ] #2 web API 暴露 board 只读投影（lanes × phase × 驱动者指示 👤/🤖，经 project(board) 纯函数派生）与 gate 写回端点；API 有契约测试
- [ ] #3 Playwright e2e 覆盖多车道加载 / 内联 gate-review / 驱动者指示随 WS 刷新（承接 BACK-604 #7）
- [ ] #4 自观察反馈闭环：一个 agent 经 web API + Playwright 观察运行中的板，发现的异常自动经 backlog CLI 建 task 并链接来源；至少演示一次真实检出→建 task
- [ ] #5 人面纪律：human 只在 actor=human 行动、machine 行只读；无第二真相源（校验人面所读字段 ⊆ driver 所读字段）
- [ ] #6 BACK-604 与本 epic 的车道归并由人类 gate owner 裁决并落定（不留两条平行车道）
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
