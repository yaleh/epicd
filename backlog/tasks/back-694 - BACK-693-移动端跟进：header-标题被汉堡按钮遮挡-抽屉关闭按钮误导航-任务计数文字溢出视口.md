---
id: BACK-694
title: BACK-693 移动端跟进：header 标题被汉堡按钮遮挡 + 抽屉关闭按钮误导航 + 任务计数文字溢出视口
assignee:
  - '@claude'
created_date: '2026-07-13 02:45'
updated_date: '2026-07-13 03:10'
labels:
  - 'kind:bug'
dependencies: []
priority: medium
ordinal: 107000
pipeline_id: execution
phase: needs-human
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: 'bun run test:e2e -- mobile-responsive.spec.ts'
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
独立视觉 QA（fresh-context subagent，chrome-devtools MCP，移动视口 390x844）在 BACK-693 合并后发现 3 个真实问题，此前的代码级独立审计（diff review）未捕获，因为都属于'渲染后才可见'的行为/布局问题：

1. header 的 'epicd' 标题（约 x=32-93px）与固定定位的汉堡按钮（约 x=12-52px）重叠 20px，标题第一个字母被按钮遮住，视觉上显示成 'bicd'。
2. 抽屉侧边栏里专门的 'Close navigation menu' 关闭按钮点击后没有关闭抽屉，而是导航到了一个文档页面（/documentation/001/testing-style-guide），疑似与其下层某个链接存在 z-index/命中测试重叠；scrim（遮罩层）本身点击关闭是正常的，只有这个显式关闭按钮失效。
3. 移动端筛选面板里 'Showing 40 of 132 tasks' 计数文字在窄屏下溢出视口右边缘（DOM 中该文本框右边缘约在 x=459px，视口宽度只有 390px），文字被裁切成 'Showing 40 of'，且页面没有整体横向滚动，所以溢出部分完全不可见/不可达。桌面视口下同一文本渲染完整，确认是移动端特有问题。

**任务目标不止是修完这 3 个已知问题**：BACK-693 之前的代码级 diff 审计已经证明"审代码"不足以发现渲染后才暴露的视觉/交互缺陷。本任务的真正目标是让 All Tasks 页面的移动端实现达到可发布的完善水准——用独立 fresh-context agent（不共享实现者上下文，避免自证）在真实浏览器（chrome-devtools MCP，移动视口）里做主动的视觉扫查，不局限于验证上面 3 条已知问题是否修好，而是像第一次做的那样重新审视整个页面（header、抽屉、筛选面板、卡片列表、按钮点击命中、文字溢出、tap target 大小等），直到独立扫查连续一轮零新发现为止，再连同桌面视口回归确认一起收尾。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 移动视口下 header 的 'epicd' 标题完整可见，不与汉堡按钮重叠
- [ ] #2 移动视口下点击抽屉的 'Close navigation menu' 按钮会关闭抽屉，不触发导航
- [ ] #3 移动视口下筛选面板的任务计数文字（如 'Showing 40 of 132 tasks'）完整可见，不溢出视口
- [ ] #4 桌面视口（≥768px）上述三处的现有行为不受影响
- [ ] #5 独立 fresh-context agent（不共享实现者上下文）用 chrome-devtools MCP 移动视口对 All Tasks 页面做完整主动视觉扫查（不局限于验证上述 3 条已知问题），逐轮寻找新的视觉/交互缺陷（遮挡、溢出、点击命中错误、tap target 过小、对比度、动画/过渡异常等）
- [ ] #6 上述独立视觉扫查连续一轮零新发现（loop-until-dry）才可判定完成；每轮发现的问题都必须修复并记录，不得以'只修 3 个已知问题'为由提前收尾
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: BACK-694 移动端跟进修复（目标：完善移动端实现，不止修 3 个已知问题）

## 独立验证方法（复现步骤，来自 fresh-context 视觉 QA subagent）
使用 chrome-devtools MCP 工具，对 http://localhost:6420（`bun run cli browser`
从源码启动，非全局 npm 二进制 — 曾因用了全局旧二进制误判一次，务必确认跑的是
本仓库构建）执行：
1. `new_page` 打开首页 → `emulate` 视口 `390x844x2,mobile,touch` → reload。
2. 首屏截图：确认 header 标题、汉堡按钮、卡片列表初始状态。
3. 点击汉堡按钮打开抽屉 → 截图；点击抽屉的 "Close navigation menu"
   （scrim）尝试关闭 → 截图 + 确认最终 URL/路由未跳转。
4. 展开筛选面板 → 截图，检查 "Showing N of M tasks" 计数是否完整可见。
5. 展开一张任务卡片的 "Show details" → 截图。
6. `emulate` 桌面视口 `1280x800` 做回归对比截图。
7. `take_snapshot` 获取可访问性树，用于核对具体元素坐标/命中范围
   （`evaluate_script` 读取 `getBoundingClientRect()` 定位溢出/重叠的精确像素）。

## 发现与根因假设（供实现者验证，不是最终结论）

### 问题 1：header "epicd" 标题被汉堡按钮遮挡
- 现象：移动视口下标题第一个字母被遮住，视觉显示成 "bicd"。
- 代码位置：`src/web/components/Navigation.tsx` 的 `<nav className="px-8 ...">`
  （标题 `<h1>` 起点 x≈32px）完全没有 `isMobile` 分支；而
  `src/web/components/SideNavigation.tsx:830-840` 的汉堡按钮是
  `fixed top-3 left-3 ... w-10`（x≈12-52px）。BACK-693 只改了
  SideNavigation.tsx，没有同步给 Navigation.tsx 在移动视口下让出空间。
- 修复方向：给 `Navigation.tsx` 加移动端左侧 padding（如
  `pl-14`/`pl-16`，用 `useIsMobile()` 或 Tailwind 断点）为汉堡按钮让出空间，
  不影响桌面（`md:px-8` 保持原值）。

### 问题 2：抽屉 "Close navigation menu" 点击后误导航
- 现象：点击关闭抽屉的控件后跳转到文档页而不是关闭抽屉。
- 代码位置：`SideNavigation.tsx:842-863`。scrim
  (`aria-label="Close navigation menu"`, `fixed inset-0 z-20`) 和抽屉面板
  (`fixed inset-y-0 left-0 z-20 max-w-[85vw]`) 是同一 z-index 的两个
  fixed 元素，抽屉面板在 DOM 中排在 scrim 之后 → 在视口左侧 85% 区域内
  抽屉面板视觉上盖在 scrim 上方，该区域内对 scrim 的点击实际会命中抽屉
  面板内部的导航链接（例如 Documents 区的文档链接），而不是 scrim 本身。
  只有点击视口右侧 15%（抽屉未覆盖的纯 scrim 区域）才会真正关闭。
- 修复方向：让 scrim 的 z-index 高于抽屉面板本身之外、但抽屉内容仍可点击
  ——常见做法是 scrim 单独一层且抽屉面板内容通过 `stopPropagation`
  或调整层叠顺序/内边距，确保抽屉覆盖区域之外任何点击都能关闭，同时抽屉
  内部点击不再意外落到 scrim 之外的逻辑上；具体实现在动手前应先用
  `take_snapshot`/`evaluate_script` 复现坐标命中，确认根因后再改。

### 问题 3：筛选面板任务计数文字溢出视口
- 现象："Showing 40 of 132 tasks" 在窄屏下被裁切，且无横向滚动可达。
- 代码位置：`src/web/components/TaskList.tsx:1284-1324`，父容器
  `flex items-center gap-3 flex-shrink-0` 包含 checkbox / Clear filters /
  计数 `div`（`whitespace-nowrap min-w-[170px]`），整行没有 `flex-wrap`，
  桌面充足宽度掩盖了问题，移动端筛选面板收纳后同样继承此行导致溢出。
- 修复方向：移动分支下允许该行 `flex-wrap` 或改为纵向堆叠
  （不影响桌面 `md:flex-nowrap` 保持原样）。

## Phase A：修复已知 3 个问题 + 回归测试
### Tests（先写）
- 扩展 `tests/e2e/mobile-responsive.spec.ts`：
  - 断言移动视口下 header 标题的 bounding rect 与汉堡按钮 bounding rect
    不重叠（用 `boundingBox()` 比较）
  - 断言点击抽屉 scrim 关闭抽屉后页面 URL 不变（仍在 All Tasks 页）
  - 断言筛选面板展开后计数文字的 bounding rect 完全落在 viewport 宽度内
  - 桌面视口维持现有断言不变（无回归）
### Implementation
- 按上面三个"修复方向"分别改 `Navigation.tsx` / `SideNavigation.tsx` /
  `TaskList.tsx`，桌面分支保持不变

## Phase B：独立视觉审计（loop-until-dry，强制，不是可跳过的 RiskGated 轻量项）
本任务的验收不是"3 个已知问题修好即可"，而是要求：

1. Phase A 修复合并后，派发一个**全新 fresh-context agent**（不携带
   Phase A 的实现上下文），要求它像 BACK-693 那次一样，用
   chrome-devtools MCP 在移动视口（390x844，可加测 375x667/414x896 等
   常见宽度）对 All Tasks 页面做**主动、开放式**的视觉扫查——不是"逐条
   核对这 3 个 AC"，而是重新审视整个页面（header、抽屉开合全流程、筛选
   面板展开/收起、卡片默认态与展开态、按钮 tap target、文字溢出、颜色
   对比度、动画/过渡观感），并如实报告发现的任何新问题。
2. 每一轮扫查：
   - 有新发现 → 修复 → 回到本 Phase 开头，派发**下一个**全新
     fresh-context agent 再扫一轮（不能复用上一轮的 agent/上下文，
     否则等同于自证）。
   - 零新发现 → 该轮记为"dry"；只有连续一轮 dry 才可以进入 Phase C。
3. 同时用同一批 agent 对桌面视口（1280x800）做一次回归截图确认，避免
   移动端修复引入桌面端问题。
4. 每轮的发现/结论用 `epicd task edit BACK-694 --append-notes` 记录
   （轮次编号、发现数、是否 dry），保留可审计的过程轨迹。

## Phase C：收尾
- `bunx tsc --noEmit`
- `bun run test:e2e -- mobile-responsive.spec.ts`
- 确认 Phase B 已有连续一轮独立视觉扫查零新发现，再进入 engine complete /
  adjudicate 流程
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
来源：BACK-693 合并后，独立视觉 QA subagent（fresh-context，chrome-devtools MCP，移动视口 390x844 + 桌面 1280x800 回归对比）在真实渲染环境下发现本任务的 3 个 AC 对应问题；此前 BACK-693 的代码级 diff 审计未捕获，因为都是渲染后才可见的布局/交互问题。复现步骤与根因假设已写入 Implementation Plan。

claimed: 2026-07-13T02:58:37Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
