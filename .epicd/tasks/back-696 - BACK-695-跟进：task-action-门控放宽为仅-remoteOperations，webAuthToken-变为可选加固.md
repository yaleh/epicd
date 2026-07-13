---
id: BACK-696
title: BACK-695 跟进：task action 门控放宽为仅 remoteOperations，webAuthToken 变为可选加固
assignee:
  - '@claude'
created_date: '2026-07-13 07:30'
updated_date: '2026-07-13 08:06'
labels:
  - 'kind:enhancement'
  - 'area:web'
  - 'area:config'
dependencies:
  - BACK-695
priority: medium
ordinal: 109000
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

BACK-695 给 task action 路由（`POST /api/tasks/:id/actions/:actionId`）加了双重门控：`remoteOperations !== false` **且** `webAuthToken` 必须已配置，二者缺一即 403（`src/server/index.ts:1123`）。这比应用里其它所有路由都严格——其余路由的 `webAuthToken` 是"设置了才校验、不设置就放行"的可选加固（BACK-647 既有模式），只有 action 路由把它变成了强制前置条件。

实测发现：一旦设置 `webAuthToken`，Web 前端（`src/web/lib/api.ts`）目前完全没有任何机制附加 `Authorization` 头（这是既有的 BACK-651 缺口，不是本任务范围），后果是只要为了解锁 action 按钮而设置了 token，整个浏览器 UI（包括最基础的任务列表加载）会全部 401，变成打不开。这使得 action 按钮在"未接 BACK-651"之前，实际上无法在浏览器里被真正点击成功——除非用户自己加一层反代注入固定 token。

## 决策

放宽 action 路由门控，使其与应用里其它路由的既有模式保持一致：
- 保留 `remoteOperations === false → 403`（沿用既有开关，未改变语义）。
- **去掉 `!webAuthToken` 这一强制前置条件**。`webAuthToken` 变回可选加固：未配置时不再单独拒绝 action 请求；已配置时，路由级别既有的 `checkAuth`（bearer 校验）逻辑照常生效，不受本任务影响。

理由：真正的信任边界是"config 里是否配置了 `task_actions`"——这本身就是维护者的显式信任行为（亲手把 shell 命令写进 config），而不是 `webAuthToken`（它管的是这个 web server 是否对外暴露，跟"该不该跑这些命令"是两件不相关的事，硬绑在一起是 BACK-695 过度设计的地方）。

## 非目标

- 不实现 BACK-651（webAuthToken 前端接线）。
- 不改变 `remoteOperations` 本身的语义或默认值。
- 不改变其它路由已有的 `checkAuth` 行为。

## 参考

- BACK-695（本任务的前置任务，本任务放宽其 AC #5 的门控设计）
- BACK-651（webAuthToken 前端未接线，本任务不实现，仅在文档中提示）
- src/server/index.ts:1123（当前门控代码）
- docs/task-actions.md（待更新的文档）
- src/test/server-task-actions-endpoint.test.ts（BACK-695 已有测试，本任务需要更新其中断言 webAuthToken 必须配置的用例）

## Phase A：门控条件放宽 + 测试

- `src/server/index.ts` 的 `handleRunTaskAction`：门控条件从 `config?.remoteOperations === false || !config?.webAuthToken` 改为仅 `config?.remoteOperations === false`。
- 更新 `src/test/server-task-actions-endpoint.test.ts` 中原本断言"未配置 webAuthToken → 403"的用例，改为断言这种情况下请求正常执行（AC #3）。
- 新增/确认测试覆盖：
  - `remoteOperations === false` 时仍然 403，且是因为 remoteOperations 而不是 webAuthToken（回归，AC #2）。
  - `remoteOperations` 为 `true`/未设置、`webAuthToken` 未配置时，请求正常执行并返回 `{exitCode, stdout, stderr}`（AC #3）。
  - `webAuthToken` 已配置时，未带正确 bearer token 的请求仍然 401（既有 `checkAuth` 逻辑未被绕过，AC #4）。
- Phase 完成标准：`bunx tsc --noEmit` 与 `src/test/server-task-actions-endpoint.test.ts` 通过。

## Phase B：文档 + 收尾

- 更新 `docs/task-actions.md`：说明 `webAuthToken` 对 action 路由是可选加固而非前置条件；补充一句提示——BACK-651（webAuthToken 前端未接线）落地前，设置 `webAuthToken` 会导致整个 Web UI 的其它请求也被 401，用户需按需权衡是否设置（AC #5）。
- 跑齐三个 DoD gates：`bunx tsc --noEmit`、`bun run check .`、`bun test --parallel`。
- 确认 AC #1-#5 逐条可核对为真，`--append-notes` 记录进度，不触碰任务状态字段（由 engine complete 收口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 handleRunTaskAction 门控条件改为仅 remoteOperations === false → 403；webAuthToken 未配置不再单独导致 403
- [ ] #2 remoteOperations === false 时 action 请求仍然 403（回归测试覆盖，不能破坏既有拒绝路径）
- [ ] #3 remoteOperations 为 true/未设置且 webAuthToken 未配置时，action 请求能正常执行并返回 {exitCode,stdout,stderr}（新行为，测试覆盖）
- [ ] #4 webAuthToken 已配置时，既有 checkAuth bearer 校验逻辑不受影响（测试覆盖，确认未被绕过）
- [ ] #5 docs/task-actions.md 更新：webAuthToken 对 action 路由是可选加固而非前置条件，并提示 BACK-651 未落地前设置 token 会导致整个 Web UI 401
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-13T07:47:02Z

Phase A+B done: gate loosened to remoteOperations only in handleRunTaskAction; tests updated (8/8 pass); docs/task-actions.md updated with optional-hardening note + BACK-651 caveat. All DoD gates green: tsc --noEmit, bun run check ., bun test --parallel (2089 pass/0 fail). Committed as 9e496ce1 on task/BACK-696.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-07-13 08:06
---
跟进：进一步复核发现继续用 remoteOperations 门控 task action 仍是语义不一致的复用（该字段管 git remote 访问，与本地 shell 命令执行无关）。已创建 BACK-697 彻底去掉这个依赖，不引入新开关，唯一门控是 task_actions 中是否配置了该 actionId；webAuthToken 保持可选加固不变。本任务内容与状态不变。
---
<!-- COMMENTS:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
