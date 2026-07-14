---
id: BACK-707
title: 全面淘汰 legacy status 字段：将读取点迁移到 phase/pipelineId/role
assignee: []
created_date: '2026-07-14 02:47'
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
