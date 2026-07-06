---
id: BACK-653
title: All Tasks 主页化：默认路由/过滤排序/driver indicator 闭环 + gate-inbox 下线
status: 'Basic: Ready'
assignee:
  - '@claude'
created_date: '2026-07-06 02:02'
updated_date: '2026-07-06 02:19'
labels:
  - 'kind:feature'
dependencies: []
references:
  - BACK-644
  - BACK-645
  - BACK-646
  - BACK-647
  - BACK-605.10
ordinal: 73000
pipeline_id: execution
phase: ready
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test --parallel
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
当前应用默认路由 `/` 指向 Kanban 看板，但 BACK-644/645/646 已经把车道分组、driver indicator（👤/🤖/⚠️/⏳/✓）、内联 gate-review（approve/reject/escalate）都实现在 All Tasks 页（issue-list，当前路由 `/tasks`）里。这导致实际工作流的入口和代码重心已经不在看板上，但用户仍然先落地到看板，且 All Tasks 页本身默认把 30+ 条终态任务和待办混排、按 ID 倒序展示，没有体现"可执行性优先"。同时 `/gate-inbox`（BACK-605.10 的只读页面）与 All Tasks 页的内联 gate-review（BACK-646）语义重复，且其数据源 appendGateEvent 从未被引擎 dispatch/complete 的真实调用路径写入过（`docs/research/gate-events.jsonl` 全仓库不存在）。

本任务把导航、默认排序/过滤、gate-inbox 存废这三处收口到一个一致的目标态：All Tasks 是唯一的工作流入口页，用户全程不需要在"看板 / All Tasks / Gate Inbox"之间切换。

## 做什么

**A. 默认路由改为 All Tasks**
- `src/web/App.tsx` 的 `path="/"` 从当前的 Kanban（BoardPage）改为渲染 issue-list（当前 `/tasks` 对应的组件）。
- Kanban 的路由与代码保留（例如迁到 `/board`），但不在侧栏导航（`SideNavigation.tsx`）中出现——这是在 BACK-647 已完成的"隐藏 kanban 导航项"基础上，把默认根路由本身也从 Kanban 切换为 All Tasks（BACK-647 只处理了导航项隐藏和列派生，未改变默认路由指向）。
- `/board`（或等价路径）仍可直接访问，验证只读旧看板视图未被删除。

**B. All Tasks 页默认过滤与排序**
- 默认视图隐藏所有终态任务（`phase` 对应 `actor=none`，如现有 Basic/Epic Done 等价状态），并提供一个明确可见的"显示已完成"开关来临时展开——不是把已完成和待办默认混排。
- 默认排序改为按可执行性优先，优先级从高到低：
  1. driver indicator = 👤（actor=human，等待人工处理）
  2. ⚠️（actor=machine 但 claim 已过期，孤儿）
  3. 🤖（actor=machine，Coordinator 有活跃 claim）
  4. ⏳（actor=machine，排队中，无活跃 claim 也未过期）
  5. ✓（actor=none，终态；默认已被隐藏，仅在"显示已完成"展开时出现在最后）
- 已有的车道分组（BACK-644，按 `pipeline_id` 分组）与此排序不冲突：车道内部任务仍按上述优先级排序，不是打乱车道结构。
- driver indicator 的计算逻辑（`src/web/lib/driver-indicator.ts` 或等价现有模块）复用现有实现，不重新发明 actor 判定规则。

**C. gate-inbox 下线**
- 移除 `/gate-inbox` 路由（`src/web/App.tsx`）与 `SideNavigation.tsx` 中的 "Gate Inbox" 导航项。
- `GateInboxPage.tsx` 组件文件可以删除或保留但不再挂载路由——按仓库惯例判断，若无其他调用方直接删除组件文件与其专属测试，不做兼容 shim。
- 确认删除后不影响 `GET /api/gate-events` 端点（该端点仍可能被其他消费方如 CLI/inbox skill 使用，不在本任务删除范围）；仅删除 Web 侧的页面和导航入口。

**D. 补充可验证的 fixture 数据（用于人工/自动验证 B 的效果）**
- 当前仓库任务数据里，execution 车道 21 个任务全部是 Done、其余 58 个 `pipeline_id` 为空，没有任何任务处于 `actor=human` 或 `actor=machine` 的活跃 phase，导致 driver indicator 和内联 gate-review 代码路径无法被真实数据触发。
- 添加至少覆盖以下三种情形的测试 fixture（单元/组件测试用，不要求是仓库里的真实 backlog 任务）：一个 `pipeline_id=execution` 且 phase 对应 `actor=human`（如 needs-human）的任务、一个 `actor=machine` 且有活跃 Coordinator claim 的任务、一个 `actor=machine` 但 claim 已过期（孤儿）的任务。用这些 fixture 驱动组件测试，断言排序顺序、driver indicator 图标、approve/reject/escalate 按钮的可见性和可点击性符合 B 的规则。

## 非目标
- 不修改 appendGateEvent 的写入时机或引擎 dispatch/complete 的调用路径（该问题独立于本任务，若需要交给后续任务）。
- 不改变 BACK-644/645/646 已实现的车道分组结构、driver indicator 计算算法本身、inline gate-review 的 approve/reject/escalate 状态机——本任务只调整默认路由/默认过滤排序/gate-inbox 存废这三处，不重新设计已实现的机制。
- 不删除 `GET /api/gate-events` REST 端点或 CLI `engine gate-log` 命令。

参考：BACK-644（车道分组）、BACK-645/646（driver indicator + 内联 gate-review）、BACK-647（kanban 导航隐藏 + 列派生）、BACK-605.10（gate-inbox 只读页面实现，本任务将其下线）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 冷启动访问根路径 `/` 直接渲染 All Tasks（issue-list）内容，而非 Kanban 看板
- [ ] #2 Kanban 视图仍可通过某个路径（如 `/board`）直接访问，且不出现在侧栏导航中
- [ ] #3 All Tasks 页默认隐藏 actor=none（终态）的任务，并提供可见开关切换显示/隐藏已完成任务
- [ ] #4 All Tasks 页默认排序为：👤 优先，⚠️ 其次，🤖 再次，⏳ 再次，✓ 最后（仅在展开已完成时出现）；车道分组内部同样遵循该顺序
- [ ] #5 `/gate-inbox` 路由与侧栏 'Gate Inbox' 导航项已移除，不可通过导航访问
- [ ] #6 `GET /api/gate-events` REST 端点与 CLI `engine gate-log` 命令未被本任务删除或破坏
- [ ] #7 新增测试 fixture 覆盖至少三种 driver indicator 情形（actor=human、actor=machine 有效 claim、actor=machine 过期孤儿），并有组件测试断言排序顺序和内联操作按钮的可见性/可点击性符合上述排序规则
<!-- AC:END -->



## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
