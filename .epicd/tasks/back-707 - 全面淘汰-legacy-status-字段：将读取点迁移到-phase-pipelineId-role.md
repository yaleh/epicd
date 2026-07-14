---
id: BACK-707
title: 全面淘汰 legacy status 字段：将读取点迁移到 phase/pipelineId/role
assignee: []
created_date: '2026-07-14 02:47'
updated_date: '2026-07-14 03:52'
labels:
  - 'kind:epic'
dependencies: []
priority: medium
ordinal: 120000
pipeline_id: authoring
phase: drafting
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
task.status 目前不只是一个显示缓存——它在多处代码路径中被当作权威值直接读取/比较：src/cli.ts:4595 的 engine promote 分支硬编码 'Basic: Backlog'/'Epic: Backlog' 字符串；isTerminalStatus、content-store.ts 的按状态过滤、search-service.ts、web/lib/lanes.ts 的看板列分桶、mcp/tools/tasks/handlers.ts 等约 15+ 处读写点仍以 status 为准，而非引擎的 phase/pipeline_id/role 三元组。与此同时 engine-fields-backfill.ts 已存在，用于给纯 legacy（无 phase）任务补齐引擎字段，但尚未在全项目范围跑过覆盖，也没有把这些读取点逐一迁移到派生优先的 phase/pipeline_id/role。此任务把 status 从'部分权威源'收敛为纯派生显示值（或彻底移除该字段），是本次 whenStatus 讨论中识别出的下一层问题，体量上覆盖 CLI/MCP/web 三个独立可评审的读取点迁移面，超出单个 Basic 任务的合理审查范围。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 engine promote（src/cli.ts）不再对 task.status 做字面串比较（如 'Basic: Backlog'/'Epic: Backlog'），改为读取 role/pipeline_id/phase 判定 Backlog 边界；验证：grep -nE "Basic: Backlog|Epic: Backlog" src/cli.ts 无匹配
- [ ] #2 isTerminalStatus 的全部调用方（src/core/backlog.ts、src/cli.ts、src/mcp/tools/tasks/handlers.ts、src/web/lib/task-list-sort.ts、src/web/components/TaskList.tsx）改为基于 phase(+pipeline_id) 的 actor 判定，不再传入 task.status；验证：grep -rn "isTerminalStatus(task.status" src 无匹配
- [ ] #3 src/core/content-store.ts、src/core/search-service.ts 中用于过滤/索引的 .status 读取改为按 phase(+pipeline_id) 比较；验证：两文件内不再出现以 task.status/statusLower 作为过滤或索引 key 的分支（允许仅用于展示字段透传）
- [ ] #4 src/web/lib/lanes.ts 看板列分桶 key 改为 phase，不再以 task.status 分桶；验证：grep -n "task.status" src/web/lib/lanes.ts 无匹配
- [ ] #5 src/mcp/tools/tasks/handlers.ts 中依赖 task.status 做逻辑判断（===/switch/过滤条件，非纯展示透传）的分支改读 phase/pipeline_id/role；验证：grep -n "status ===" src/mcp/tools/tasks/handlers.ts 无匹配
- [ ] #6 全项目任务文件 pipeline_id/phase 补齐率达到 100%；验证：epicd engine drift-lint 输出 "clean board, no drift found" 且退出码 0
- [ ] #7 收敛终态：task.status 只作为纯派生展示值存在——新增一条可运行检查，断言 CLI/MCP/web 的逻辑分支（===/switch/过滤/分桶）不再以 task.status 作决策判断（仅允许展示位置读取），仿 BACK-664 #6 的挡死回流思路；验证：该检查命令对整个 src 目录跑通并返回 0
- [ ] #8 bun test --parallel 全绿
<!-- AC:END -->
