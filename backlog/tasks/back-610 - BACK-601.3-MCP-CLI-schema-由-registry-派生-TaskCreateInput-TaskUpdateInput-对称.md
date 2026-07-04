---
id: BACK-610
title: BACK-601.3 - MCP/CLI schema 由 registry 派生 + TaskCreateInput/TaskUpdateInput 对称
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 10:44'
labels: []
dependencies: []
ordinal: 21000
pipeline_id: execution
phase: ready
parent_id: BACK-601
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
使 generateTaskCreateSchema/generateTaskEditSchema 由表的 mcpSchema 派生（取代 ~360 行手写）；扩 TaskCreateInput/TaskUpdateInput + createTaskFromInput/updateTaskFromInput 使 registry 字段（含引擎字段）在 create 与 update 两侧一致接受，收口 create/update 不对称。Scope：src/mcp/utils/schema-generators.ts、src/mcp/tools/tasks/*、src/types/index.ts（TaskUpdateInput 引擎字段）、src/core/backlog.ts（updateTaskFromInput 对称）。依赖 601.2（A）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
