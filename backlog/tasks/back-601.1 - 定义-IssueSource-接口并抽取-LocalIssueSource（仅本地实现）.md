---
id: BACK-601.1
title: 定义 IssueSource 接口并抽取 LocalIssueSource（仅本地实现）
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-03 17:08'
updated_date: '2026-07-06 03:46'
labels:
  - 'epicd:E1'
  - 'kind:refactor'
dependencies: []
parent_task_id: BACK-601
ordinal: 14000
pipeline_id: execution
phase: done
parent_id: BACK-601
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
- [x] #4 代码库中不新增任何外部（GitHub/GitLab）adapter 或未使用的接口方法
- [x] #5 现有 CLI/MCP/Server/Web 对 task 的读写路径行为不变（往返测试通过）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
衔接：本 task 的 IssueSource 是 docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md §4.5 的数据面地基——driver 取数由 store.load(tasksDir) 改经 IssueSource.list()，ENG-6 场身份泛化为 (sourceId,pipeline_id)。见该 proposal §7 R5 未决红线（IssueSource 与 supervisor 职责边界）。board 泳道渲染归 E3/E4，不在本 task。

2026-07-04 对齐 E0 成果：600.8 已建 `src/engine/store.ts::makeBoardStore`（TaskStore over Core：get/update，autoCommit=false）。本 task 应**在其上扩展**成 IssueSource（LocalIssueSource = makeBoardStore + list/upsert），**不另建平行 store 抽象**（避免两套数据访问）。

实现（src/engine/store.ts，扩展 makeBoardStore 而非另建平行 store）：
- IssueSourceFilter { pipeline_id?, phase?, parent_id? } — 数据选择过滤，关系判断（如 "all children terminal"）留给 driver/interpreter（proposal §7 R5）。
- IssueSourceUpsertInput = TaskCreateInput | ({id:string} & TaskUpdateInput) — 单一 upsert 方法按 id 是否存在分派 create/update，对齐 CLAUDE.md load+upsert 规范。
- IssueSource { list(filter?)/get(id)/upsert(input) } — 无 capabilities/load/save/update 分裂,无未用方法。
- makeLocalIssueSource(core) — 唯一实现：list 对 core.queryTasks({}) 做内存过滤（TaskListFilter 原生不支持 pipeline_id/phase/parent_id）；get 直接委托 core.getTask；upsert 按 "id" in input 分派 core.updateTaskFromInput / core.createTaskFromInput。

发现并修复一个真实回归（非本 task 范围但阻塞 fixpoint）：
Core.updateTask（BACK-627 引入）此前对任何带 phase 的 task 无条件用 label(role,phase) 覆盖 status，即使 phase 未变。这与 plugin/scripts/handle-basic-ready.sh 的 claim 语义冲突——claim 只显式设置 status="Basic: In Progress"、phase 仍为 "ready"（ready/in-progress 已合并，机器捡取即整段 "ready"），旧逻辑会把该显式 status 立刻打回 "Basic: Ready"，导致 scan-loop.cjs 的 stale-in-progress reaper 永远看不到 "In Progress" 字面量，安全网失效。修复：仅当 task.phase !== originalTask?.phase（即本次更新确实发生了 phase 迁移）才强制派生 status；phase 不变时尊重调用方显式传入的 status。src/test/handle-basic-ready-claim.test.ts 回归通过，BACK-627 既有测试（epic close / no-phase no-op）不受影响。

验证：
- bunx tsc --noEmit：clean
- bun run check .：10 条既有告警（与本次改动文件无关，非本次引入）
- bun test（scoped，8 文件 85 用例）：全绿
- bun test --parallel（全量 1796 用例）：1793 pass / 2 skip / 1 fail — 失败为 cli-instructions.test.ts，隔离单跑 8/8 全绿，确认系并行负载下的既有 flake（与本次改动无关）

新增测试：src/test/engine-store-issuesource.test.ts（10 用例，覆盖 list 无/单/组合过滤、get 存在/缺失、upsert create/update 路径及 phase→status 派生）。

2026-07-05 BACK-628 fixpoint 复审：IssueSource/LocalIssueSource 落地后在生产代码中零调用方（仅自身测试文件使用），违反 CLAUDE.md simplicity-first（"避免多余层，除非有已证实的即时需求"）。经用户确认，移除该抽象（src/engine/store.ts 只保留既有 makeBoardStore；删除 IssueSource/IssueSourceFilter/IssueSourceUpsertInput/makeLocalIssueSource 及其测试 src/test/engine-store-issuesource.test.ts）。AC#1-3（接口存在性相关）改为未勾选以反映当前代码状态；AC#4/#5（未新增外部 adapter、既有读写路径无回归）仍然成立。若未来 driver-supervisor multi-lane 提案（proposal §4.5）真正落地且出现具体调用方，应重新开一个新 task 落地，而非恢复本次删除的代码。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
