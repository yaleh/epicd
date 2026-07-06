---
id: BACK-664
title: status/role 完全投影化（L3）：删除持久字段 + 移除全部编辑面 + epicd 自建运行时替代 baime + lint 挡死回流
status: 'Epic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-06 09:52'
updated_date: '2026-07-06 09:53'
labels:
  - 'kind:epic'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
references:
  - docs/task-lifecycle-model.md
  - docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md
  - docs/adr/ADR-015-monitor-as-invocation-adapter.md
  - BACK-655
  - BACK-643
priority: high
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

docs/task-lifecycle-model.md §4 已定为 **L3**：唯一真值 = `(pipeline_id, phase)`；`status`/`role` 不落盘、计算即显示、无独立编辑面、active 是独立 claim 轴、CI lint 挡死回流。当前实现仍是 **L1 过渡态**（status/role 仍在文件、仍可 `-s` 编辑、`In Progress` 借道 status）。本 epic 把 L1 → L3 一次坚决迁移到位。

## 为什么不能直接删（坚决 ≠ 鲁莽）

两个消费者钉住 status：①baime `scan-loop.js` reaper 读 raw `status:`（BACK-617）；②claim 脚本把 `Basic: In Progress` 写进 status 当运行时标记（BACK-620）。**但不改 baime**——让 **epicd 自建原生运行时**（monitor 前台 loop + Coordinator claim + engine-native staleness reaping，全读 `phase`+claim、不读 status）**替代** baime 的驱动；epicd 自足后由人**外部卸载 baime**（对 baime 零依赖 = M1 自举，ADR-011 D-7-bis）。坚决方案把每个依赖按序铲平直到字段可删且 lint 挡住回不来。

## 目标态（L3）

- `status`/`role` 从所有 task 文件删除，只在渲染边界 `label(role,phase)` / `roleOf(tree)` 实时算。
- 无独立编辑面：删 `task edit -s/--status`、`task create -s`；web status 为只读派生 badge。
- active/claim 独立轴：`In Progress` 移到 `Coordinator.claims`，从数据模型消失。
- CI lint 挡死：任何 task 含 `status:`/`role:`、或任何代码写它们即构建失败。

## 不动点

- **不改 baime**——替代之，由人外部卸载；不迁移/不修改 baime 内部功能。
- 不动引擎核心机制：engine complete/adjudicate/DoD 独立重跑/merge-lock/worktree/claim 隔离、pipeline-as-data 与 phase 语义。
- **阶段严格有序**：删字段（child C）的前置是 epicd 原生运行时自足到「无人读 status」（child A+B）；不得跳序鲁莽删。
- 复用 BACK-655（phase 必存/合法/终态 reconcile）、BACK-643（roleOf 认 kind:epic → role always-computed）、DRAFT-16（monitor 原生运行时），不重造。

## 非目标

- 不修改/不迁移 baime 内部（仅替代）。
- 不改 pipeline 定义 / phase 语义。
- monitor 前台 loop 本体 = DRAFT-16（本 epic 依赖它，不重做）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 status 与 role 不再持久化于任何 task 文件；displayStatus/label/roleOf 仅在 CLI/web 渲染边界实时计算；有测试断言 backlog/tasks/*.md 无 status:/role: frontmatter 字段
- [ ] #2 全部独立编辑面移除：task edit -s/--status 与 task create -s 删除；web status 为只读派生 badge；有测试/断言证明无 status 独立写路径
- [ ] #3 active/claim 成独立运行时轴：In Progress 从 status 移到 Coordinator claim，staleness reaping 读 claim 不读 status；数据模型中不再出现 In Progress
- [ ] #4 epicd 原生运行时自足：停用 baime scan-loop.js reaper 后 epicd 仍能全程驱动任务（证明替代成功、可外部卸载 baime）；全程不修改 baime 内部
- [ ] #5 CI lint 挡死回流：任何 task 含 status:/role: 或任何代码写它们即构建失败（今日 drift-lint 的反向）；阶段严格有序，删字段前置为 A+B 完成
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Epic Plan: status/role 完全投影化（L3）

## 迁移序列（严格有序，不可跳）

- **阶段 0 前置（复用现有，非本 epic child）**：BACK-655（phase 必存/合法/终态 reconcile 的 L1 基础）+ BACK-643（roleOf 认 kind:epic → role 可 always-computed）+ DRAFT-16（monitor 原生运行时）。
- **阶段 1** = child A｜**阶段 2** = child B｜**阶段 3** = child C｜**阶段 4** = child D｜**阶段 5** = child E。

## Sub-Task Decomposition

- **A. active/claim 轴独立化** — `In Progress` 从 status 移到 `Coordinator.claims`（运行时事实，永不持久）；engine-native staleness reaping 读 claim，不读 `status: In Progress`；删 claim 脚本（handle-basic-ready.sh）对 status 的 In Progress 写入。这是「status 不再承载 claim」的前置。〔依赖 DRAFT-16 / Coordinator〕
- **B. epicd 原生驱动零 status 读者** — 确保 epicd 自己的执行运行时（monitor 前台 loop + claim + reaping，DRAFT-16 一带）完全不读 raw `status:`；清除 epicd 内任何残余 status 读点（如 displayStatus 的 status 兜底、isTerminalStatus 遗留）；验收「停用 baime reaper 后 epicd 仍自足驱动」。做完 status 在 epicd 内零读者。〔依赖 DRAFT-16、BACK-655〕
- **C. subtractive 删字段迁移** — 一次性从所有 task 文件删除 `status:` 与 `role:`（backfill 的逆，减字段，幂等）；`displayStatus`/`label`/`roleOf` 只在 CLI/web 渲染边界算，不写文件。**前置 = A+B 完成（无人读 status）**。
- **D. 移除全部独立编辑面** — 删 `task edit -s/--status`、`task create -s`；web status 下拉 → 只读派生 badge；CLI 列表/视图 status 列纯派生。可与 C 并行。
- **E. enforcement lint（末位收口）** — CI 测试断言：任何 task 文件不含 `status:`/`role:` 字段，且无代码路径写它们（今日 drift-lint 的**反向**）。字段物理上回不来。

## Sequencing

A → B（A 是 B 的一部分前置）→ C（前置 = A+B 完成，epicd 无 status 读者）；D 可与 C 并行；E 末位。BACK-655/BACK-643/DRAFT-16 是全程上游依赖。**baime 卸载在本 epic 完成后由人外部执行，不在本 epic 范围。**

## Integration Acceptance（ADR-019：装配后端到端，非各 child 单测之并集）

1. `bun test` — 全量套件通过。
2. `bun test src/test/no-persisted-status-role.test.ts` — 断言 `backlog/tasks/*.md` 的 frontmatter 无 `status:`/`role:` 字段（删字段落实）。
3. `! grep -rqE "\.option\(\"-s" src/cli.ts && ! grep -rqE "\-\-status" src/cli.ts` — 或等价断言：CLI 无 status 独立编辑面（编辑面移除落实）。
4. **自足证明**：`bun test src/test/epicd-self-sufficient-no-status.test.ts` 或脚本级 e2e —— epicd 驱动一个任务 draft→…→done 全程不读/写 raw status，且在 baime `scan-loop.js` reaper **停用**下仍完成（证明 epicd 已替代 baime、可外部卸载）。
5. web status 只读：组件测试断言渲染为派生 badge、无可编辑 status 控件。

（第 2+3+5 项证「字段与编辑面已消除」；第 4 项证「epicd 自足、baime 可卸载」——这是本 epic 里程碑，非单测并集。）

## Constraints

- **不改 baime**：仅替代，卸载由人外部执行；不迁移/不修改 baime 内部。
- **不动引擎核心机制**：engine complete/adjudicate/DoD 重跑/merge-lock/worktree/claim 隔离、pipeline-as-data/phase 语义。
- **阶段严格有序**：C（删字段）前置为 A+B（epicd 无 status 读者）；跳序鲁莽删会断线。
- 复用 BACK-655/BACK-643/DRAFT-16，不重造。
- 每个 Basic child = 一个可独立评审 PR（ADR-018）。

## 颗粒度论证（ADR-018）

5 个 child（A active 轴 / B 零读者 / C 删字段 / D 移编辑面 / E lint），各为独立可评审 PR、各有独立验收：A 改 claim 机制、B 清 status 读点、C 减字段迁移、D 删 CLI/web 接口、E 加 CI 门——互不为彼此的步骤，且严格有序。阶段 0（BACK-655/643/DRAFT-16）是上游依赖不重复计入。合计规模（claim 机制 + 运行时清读 + 迁移脚本 + 接口删除 + 前端只读化 + lint + 各测试）落在数千行，跨 CLI/engine/web/harness，符合 epic 判据。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
cap:propose=approved。L3 迁移 epic：A active轴独立化 → B epicd零status读者 → C subtractive删字段 → D移编辑面 → E lint挡死；不改baime（替代之，外部卸载）；上游依赖 BACK-655/643/DRAFT-16。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
