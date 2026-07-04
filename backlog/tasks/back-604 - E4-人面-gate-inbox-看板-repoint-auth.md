---
id: BACK-604
title: 'E4: 人面 — 多车道 issue-list（主面）+ 内联 gate + auth'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-04 02:18'
labels:
  - 'kind:epic'
  - 'epicd:E4'
dependencies:
  - BACK-601
  - BACK-602
  - BACK-603
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
建立 human 的主交互面。human 是 **gate owner**。主面 = **多车道 issue-list**（以现有 All Tasks 表 `TaskList.tsx` + `src/web/lib/lanes.ts` 为基座），**不再是 kanban**。gate-inbox **融入** issue-list —— 即其中 `waiting_on=human` 的行，**不另设独立页**。kanban 降级为 **deprecated** 桌面总览（代码保留、导航隐藏），不再是主面。auth 为引擎自有中间件。

裁决依据本会话（2026-07-04）：docs/proposals/2026-07-04-multi-lane-issue-list.md · docs/uml/presentation-class.puml · docs/uml/use-case-model.md（三平面/四轴）。

## 三轴解耦（本面据以呈现）
- **车道 = `pipeline_id`**（结构，来自 config pipelines[]）：复用 `lanes.ts`，加**第三个 `LaneMode="pipeline"`**，laneKey = pipeline_id，可折叠 swimlane（复用 Board.tsx 结构）+ lane-switcher。
- **车道内 = phase 分列（有序）+ priority 排序**；**label 正交 OR 过滤**（沿用现 search 语义，narrows within a lane，不定义车道）。
- **每行驱动者指示**：👤 待你 gate / 🤖 Claude Code 正处理 / ⏳ 排队待取 / ⚠️ stale —— 由 `waiting_on ⋈ Coordinator claim` **join** 得出；经现有 WS `tasks-updated` 实时刷新。**soak 期 claim 来自 baime `.active-agents`/`.caps` 适配器**（Coordinator 契约形状 soak↔引擎不变，见 driver-supervisor §7 R5）。

## 范围
1. **多车道 issue-list（新主面）**：pipeline 泳道 + lane-switcher + phase 分列 + priority 排序 + label 正交过滤；基座 `TaskList.tsx`/`lanes.ts`/`Board.tsx` swimlane 复用。
2. **驱动者指示 + 运行时 join**：每行 👤/🤖/⏳/⚠️；Coordinator 读 shim（soak：baime `.active-agents`）。
3. **内联 gate-review**：`waiting_on=human` 行内 approve/reject/escalate，写回 `status`（推进 phase/waiting_on），复用 WS 广播。gate-inbox = 本面的 needs-human 行，不另设页。
4. **kanban 降级**：标 deprecated、导航隐藏、列由 pipeline state 派生（承接 E3），零功能回归；repoint 到引擎自有 `Bun.serve` 仅作桌面总览。
5. **auth**：引擎自有中间件，包住 issue-list + 桌面总览路由。
6. **状态显示收敛**：把现有重复 ~4 处 status 启发式（`TaskList.getStatusColor`/`TaskColumn`/`MilestonesPage`/`terminal-status`）收敛为单一 `label(phase,turn,role,plane)` 单向投影（R3）。

通用部分（响应式视图 / auth 中间件 / lanes pipeline 扩展）标注可回馈上游。

## 依赖说明
- **E1（BACK-601）**：需 `waiting_on` 派生（parse(status)）+ search-service 按 `pipeline_id/waiting_on` 过滤 + config pipelines[]。
- **E2（BACK-602）**：gate 决策记入 gate-event log。
- **E3（BACK-603）**：board/车道列由 pipeline state 数据驱动，不硬编码 Basic/Epic。

## 测试 / build 机制
- **单元**：`lanes.ts` pipeline 模式分组；`label()` 投影；驱动者指示 (waiting_on × claim) 真值表；Coordinator shim 读 baime `.active-agents`。
- **e2e**（沿用 `@playwright/test`，独立 job）：多车道加载 / 折叠 / lane-switcher；内联 gate-review（approve/reject/escalate）；驱动者指示随 WS 刷新；kanban（deprecated）回归。
- **build**：`build:css`（Tailwind v4）纳入引擎 server 构建；`bun run build` 全绿；移动优先视图基本校验。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 多车道 issue-list 为主视图：按 pipeline_id 分可折叠 swimlane（复用 lanes.ts，新增 LaneMode=pipeline），车道内按 phase 分列、priority 排序，label 正交 OR 过滤
- [ ] #2 每行驱动者指示（👤/🤖/⏳/⚠️）由 actor(phase)（从 pipeline-data 查，非 per-task 字段）⨝ Coordinator claim 得出，经现有 WS tasks-updated 实时刷新；soak 期 claim 来自 baime .active-agents/.caps 适配器
- [ ] #3 gate-inbox 融入 issue-list：actor(phase)=human 行内联 approve/reject/escalate 写回 phase（promote→Backlog / 重开→机器 phase / 拒→归档），不另设独立页
- [ ] #4 kanban 降为 deprecated 桌面总览：导航隐藏、列由 pipeline phase 派生（不硬编码 Basic/Epic）、零功能回归；不再是主面
- [ ] #5 状态显示收敛：现有重复 ~4 处 status 启发式收敛为单一 label(role, phase) 单向投影（渲染边界；engine 读 phase key 查 pipeline-data，不解读显示串）
- [ ] #6 auth 引擎自有中间件接入（包住 issue-list + 桌面总览）；通用 UI/auth/lanes 扩展部分可回馈上游
- [ ] #7 e2e（@playwright/test 独立 job）覆盖：多车道加载/折叠/切换、内联 gate-review、驱动者指示随 WS 刷新、kanban(deprecated) 回归
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-04 终版对齐：驱动者指示的“waiting_on”一律理解为 actor(phase)——turn 不 per-task 存，由 pipelineDef[phase].actor 派生（proposal §2.3 终版）。本面只读 phase + 查 pipeline-data 得 actor，再 ⨝ claim；无需 join 任何 waiting_on 字段。gate 裁决写回的是 phase。
<!-- SECTION:NOTES:END -->
