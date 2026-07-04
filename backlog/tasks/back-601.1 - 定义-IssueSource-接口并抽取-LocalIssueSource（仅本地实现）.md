---
id: BACK-601.1
title: 定义 IssueSource 接口并抽取 LocalIssueSource（仅本地实现）
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-03 17:08'
updated_date: '2026-07-04 06:16'
labels:
  - 'epicd:E1'
  - 'kind:refactor'
dependencies: []
parent_task_id: BACK-601
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 task 读写收敛到一个最小的 `IssueSource` 接口，并抽取唯一实现 `LocalIssueSource`（委托现有 Core/FileSystem，读写 backlog/tasks/*.md）。

## 背景与动机
- epicd 采用**本地（markdown 文件）优先**的 issue list；调研确认本 niche 无可直接复用的 npm 库，epicd 自身即该 niche 的 TS 实现。
- 未来可能支持 GitHub(@octokit)/GitLab(@gitbeaker) 等外部 issue 后端，但**当前无已证实的需求**，且与 E4 的 in-house 基调存在张力。因此本 task **只定义接口 + 落地本地唯一实现**，为将来的外部 adapter 留出接入位，但**不实现任何外部 adapter**（遵守 simplicity-first：不加未用方法/层）。
- 参考设计：git-bug 的 bridge 模式（本地为 source of truth，外部仅镜像；`capabilities()` 吸收平台字段差异）。双向 sync 本 task **不做**。

## 范围
- 定义最小接口：`list(filter?)` / `get(id)` / `upsert(input)`，风格对齐 CLAUDE.md 的 load+upsert（不引入 load/save/update 分裂）。
- 抽取 `LocalIssueSource`：**委托** Core（2930 行 God-class）现有 task CRUD，不重写、不搬迁数据。
- 接口应能承载 E1 field-registry 派生的 schema；engine 专用字段（pipeline_id/state/role/dod/cap）在本地实现里透传即可。

## 非范围（明确排除）
- 不实现 GitHubAdapter / GitLabAdapter。
- 不做外部平台的 pull/push 双向同步。
- 不改动 auth / gate / engine 驱动（这些始终本地，见 E4）。
- 不重构 Core God-class 本身（仅在其前抽薄接口）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 存在最小 `IssueSource` 接口，含 list/get/upsert（可含可选 capabilities）
- [ ] #2 `LocalIssueSource` 为唯一实现，委托 Core/FileSystem，读写现有 backlog/tasks/*.md 零回归
- [ ] #3 接口可承载 E1 field-registry 派生 schema；engine 专用字段在本地实现透传无损
- [ ] #4 代码库中不新增任何外部（GitHub/GitLab）adapter 或未使用的接口方法
- [ ] #5 现有 CLI/MCP/Server/Web 对 task 的读写路径行为不变（往返测试通过）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
衔接：本 task 的 IssueSource 是 docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md §4.5 的数据面地基——driver 取数由 store.load(tasksDir) 改经 IssueSource.list()，ENG-6 场身份泛化为 (sourceId,pipeline_id)。见该 proposal §7 R5 未决红线（IssueSource 与 supervisor 职责边界）。board 泳道渲染归 E3/E4，不在本 task。

2026-07-04 对齐 E0 成果：600.8 已建 `src/engine/store.ts::makeBoardStore`（TaskStore over Core：get/update，autoCommit=false）。本 task 应**在其上扩展**成 IssueSource（LocalIssueSource = makeBoardStore + list/upsert），**不另建平行 store 抽象**（避免两套数据访问）。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
