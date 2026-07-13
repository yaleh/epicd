---
id: BACK-693
title: All Tasks 页面移动端适配：抽屉侧边栏 + 折叠筛选面板 + 表格改卡片视图
assignee:
  - '@claude'
created_date: '2026-07-13 02:01'
updated_date: '2026-07-13 02:29'
labels: []
dependencies: []
ordinal: 106000
pipeline_id: execution
phase: adjudicating
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun test --parallel
    checked: false
  - text: 'bun run test:e2e -- mobile-responsive.spec.ts'
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
web/All Tasks 页面（TaskList.tsx + SideNavigation.tsx）目前是纯桌面表格布局，在移动视口（如 390px 宽）下侧边栏收窄仍占约1/3宽度、筛选下拉框纵向堆叠占满首屏、任务表格 overflow-x-auto 内容宽达1456px 仅可见约20%，需要横向滚动多屏才能看完一行数据。目标是让 <768px 视口下有可用的移动端体验，同时不影响桌面端现有交互。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 在 <768px 视口下，侧边栏默认隐藏，通过顶部汉堡按钮触发覆盖式抽屉展开/收起，不再挤压主内容宽度
- [ ] #2 在 <768px 视口下，筛选行（状态/优先级/里程碑/Labels/Show completed）收进一个可展开的筛选面板，默认收起
- [ ] #3 在 <768px 视口下，任务列表改为卡片视图渲染（每个任务一张卡片，展示 ID/Title/Status 等关键字段，其余字段可在卡片内展开查看），不再要求横向滚动表格
- [ ] #4 新增移动端分支，桌面分支保持原样：≥768px 视口下侧边栏、筛选行、任务表格的结构、交互与改动前一致（截图/手测比对无回归）
- [ ] #5 bun test --parallel 与 bunx tsc --noEmit 通过
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: All Tasks 页面移动端适配

Single leaf (no children): one deliverable (mobile-responsive All Tasks page),
delivered as Phases inside this task. Breakpoint: <768px = mobile branch,
>=768px = desktop branch (Tailwind `md:` prefix convention already used
elsewhere in the codebase, e.g. Statistics/TaskDetailsModal).

Approach: a single shared `useIsMobile()` hook (window.matchMedia
`(max-width: 767px)`) drives a JS-level conditional render fork in each of the
three components, rather than CSS-only hide/show — keeps desktop DOM/JSX path
byte-for-byte unchanged (AC#4) and avoids CSS-selector interaction risk.

## Phase A: Sidebar drawer
### Tests (write first)
- `tests/e2e/mobile-responsive.spec.ts`: new spec, viewport 390x844.
  - hamburger button visible, sidebar hidden by default
  - clicking hamburger opens overlay drawer with nav links; clicking a link
    or the scrim closes it
  - desktop viewport (1280x800) in same spec: sidebar renders exactly as
    today (no hamburger, no drawer, sidebar occupies its normal column)
### Implementation
- `src/web/hooks/useIsMobile.ts` (new, shared by all 3 phases)
- `src/web/components/SideNavigation.tsx`: mobile branch renders a
  fixed-position overlay + scrim triggered by a header hamburger button;
  desktop branch untouched

## Phase B: Filter panel collapse
### Tests (write first)
- extend `mobile-responsive.spec.ts`: mobile viewport shows a single
  "Filters" toggle button; expanding it reveals the same status/priority/
  milestone/labels/show-completed controls; desktop viewport shows the
  controls inline as today (no toggle button rendered)
### Implementation
- `src/web/components/TaskList.tsx` filter row (~1025-1117): mobile branch
  wraps the existing filter controls in a collapsible panel; desktop branch
  untouched

## Phase C: Card view for task list
### Tests (write first)
- extend `mobile-responsive.spec.ts`: mobile viewport renders task rows as
  cards (no `<table>`), each card shows ID/Title/Status, and an expand
  affordance reveals Priority/Labels/Assignee/Milestone/Created; desktop
  viewport still renders the existing `<table>` with all columns

### Implementation
- `src/web/components/TaskList.tsx`: mobile branch renders a card list in
  place of the table; desktop branch (table + overflow-x-auto) untouched

## Phase D: Regression pass + gates
- Manual/screenshot check at >=768px against pre-change baseline (no visual
  diff) — record result in `--append-notes`
- `bunx tsc --noEmit`
- `bun test --parallel`
- `bun run test:e2e -- mobile-responsive.spec.ts`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-13T02:06:55Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
