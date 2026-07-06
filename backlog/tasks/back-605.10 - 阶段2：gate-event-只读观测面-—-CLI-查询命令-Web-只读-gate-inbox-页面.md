---
id: BACK-605.10
title: 阶段2：gate-event 只读观测面 — CLI 查询命令 + Web 只读 gate-inbox 页面
status: 'Basic: Done'
assignee:
  - '@yale'
created_date: '2026-07-05 11:15'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.9
parent_task_id: BACK-605
ordinal: 59000
pipeline_id: execution
phase: done
parent_id: BACK-605
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
BACK-602（E2 gate-event log）已 Done，appendGateEvent/queryGateEvents API 已存在，但**只有写路径接了 CLI**（--record），人类现在读不到任何 gate 事件——CLI 和 Web 都没有读接口。按 docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §6.3/§7：尽早提供可观测版本是唯一的 ground-truth 采样通道，且这是当前最便宜能补的观测缺口。

本任务与阶段1的 inbox skill **共用同一实现**：先在 CLI 层实现 queryGateEvents 的只读包装，inbox skill 直接复用它，一次实现两处消费。

## 做什么
1. **CLI 读命令**：新增 engine gate-log 子命令（或等价名），支持 --pipeline/--gate/--actor/--since 过滤，包 src/core/gate-event-store.ts 的 queryGateEvents。
2. **Web 只读页面**：复用现有 web 骨架（Layout/SideNavigation/BoardPage 已存在的组件模式），新增一个只读 GateInboxPage；如无现成读 API 端点，加一个薄 REST 端点转发 queryGateEvents。
3. **明确边界**：只读、不做多车道、不做 auth、不做交互式 gate-review 提交——那些是完整 BACK-604 的范围。本任务只解决'人类现在完全看不到 gate 事件在发生'这个真空。

## 非目标
- 不做 BACK-604 的多车道/auth/内联 gate-review 提交。
- 不等 BACK-603（pipeline 泛化）完成——只读观测不依赖 actor 字段泛化。

参考：BACK-602 · docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §6.3/§7 · BACK-604（后续硬前置，本任务先垫底层读接口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLI 存在只读命令，包 queryGateEvents，支持按 pipeline/gate/actor/since 过滤
- [x] #2 Web 存在一个只读 GateInboxPage，数据源 = 同一 queryGateEvents（经 REST 端点或直接调用）
- [x] #3 该读接口被阶段1 的 inbox skill 复用，不重复实现
- [x] #4 范围明确不含多车道/auth/交互提交（留给 BACK-604）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
实现完成，等待主会话独立复核。

改动：
- 确认 CLI `engine gate-log`（BACK-605.9 已加）已支持 --pipeline-id/--gate/--actor/--since（以及 --until/--limit/--offset），无需补齐，未新增/重写 CLI 命令。
- src/server/index.ts: 新增只读 REST 端点 `GET /api/gate-events`（handleListGateEvents），薄转发到 src/engine/gate-log.ts 的 runGateLogQuery（同一份实现，未重复包装 queryGateEvents）；新增 SPA 路由 `/gate-inbox`。
- src/web/lib/api.ts: 新增 apiClient.fetchGateEvents(...)，调用 /api/gate-events。
- src/web/components/GateInboxPage.tsx: 新增只读 GateInboxPage（过滤表单 + 事件表格），路由挂载于 src/web/App.tsx `gate-inbox`。
- src/web/components/SideNavigation.tsx: 新增 "Gate Inbox" 导航项（展开/折叠两种状态）。
- src/test/server-gate-events-endpoint.test.ts: 新增端点测试（空日志、按 pipeline/gate/actor/since 过滤）。

复用确认：inbox skill（plugin/skills/inbox/SKILL.md）仍然 shell out 到 `engine gate-log`，本任务未新建平行实现；CLI 和新 Web 端点都调用同一个 src/engine/gate-log.ts::runGateLogQuery。

自查结果：
- bunx tsc --noEmit：通过（无错误）
- bun run check .：通过（11 条既有 warning，均不在本次改动文件内）
- bun test --parallel：1844 pass / 2 skip / 0 fail（全量套件）

范围外发现：未发现超出范围问题。未做 BACK-604 的多车道/auth/交互 gate-review 提交。

主会话独立复核（不信任 worktree agent 自证）：
- engine complete --worktree 因 board-file 内容冲突路由 needs-human（同 605.9 的 BACK-619 board-only 冲突模式：本任务的任务 md 文件历史上曾是 untracked，被前一次 `git add -A` 顺带提交进主分支，随后 handle-basic-ready.sh 又在主 repo 产生未提交改动，与 worktree 分支的提交内容重叠冲突）。手动 git merge --no-ff + 取 worktree 内容解决冲突后完成合并。
- 合并后独立重跑 bunx tsc --noEmit（通过）、bun run check .（通过，11 个既有 warning 与本任务无关）、bun test --parallel（1844 pass / 0 fail，含新增 server-gate-events-endpoint.test.ts）。
- 抽查确认 src/web/components/GateInboxPage.tsx 与 src/server/index.ts 的 /api/gate-events 路由均已合入，且该端点转发调用与 605.9 inbox skill 同一个 src/engine/gate-log.ts::runGateLogQuery，未见平行重复实现。
- 结论：AC#1-4 均达成，DoD 三项均由主会话独立验证通过。
- 遗留观察（不在本任务修）：连续两轮（605.9/605.10）都因未提交的 board 任务文件残留触发同一类 BACK-619 board-only 合并冲突，值得开一个 follow-up 复查 gitMergeBranch 里 checkout --ours 自动解冲路径为何未生效。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
