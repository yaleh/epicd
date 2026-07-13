---
id: BACK-698
title: Task action 按钮视觉样式改进：加强与 tag 的色彩对比
assignee:
  - '@claude'
created_date: '2026-07-13 08:25'
updated_date: '2026-07-13 08:52'
labels:
  - 'kind:enhancement'
  - 'area:web'
  - 'area:ui'
dependencies:
  - BACK-697
priority: low
ordinal: 111000
pipeline_id: execution
phase: needs-human
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test --parallel
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-697 之后独立 agent 用浏览器对 `Log Task ID` 等 task action 按钮做了视觉评价：按钮当前样式（`src/web/components/TaskActionButtons.tsx:45`）是 `rounded-md border border-gray-300 bg-white ... text-gray-700`，跟中性 label/status/priority 标签（如 `src/web/components/TaskList.tsx:796` 的 `rounded-circle bg-gray-100 ... text-gray-700`）用几乎相同的灰色文字与体量，仅靠圆角形状（矩形 vs 药丸形）和一条浅灰边框做区分，容易在视觉上被误认成普通标签。对照组里唯一有强视觉信号的是 modal 里的红色 `Archive Task` 按钮。

用户已确认改进方向：加强色彩对比——把 action 按钮改为浅色主色调（如 indigo/blue 描边+浅色底）的可点击按钮样式，并加一个小的运行/播放类图标，使其与中性 tag 明显区分，同时不应像 `Archive Task` 那样刺眼（那是危险操作的红色警示色，task action 是常规可执行操作，不需要警示色）。

## 做什么

1. 修改 `src/web/components/TaskActionButtons.tsx` 中按钮的 className：从当前的灰白配色改为浅色主色调（如 `border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100`，dark mode 对应调整），保持 `rounded-md`（矩形）与现有 tag 的 `rounded-circle`（药丸形）区分开。
2. 在按钮文字前加一个小图标（如 lucide-react 的 `Play`/`Zap`/`Terminal` 之类语义为“可执行”的图标，参考项目里其它地方是否已使用 lucide-react 或类似图标库；若未引入图标库，选用项目现有约定的最小成本方案，比如已有的 SVG 图标组件），传达“这是会执行命令的操作”而非普通信息标签。
3. 确认列表视图（`TaskList.tsx`）和详情弹窗（`TaskDetailsModal.tsx`）两处使用点都正确应用新样式（因为是共享组件 `TaskActionButtons`，理论上一处修改自动生效，但仍需在两处视觉确认）。
4. Dark mode 下对比度需可读（沿用项目现有 dark: 前缀约定）。

## 验收标准（可核对）

见下方 Acceptance Criteria。

## 非目标

- 不改变按钮的点击行为、请求逻辑、门控逻辑（BACK-695/696/697 已完成，本任务纯视觉）。
- 不引入新的图标库依赖，除非确认项目里完全没有可用图标方案（先检查是否已有 lucide-react 或类似依赖）。
- 不修改 tag/label/status 徽标本身的样式。

## 参考

- BACK-697（本任务的前置，功能已完成且已通过浏览器验证）
- src/web/components/TaskActionButtons.tsx:45（当前按钮样式）
- src/web/components/TaskList.tsx:796（对照的中性 tag 样式）
- src/web/components/TaskList.tsx:766, 932 与 src/web/components/TaskDetailsModal.tsx:1261（TaskActionButtons 的两个使用点）

## Phase A：按钮配色 + 图标

- 修改 `TaskActionButtons.tsx` 的 className，采用浅色主色调配色方案，light/dark 两套都要覆盖。
- 加入语义为“可执行”的小图标（检查项目是否已有图标库依赖，优先复用）。
- Phase 完成标准：`bunx tsc --noEmit` 通过；本地肉眼确认按钮在列表和详情弹窗两处都应用了新样式（截图或描述均可，无需自动化视觉测试）。

## Phase B：收尾

- 跑齐三个 DoD gates：`bunx tsc --noEmit`、`bun run check .`、`bun test --parallel`。
- 确认 AC 逐条可核对为真，`--append-notes` 记录进度，不触碰任务状态字段（由 engine complete 收口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TaskActionButtons.tsx 中按钮采用浅色主色调配色（非灰白），与中性 tag 的灰色配色明显区分；验证: 肉眼对比 TaskList.tsx 中 action 按钮与 label pill 的渲染颜色不同
- [ ] #2 按钮加入语义为可执行操作的小图标；验证: 肉眼确认按钮内除文字外还有一个图标元素
- [ ] #3 列表视图与详情弹窗两处使用点都正确应用新样式；验证: 在 TaskList 与 TaskDetailsModal 中分别截图/确认
- [ ] #4 dark mode 下按钮文字与背景对比度可读，沿用项目现有 dark: 前缀约定；验证: 肉眼在 dark mode 下确认可读
- [ ] #5 点击行为、请求逻辑、门控逻辑未改变；验证: bun test src/test/server-task-actions-endpoint.test.ts 与相关前端测试仍然通过
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-13T08:25:16Z

Reviewed and fixed the pre-existing uncommitted diff to TaskActionButtons.tsx (task action buttons e.g. "Log Task ID").

Changes made:
- Confirmed className already switched from gray/white neutral scheme to light indigo (bg-indigo-50/text-indigo-700/border-indigo-300 with dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700), kept rounded-md (rectangular), distinct from rounded-circle gray tag pills in TaskList.tsx:796.
- Icon: the original inline SVG path was a Heroicons "volume/speaker" shape, not a recognizable play/execute glyph. Replaced with a standard filled play-triangle path (viewBox 0 0 20 20, fill=currentColor) that unambiguously reads as "executable action".
- Verified no icon library (lucide-react etc.) is a dependency anywhere in package.json/src/web; all existing icons in the codebase (DecisionDetail, TaskCard, SideNavigation, ChipInput, DependencyInput) are hand-rolled inline SVGs, so keeping inline SVG here matches the existing convention rather than introducing a new dependency.
- Confirmed both usage sites (TaskList.tsx ~766 row view, ~932 card view, TaskDetailsModal.tsx ~1261) pass only layout classNames (flex/gap) to the shared component's wrapper div; the button className itself is hardcoded inside TaskActionButtons.tsx, so all three call sites pick up the new style automatically with no local override.
- Dark mode classes present and follow existing dark: convention seen elsewhere in the codebase.

Verification:
- bunx tsc --noEmit: PASS
- bun run check .: PASS (exit 0; 13 pre-existing warnings in unrelated files, zero findings in TaskActionButtons.tsx)
- bun test --parallel: 2089 pass, 2 skip, 0 fail (includes server-task-actions-endpoint.test.ts: 8/8 pass)
- Behavior/logic unchanged: diff limited to className string + added svg icon; runAction/apiClient/dispatch/gating logic untouched.
- Visual verification: attempted to run the web server and view the buttons live in Chrome via chrome-devtools MCP, but the worktree was under active automated supervision (an external process reverted a manual test edit to backlog/config.yml used to enable a task action, and separately auto-committed the working tree mid-session). Verification is therefore via careful static code/markup review, not a rendered browser screenshot.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
