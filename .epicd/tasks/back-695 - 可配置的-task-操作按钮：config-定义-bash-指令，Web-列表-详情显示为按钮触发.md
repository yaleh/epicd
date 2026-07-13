---
id: BACK-695
title: 可配置的 task 操作按钮：config 定义 bash 指令，Web 列表/详情显示为按钮触发
assignee:
  - '@claude'
created_date: '2026-07-13 06:02'
updated_date: '2026-07-13 07:31'
labels:
  - 'kind:feature'
  - 'area:web'
  - 'area:config'
dependencies: []
priority: high
ordinal: 108000
pipeline_id: execution
phase: done
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
## 背景与动机

前面的架构讨论确立了「触发与状态变更解耦」原则：触发只是发起一个动作（如 `/epicd:fixpoint-convergence TASK-XX`）的幂等意图表达，状态变更权归执行层（被触发的 skill/session），触发者不预写任务状态。manda 项目已实证：人工 `dispatch to worker: /epicd:fixpoint-convergence TASK-XX` 与自动 dispatch 走同一 skill、结果一致。

本任务把这个原则落到人机交互面：在 Web UI 上，让维护者能一键把任务分发给跑着 manda-monitor 的 Claude Code worker 执行——而 Web 只做 fire-and-forget 的 dispatcher，不做 executor、不改任务状态。

## 既有先例

config 已有 `onStatusChange?: string`（BacklogConfig，src/types/index.ts:449）——「携带变量替换（$TASK_ID/$TASK_TITLE 等）的 bash 命令」这一模式已确立。本任务是把它从**事件触发**扩展为**手动、多条、可配置**触发，复用同一套变量占位符，不发明新语法。

## 做什么

1. **config 数据模型**：`BacklogConfig` 增加 `taskActions?: TaskAction[]`。每条 action：`{ id, label, command, whenStatus? }`。`whenStatus`（可选状态白名单）配了就按状态过滤显示，不配则永远显示。command 中的变量（$TASK_ID/$TASK_TITLE/$TASK_STATUS 等）沿用 onStatusChange 现有占位符集。
2. **Web API route**：新增 `POST /api/tasks/:id/actions/:actionId`。前端**只传** actionId + taskId；server 端查 config 表 → 在 server 端做变量替换 → spawn 子进程 → 返回 { exitCode, stdout, stderr }（截断前若干行）。前端**永不**传命令字符串。
3. **安全门控**：action 执行受 `remoteOperations` / `webAuthToken` 门控（复用既有 gate）。命令来源仅限项目维护者写入的 config，攻击面限制在「触发预定义 action」而非「执行任意命令」。
4. **UI 注入点**：
   - `src/web/components/TaskList.tsx`（All Tasks 每行末尾加 action 按钮组）
   - `src/web/components/TaskDetailsModal.tsx`（详情页 action 按钮区）
   - 按 whenStatus 过滤：仅在匹配状态的任务上显示对应按钮。
5. **fire-and-forget 语义**：点击**不乐观改任务状态**。仅显示回执 toast（exitCode + 输出前几行 + 如有 dispatch id 则显示）。真实状态推进由被触发的 session claim+执行后经 board 轮询自然反映。文档须引导用户配置 **dispatch 类**（毫秒级返回的 submit）命令，而非在 server 端同步跑长任务（会阻塞 web server）。
6. **文档**：在 docs 下给操作指令示例，含 manda-dispatch submit 分发给命名 worker、本地打开 worktree、review diff 等。

## 非目标

- 不实现自动扫描/自动 dispatch 触发器（那是 BACK-660 的范畴）
- 不在 server 端执行长任务生命周期（Web 只做 dispatcher）
- 不改任务状态机；action 不写任务状态
- 不接受前端传入任意命令字符串

## 参考

- src/types/index.ts:449（onStatusChange 先例 + 变量占位符）
- src/web/components/TaskList.tsx、TaskDetailsModal.tsx（UI 注入点）
- backlog/config.yml（remoteOperations / webAuthToken 门控）
- BACK-660（自动 dispatch 触发器，本任务的自动化对应物）

## Phase A：config 数据模型 + server 执行 + 安全门控

- `src/types/index.ts` 的 `BacklogConfig` 增加 `taskActions?: TaskAction[]`（`TaskAction = { id, label, command, whenStatus?: string[] }`），参考 `onStatusChange`（src/types/index.ts:449）字段附近位置与命名风格。
- config 解析/序列化（`src/file-system/operations.ts`，参考 onStatusChange 的 case 分支写法）与类型校验补测试。
- 变量替换：抽取/复用 onStatusChange 现有的占位符替换逻辑（`src/core/backlog.ts:1749` 附近），支持 $TASK_ID/$TASK_TITLE/$TASK_STATUS 等，替换必须发生在 server 端。
- 新增 `POST /api/tasks/:id/actions/:actionId`：只接受 actionId+taskId，查 config → 替换变量 → spawn 子进程 → 返回 `{exitCode, stdout, stderr}`（截断）。
- route 受 `remoteOperations`/`webAuthToken` 门控（复用既有 gate 逻辑），门控关闭/无 token 时拒绝执行。
- 测试覆盖：AC #1/#2/#4/#5（config 校验、变量替换、route 不接受命令入参、门控拒绝路径）。
- Phase 完成标准：本 Phase 相关测试与 `bunx tsc --noEmit` 通过。

## Phase B：UI 注入（TaskList / TaskDetailsModal）

- `src/web/components/TaskList.tsx`：每行末尾渲染符合 whenStatus 的 action 按钮组，点击调用新 route，显示回执 toast（exitCode + 输出摘要），不乐观改任务状态。
- `src/web/components/TaskDetailsModal.tsx`：详情页同样渲染 action 按钮区，同一套过滤与回执逻辑。
- whenStatus 未配置 → 所有任务显示；配置了 → 仅在匹配状态任务上显示。
- 测试覆盖：AC #3、#6。
- Phase 完成标准：`bunx tsc --noEmit` 与相关组件测试通过；手动确认（或组件测试）按钮渲染符合 whenStatus 过滤。

## Phase C：文档 + 收尾

- 在 `docs/` 下新增 task action 配置示例文档：manda-dispatch submit 分发给命名 worker、打开 worktree、review diff 三类示例，并说明只应配置 fire-and-forget/dispatch 类命令（不要在 server 端同步跑长任务）。
- 跑齐三个 DoD gates：`bunx tsc --noEmit`、`bun run check .`、`bun test --parallel`。
- 确认全部 Acceptance Criteria (#1-#7) 逐条可核对为真，`--append-notes` 记录进度，不触碰任务状态字段（由 engine complete 收口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 config 支持 taskActions: 每条含 id/label/command/whenStatus(可选)；解析与类型校验有测试覆盖
- [ ] #2 command 支持 $TASK_ID/$TASK_TITLE/$TASK_STATUS 等变量替换，替换在 server 端进行，沿用 onStatusChange 既有占位符集；有测试覆盖替换逻辑
- [ ] #3 whenStatus 未配置时按钮对所有任务显示；配置后仅在匹配状态的任务（列表行与详情页）显示对应按钮
- [ ] #4 POST /api/tasks/:id/actions/:actionId 前端仅传 actionId+taskId；server 查 config 表执行并返回 {exitCode, stdout, stderr}；前端不传命令字符串（有测试断言 route 不接受命令入参）
- [ ] #5 action 执行受 remoteOperations/webAuthToken 门控：门控关闭/无 token 时 route 拒绝执行；有测试覆盖拒绝路径
- [ ] #6 TaskList 每行与 TaskDetailsModal 均渲染符合 whenStatus 的 action 按钮；点击调用 route 并显示回执 toast（exitCode + 输出摘要），不乐观改任务状态
- [ ] #7 docs 下有 task action 配置示例文档，含 manda-dispatch submit 分发给命名 worker、打开 worktree、review diff 三类示例，并说明只应配置 fire-and-forget/dispatch 类命令
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-13T06:15:45Z
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-07-13 07:31
---
跟进决策：AC #5 里 webAuthToken 必须配置才能执行 action 的门控被认为过严——它把"web server 是否对外暴露"和"该不该执行已配置的命令"两件不相关的事绑在一起，且在 webAuthToken 未接前端（BACK-651）的情况下，设置 token 会导致整个浏览器 UI 401、action 按钮实际无法可用。已创建 BACK-696 放宽门控为仅 remoteOperations（webAuthToken 变为可选加固，与其它路由一致）。本任务（BACK-695）的实现与审计保持不变，门控行为的变更记录在 BACK-696。
---
<!-- COMMENTS:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
