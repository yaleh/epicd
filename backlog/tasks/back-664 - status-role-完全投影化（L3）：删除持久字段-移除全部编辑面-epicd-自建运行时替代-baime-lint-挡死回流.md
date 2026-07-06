---
id: BACK-664
title: status/role 完全投影化（L3）：删除持久字段 + 移除全部编辑面 + epicd 自建运行时替代 baime + lint 挡死回流
status: 'Epic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-06 09:52'
updated_date: '2026-07-06 11:16'
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
  - BACK-660
priority: high
ordinal: 82000
parent_id: BACK-665
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

docs/task-lifecycle-model.md §4 已定为 **L3**：唯一真值 = `(pipeline_id, phase)`；`status`/`role` 不落盘、计算即显示、无独立编辑面、active 是独立 claim 轴、CI lint 挡死回流。当前实现仍是 **L1 过渡态**（status/role 仍在文件、仍可 `-s` 编辑、`In Progress` 借道 status）。本 epic 把 L1 → L3 一次坚决迁移到位。

**投影细化（doc §4/§2/§5 已同步）**：status 投影**只是 phase**（title-case，如 `Ready`/`Needs Human`/`Done`），**不再含 `Basic:`/`Epic:` 前缀**；一个 task 是否 compound（有无子 task）走**独立 has-children 指示器**（web 父/子数 chip 或展开三角、CLI list 标记），永不拼进 status 串。即 `label(role,phase)` 坍缩为 `titleCasePhase(phase)`，role 从 status 投影中彻底剥离、只作独立显示轴。

## 为什么不能直接删（坚决 ≠ 鲁莽）

两个消费者钉住 status：①baime `scan-loop.js` reaper 读 raw `status:`（BACK-617）；②claim 脚本把 `Basic: In Progress` 写进 status 当运行时标记（BACK-620）。**但不改 baime**——让 **epicd 自建原生运行时**（monitor 前台 loop + Coordinator claim + engine-native staleness reaping，全读 `phase`+claim、不读 status）**替代** baime 的驱动；epicd 自足后由人**外部卸载 baime**（对 baime 零依赖 = M1 自举，ADR-011 D-7-bis）。坚决方案把每个依赖按序铲平直到字段可删且 lint 挡住回不来。

## 目标态（L3）

- `status` 从所有 task 文件删除，只在渲染边界由 `titleCasePhase(phase)` 实时算（**phase-only，无 role 前缀**）。
- `role` 从所有 task 文件删除，只在渲染边界由 `roleOf(tree)` 实时算，并作**独立 has-children 指示器**呈现（不进 status 串）；pre-decompose epic 由 `kind:epic` 派生 compound（依赖 BACK-643）。
- 无独立编辑面：删 `task edit -s/--status`、`task create -s`；web status 为只读派生 badge（删 StatusSelect 下拉）。
- active/claim 独立轴：`In Progress` 移到 `Coordinator.claims`，从数据模型消失。
- CI lint 挡死：任何 task 含 `status:`/`role:`、或任何代码写它们即构建失败。

## 不动点

- **不改 baime**——替代之，由人外部卸载；不迁移/不修改 baime 内部功能。
- 不动引擎核心机制：engine complete/adjudicate/DoD 独立重跑/merge-lock/worktree/claim 隔离、pipeline-as-data 与 phase 语义。
- **status 投影 phase-only**：role 彻底剥离出 status 串，只作独立 has-children 显示轴。
- **分批有序**：monitor-free 批（投影 phase-only + 移编辑面 + 删 role 字段）可即刻驱动；monitor-gated 批（claim 轴 + 删 status 字段）等 BACK-660；删 status 字段前置为「epicd 原生运行时自足到无人读 status」。
- 复用 BACK-655（phase 必存/合法/终态 reconcile）、BACK-643（roleOf 认 kind:epic → role always-computed，**L3 承重前置**）、BACK-660（monitor 原生运行时），不重造。

## 非目标

- 不修改/不迁移 baime 内部（仅替代）。
- 不改 pipeline 定义 / phase 语义。
- monitor 前台 loop 本体 = BACK-660（本 epic 依赖它，不重做）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 status 与 role 不再持久化于任何 task 文件；displayStatus/label/roleOf 仅在 CLI/web 渲染边界实时计算；有测试断言 backlog/tasks/*.md 无 status:/role: frontmatter 字段
- [ ] #2 全部独立编辑面移除：task edit -s/--status 与 task create -s 删除；web status 为只读派生 badge；有测试/断言证明无 status 独立写路径
- [ ] #3 active/claim 成独立运行时轴：In Progress 从 status 移到 Coordinator claim，staleness reaping 读 claim 不读 status；数据模型中不再出现 In Progress
- [ ] #4 epicd 原生运行时自足：停用 baime scan-loop.js reaper 后 epicd 仍能全程驱动任务（证明替代成功、可外部卸载 baime）；全程不修改 baime 内部
- [ ] #5 status 投影为 phase-only：displayStatus(task)==titleCasePhase(task.phase)、无 Basic:/Epic: 前缀；compound（有无子 task）由独立 has-children 指示器呈现（web 父/子 chip 或展开三角 + CLI list 标记），永不进 status 串；有测试断言无前缀且 has-children 独立呈现
- [ ] #6 CI lint 挡死回流：任何 task 含 status:/role: 或任何代码写它们即构建失败（今日 drift-lint 的反向）；分批有序——monitor-gated 批（claim 轴、删 status 字段）等 BACK-660，删 status 字段（child 4）前置为 child 1+3 完成（epicd 无 status 读者）
<!-- AC:END -->







## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Epic Plan: status/role 完全投影化（L3）

## 迁移序列（按 monitor 依赖分两批）

- **阶段 0 前置（复用现有，非本 epic child）**：BACK-655（phase 必存/合法/终态 reconcile）+ BACK-643（roleOf 认 kind:epic → role 可 always-computed，**L3 承重前置**）+ BACK-660（monitor 原生运行时）。
- **monitor-free 批（可即刻 LFDD 驱动）**：child 1（投影 phase-only + 移编辑面）、child 2（删 role 字段）。不依赖 monitor，直接交付「status 无 Basic:/Epic:、compound 独立呈现」。
- **monitor-gated 批（等 BACK-660）**：child 3（claim 轴 + epicd 零 status 读者）、child 4（删 status 字段）。
- **末位**：child 5（lint 挡死）。

## Sub-Task Decomposition

- **1. 投影坍缩 phase-only + 移除编辑面（monitor-free，先做）** — `label/displayStatus` 坍缩为 `titleCasePhase(phase)`（删 role 前缀分支，field-registry.ts:404-425）；web status badge 渲染 phase 文本、新增**独立 has-children 指示器**（父/子数 chip 或展开三角）；删 web StatusSelect 下拉（TaskDetailsModal.tsx:1101,1204-1221）与 CLI `-s/--status`（cli.ts:1568 create、cli.ts:2396 edit）；TaskList 分桶由 config-status 改为 phase（对齐 Board 已有 buildPhaseColumns）。〔无依赖，可即刻驱动〕
- **2. 删除 role 持久字段（monitor-free）** — 从所有 task 文件与 field-registry（:333）删除 `role:`；role 100% 由 `roleOf(tree)` 派生，pre-decompose epic 由 `kind:epic` 派生 compound。〔依赖 BACK-643：roleOf 须先认 kind:epic，否则删字段后未分解 epic 派生错前缀〕
- **3. active/claim 轴独立化 + epicd 零 status 读者（monitor-gated）** — `In Progress` 从 status 移到 `Coordinator.claims`（运行时事实，永不持久）；engine-native staleness reaping 读 claim 不读 `status: In Progress`；删 claim 脚本（handle-basic-ready.sh:52）对 status 的 In Progress 写入；清除 epicd 内任何残余 raw `status:` 读点（displayStatus 兜底、isTerminalStatus 遗留），做到 epicd 原生驱动零 status 读者。〔依赖 BACK-660 / Coordinator〕
- **4. subtractive 删除 status 持久字段（monitor-gated）** — 一次性从所有 task 文件与 serializer（serializer.ts:54、field-registry.ts:76）删除 `status:`（backfill 的逆，减字段，幂等）。**前置 = child 1（无人显示 raw status）+ child 3（无人借 status 承载 claim、epicd 零 status 读者）**。
- **5. enforcement lint（末位收口）** — CI 测试断言：任何 task 文件不含 `status:`/`role:` 字段，且无代码路径写它们（今日 drift-lint 的**反向**）。字段物理上回不来。

## Sequencing

monitor-free 批：child 1 与 child 2 可并行（1 无依赖、2 依赖 BACK-643）。monitor-gated 批：child 3（依赖 BACK-660）→ child 4（前置 = 1+3）。child 5 末位（前置 = 2+4）。**baime 卸载在本 epic 完成后由人外部执行，不在本 epic 范围。**

## Integration Acceptance（ADR-019：装配后端到端，非各 child 单测之并集）

1. `bun test` — 全量套件通过。
2. `bun test src/test/status-projection-phase-only.test.ts` — 断言对每个 phase，`displayStatus(task)` == `titleCasePhase(task.phase)`，**输出不含 `Basic:`/`Epic:` 前缀**（phase-only 投影落实）。
3. web 组件测试 — status badge 文本 = phase 且**存在独立 has-children 元素**（父/子指示器），无可编辑 status 控件（StatusSelect 已删）。
4. `bun test src/test/no-persisted-status-role.test.ts` — 断言 `backlog/tasks/*.md` frontmatter 无 `status:`/`role:` 字段（删字段落实）。
5. CLI 无 status 独立编辑面：断言 `task create`/`task edit` 无 `-s/--status` 选项。
6. **自足证明**：`bun test src/test/epicd-self-sufficient-no-status.test.ts` 或脚本级 e2e —— epicd 驱动一个任务 draft→…→done 全程不读/写 raw status，且在 baime `scan-loop.js` reaper **停用**下仍完成（证明 epicd 已替代 baime、可外部卸载）。

（第 2+3 项证「status 投影 phase-only、role 独立呈现」；第 4+5 项证「字段与编辑面已消除」；第 6 项证「epicd 自足、baime 可卸载」——本 epic 里程碑，非单测并集。）

## Constraints

- **不改 baime**：仅替代，卸载由人外部执行；不迁移/不修改 baime 内部。
- **不动引擎核心机制**：engine complete/adjudicate/DoD 重跑/merge-lock/worktree/claim 隔离、pipeline-as-data/phase 语义。
- **status 投影 phase-only**：role 不进 status 串，只作独立 has-children 显示轴。
- **分批有序**：monitor-gated 批（child 3/4）等 BACK-660；child 4（删 status）前置为 1+3（epicd 无 status 读者）；跳序鲁莽删会断线。
- 复用 BACK-655/BACK-643/BACK-660，不重造。
- 每个 Basic child = 一个可独立评审 PR（ADR-018）。

## 颗粒度论证（ADR-018）

5 个 child（1 投影 phase-only+移编辑面 / 2 删 role 字段 / 3 claim 轴+零读者 / 4 删 status 字段 / 5 lint），各为独立可评审 PR、各有独立验收，并按 monitor 依赖分两批：monitor-free（1、2）即刻可驱动、monitor-gated（3、4）等 BACK-660、5 末位收口。child 1 坍缩投影 + 加 has-children 指示器 + 删 CLI/web 编辑面是一条自足可评审 PR（跨 field-registry/web/cli）；child 2 删 role 字段依赖 BACK-643；child 3 改 claim 机制 + 清 status 读点；child 4 减 status 字段迁移；child 5 加 CI 门——互不为彼此的步骤。阶段 0（BACK-655/643/660）是上游依赖不重复计入。合计规模（投影坍缩 + 前端 has-children + 编辑面删除 + claim 机制 + 运行时清读 + 两次减字段迁移 + lint + 各测试）落在数千行，跨 CLI/engine/web/harness，符合 epic 判据。
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
