---
id: BACK-697
title: BACK-696 跟进：task action 门控完全去掉 remoteOperations 依赖，不引入新开关
assignee:
  - '@claude'
created_date: '2026-07-13 08:06'
updated_date: '2026-07-13 08:14'
labels:
  - 'kind:enhancement'
  - 'area:web'
  - 'area:config'
dependencies:
  - BACK-696
priority: medium
ordinal: 110000
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
## 背景

BACK-696 把 task action 路由（`POST /api/tasks/:id/actions/:actionId`）的门控从"`remoteOperations !== false` 且 `webAuthToken` 已配置"放宽为仅 `remoteOperations === false → 403`（`src/server/index.ts:1123`）。

复核后发现这仍然是语义不一致的复用：`remoteOperations` 管的是"要不要访问 git remote"（`src/git/operations.ts`、`src/utils/id-generators.ts`、`src/core/task-loader.ts` 等既有用法），跟"该不该执行 config 里配置好的 task action 命令"是两件不相关的事。继续拿它当 action 的门控，会导致关掉远程 git 检查（比如离线环境、限速场景下设 `remote_operations: false`）时意外连带把 action 也关掉，或者反过来为了开 action 被迫打开不相关的远程 git 检查。

## 决策

去掉 action 路由对 `remoteOperations` 的依赖，不引入任何新的专用开关。真正的信任边界就是"config 里是否给这个 `actionId` 配置了 `task_actions` 条目"本身——这已经是维护者显式写命令进 config 的信任行为，不需要再叠加一个全局布尔开关。

- `handleRunTaskAction` 不再检查 `config.remoteOperations`。
- 唯一剩下的执行前置条件：能在 `config.taskActions` 里按 `actionId` 找到对应条目（找不到已有 404 逻辑，不用改）。
- `webAuthToken`（如果配置了）继续作为可选加固生效，透过既有的路由级 `checkAuth` bearer 校验（BACK-647/BACK-696 已有逻辑，不变）。

## 做什么

1. `src/server/index.ts` 的 `handleRunTaskAction`：删除 `!config || config.remoteOperations === false` 这条 403 判断（连带的 `!config` null 检查如果还需要用于后续 `config.taskActions?.find(...)` 的安全访问，可以保留一个不返回 403 的 null-guard，或者直接让可选链自然处理——不要求本任务保留 403 语义，只要求不因为 `config` 为空而抛异常）。
2. 更新 `src/test/server-task-actions-endpoint.test.ts`：
   - 删除/替换原本断言 `remoteOperations === false → 403` 的测试（不再是这条路由的行为）。
   - 补一条测试：`remoteOperations: false` 时 action 请求依然能正常执行（新行为——回归应确认没有被误保留旧门控）。
   - 保留 `webAuthToken` 已配置时 bearer 校验仍然生效（401）的既有测试不变。
3. 更新 `docs/task-actions.md`：去掉关于 `remoteOperations` 门控 action 的描述，明确"是否启用某个 action 完全由 `task_actions` 是否配置该条目决定，没有额外全局开关"。

## 非目标

- 不引入任何新的专用开关字段（本任务的核心决策就是不需要）。
- 不改变 `webAuthToken` 的既有可选加固行为。
- 不改变 `remoteOperations` 在其它模块（git remote 检查、ID 生成）里的既有语义。

## 参考

- BACK-696（本任务直接修改其引入的门控条件，属于同一路由的第二轮调整）
- BACK-695（task action 路由的原始实现）
- src/server/index.ts:1123（待修改的门控代码）
- docs/task-actions.md（待更新的文档）

## Phase A：去掉门控 + 更新测试

- `src/server/index.ts` 的 `handleRunTaskAction`：删除 `!config || config.remoteOperations === false` 这条 403 判断。若 `config` 为空需要安全访问 `config.taskActions`，用可选链自然处理，不返回 403。
- 更新 `src/test/server-task-actions-endpoint.test.ts`：
  - 删除/替换原本断言 `remoteOperations === false → 403` 的用例。
  - 新增：`remoteOperations: false` 时 action 请求正常执行（AC #2）。
  - 保留：actionId 找不到 → 404（AC #3）；webAuthToken 已配置但无/错 bearer → 401（AC #4）。
- Phase 完成标准：`bunx tsc --noEmit` 与 `bun test src/test/server-task-actions-endpoint.test.ts` 通过。

## Phase B：文档 + 收尾

- 更新 `docs/task-actions.md`：去掉 remoteOperations 门控 action 的描述，明确启用条件仅为 `task_actions` 中配置了该 actionId（AC #5）。
- 跑齐三个 DoD gates：`bunx tsc --noEmit`、`bun run check .`、`bun test --parallel`。
- 确认 AC #1-#5 逐条可核对为真，`--append-notes` 记录进度，不触碰任务状态字段（由 engine complete 收口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 handleRunTaskAction 不再检查 config.remoteOperations；验证: grep -n 'remoteOperations' src/server/index.ts 在 handleRunTaskAction 函数体内无匹配
- [ ] #2 remoteOperations: false 时 task action 请求仍能正常执行；验证: bun test src/test/server-task-actions-endpoint.test.ts 中新增的回归测试通过
- [ ] #3 actionId 在 config.taskActions 中找不到时仍返回既有 404（未改变）；验证: bun test src/test/server-task-actions-endpoint.test.ts 相应用例通过
- [ ] #4 webAuthToken 已配置时 bearer 校验仍然生效（401）；验证: bun test src/test/server-task-actions-endpoint.test.ts 相应用例通过
- [ ] #5 docs/task-actions.md 不再提及 remoteOperations 门控 action，改为说明启用条件仅为 task_actions 中存在该 actionId；验证: grep -n 'remoteOperations' docs/task-actions.md 无匹配
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-13T08:07:04Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
