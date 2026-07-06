---
id: BACK-665
title: >-
  任务生命周期模型不动点（M1）：数据/Web UI 符合 doc + status 去 Basic:/Epic: 前缀（has-children
  独立呈现）+ 每个机器 phase 有 skill
status: 'Epic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-06 11:15'
updated_date: '2026-07-06 11:44'
labels:
  - 'kind:epic'
  - 'area:engine'
  - 'area:runtime'
  - 'area:web'
dependencies: []
references:
  - docs/task-lifecycle-model.md
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 这是什么

本 epic 是 docs/task-lifecycle-model.md 所描述模型的**单一不动点锚点**——它不新增实现，而是把「模型完全落地」收敛为一个可执行验收的顶层 task。其 Integration Acceptance 就是不动点的**可执行定义**：当且仅当下列全部为真，模型达成。散落在子 task 的工作，都是构成这个不动点的 deliverable。

## 不动点要求（用户明确，包括但不限于）

1. **数据结构 + Web UI 真正符合 docs/task-lifecycle-model.md**：per-task 只持久化 `(pipeline_id, phase)`；status/role 不落盘、渲染边界实时算；Web = pipeline 泳道视图 + phase 列 + `actor⟗claim` 驱动指示；CLI/TUI/Web 皆为渲染器，不发明状态词汇。
2. **status 中不再出现 `Basic:`/`Epic:` 字样**：status 投影 = `titleCasePhase(phase)`，纯显示时计算；一个 task 是否有子 task（compound）由**独立 has-children 指示器**在合适位置呈现，永不拼进 status 串；无任何独立 status 编辑面。
3. **每个需要机器处理的 phase 都有一个执行 skill**：三条 pipeline 全部 `actor==machine` 的 phase（ready/decomposing/evaluating/draft/refining/spike）各有一个随 epicd 发布、contracts 合法、provenance 溯源、零 baime 运行时依赖的执行 skill（spike 经实验收敛后提取）。

## 组成（子 deliverable = 本 epic 的 children，经 `--parent-id` 挂载）

- **BACK-664**（数据/UI L3，sub-epic）：要求 1+2 主体——status/role 投影 phase-only、删持久字段、移编辑面、has-children 独立指示器、claim 轴独立、lint 挡死。
- **BACK-657**（机器 phase skill 集，sub-epic）：要求 3——infra + primitive-executor + epic-lifecycle + authoring skills。
- **BACK-658**（spike methodology-bootstrapping 实验）：要求 3 的 exploration/spike skill 前置——收敛后提取。
- **BACK-643**（roleOf 认 kind:epic）：要求 2 的**承重前置**——删 role 字段后 pre-decompose epic 派生 compound 的唯一途径。
- **BACK-660**（monitor 前台 loop）：要求 1 的 claim 轴前置——epicd 原生运行时替代 baime reaper，解锁 claim 轴与删 status 字段。

## 不动点（invariants）

- **不改 baime**——epicd 自建能力替代之，由人外部卸载（对 baime 零依赖 = M1 自举，ADR-011 D-7-bis）。
- 不动引擎核心机制（complete/adjudicate/DoD 重跑/merge-lock/worktree/claim 隔离/pipeline-as-data/phase 语义）。
- 三平面原则：状态机是唯一词汇源，CLI/TUI/Web 只投影、永不反喂。
- 每个 leaf child = 一个可独立评审 PR（ADR-018）；本 epic 手动/LFDD 驱动，不依赖尚未建成的自动 decompose/monitor。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 数据结构+Web UI 全面符合 docs/task-lifecycle-model.md：per-task 仅持久化 (pipeline_id,phase)；status/role 不落盘、渲染边界实时算；Web=pipeline 泳道+phase 列+actor⟗claim 驱动指示；有测试/组件测试断言之
- [ ] #2 status 中无 Basic:/Epic: 字样：displayStatus==titleCasePhase(phase) 且全仓无代码生成该前缀；compound 由独立 has-children 指示器在合适位置呈现（web+CLI），永不进 status 串；无任何独立 status 编辑面（无 -s/--status、无 web status 下拉）
- [ ] #3 每个 actor==machine 的 phase（ready/decomposing/evaluating/draft/refining/spike）都有执行 skill：随 epicd 发布、contracts 合法、provenance 溯源、零 baime 运行时依赖；phase-skill-coverage 测试断言全覆盖（spike 允许 experiment-pending 指向其实验）
- [ ] #4 epicd 原生运行时自足：停用 baime scan-loop.js reaper 后 epicd 仍全程驱动任务 draft→…→done（证明替代成功、baime 可由人外部卸载）；全程不修改 baime 内部
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Epic Plan: 任务生命周期模型不动点

## Goals（= 不动点，可验收）

1. 数据结构 + Web UI 全面符合 docs/task-lifecycle-model.md（IA 1–5）。
2. status 无 `Basic:`/`Epic:` 前缀、has-children 独立呈现、无独立编辑面（IA 2–4）。
3. 每个机器 phase 有执行 skill（IA 6）。
4. epicd 原生运行时自足、baime 可被人外部卸载（IA 7）。

## Sub-Task Decomposition（children，已 `--parent-id` 挂到本 epic）

- **BACK-664** — 数据/UI L3（sub-epic，含其 5 个 child：投影 phase-only+移编辑面 / 删 role 字段 / claim 轴 / 删 status 字段 / lint）。
- **BACK-657** — 机器 phase 执行 skill 集（sub-epic，含其 4 个 child：infra / primitive-executor / epic-lifecycle / authoring）。
- **BACK-658** — spike methodology-bootstrapping 实验（收敛后提取 exploration/spike skill）。
- **BACK-643** — roleOf 认 kind:epic（要求 2 承重前置）。
- **BACK-660** — monitor 前台 loop（要求 1 claim 轴前置）。

## Sequencing（三条轨 + 跨 child 依赖）

- **轨 A｜数据/UI monitor-free（可即刻 LFDD 启动）**：BACK-664 child1（投影 phase-only + 移编辑面）→ BACK-643 → BACK-664 child2（删 role 字段）。**直接交付要求 2 的可见部分**。
- **轨 B｜skills（与 A 并行）**：BACK-657 child1（infra）→ child2（primitive-executor）∥ child3（epic-lifecycle）∥ child4（authoring）；BACK-658（spike 实验收敛）→ 回 BACK-657 补 spike skill。**交付要求 3**。
- **轨 C｜数据 monitor-gated**：BACK-660（monitor 原生运行时）→ BACK-664 child3（claim 轴）→ child4（删 status 字段）→ child5（lint）。**交付要求 1 的 claim/自足部分 + 末位收口**。
- 轨 A、B 并行即刻启动；轨 C 由 BACK-660 就绪解锁。全部 done 后 baime 卸载由人外部执行（出 scope）。

## Integration Acceptance（不动点的可执行定义；ADR-019：装配后端到端，非各 child 单测并集）

1. `bun test` 全绿。
2. `! grep -rlE '^(status|role):' backlog/tasks/*.md`（或等价测试）——无 task 文件持久化 `status:`/`role:`。
3. **status 投影 phase-only**：测试断言对每个 phase `displayStatus(task) == titleCasePhase(task.phase)`、输出**无 `Basic:`/`Epic:` 前缀**；且全仓无代码生成该前缀（field-registry 前缀分支已删）。
4. **has-children 独立呈现 + 无编辑面**：web 组件测试断言 status badge 文本=phase 且存在独立 has-children 元素；CLI `task list` 有 has-children 标记；无可编辑 status 控件、`task create`/`task edit` 无 `-s/--status`。
5. **Web 符合 doc**：pipeline 泳道 + phase 列 + `actor⟗claim` 驱动指示（组件/e2e 测试）。
6. **每个机器 phase 有 skill**：`bun test src/test/phase-skill-coverage.test.ts`——全部 `actor==machine` phase 要么有已发布+登记+contracts 合法+provenance 的 skill，要么 experiment-pending 指向其实验。
7. **自足证明**：停用 baime `scan-loop.js` reaper 后 epicd 仍全程驱动一个任务 draft→…→done（证明替代成功、可外部卸载 baime），全程不改 baime。

（第 1–5 项证要求 1+2；第 6 项证要求 3；第 7 项证 M1 自举/baime 可卸载。均为可执行断言。）

## Constraints

- **不改 baime**：仅替代，卸载由人外部执行；不迁移/不修改 baime 内部。
- **不动引擎核心机制**：complete/adjudicate/DoD 重跑/merge-lock/worktree/claim 隔离/pipeline-as-data/phase 语义。
- 每个 leaf child = 可独立评审 PR（ADR-018）。
- 本 epic 手动/LFDD 驱动：不依赖尚未建成的自动 decompose/monitor（它们本身是 children）。

## 颗粒度论证（ADR-018）

本 epic 是里程碑级不动点锚点。children 含两个大 sub-epic（BACK-664 数据/UI、BACK-657 skills，各已数千行量级）+ 三个 enabler（643/658/660）。合计规模远超单 epic 上限，且含 ≥2 独立可评审可合并交付（数据/UI 轨、skills 轨各自独立成立、互不为彼此的步骤），符合 epic 判据；作为顶层锚点提供单一不动点验收（Integration Acceptance = 三要求的可执行定义）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
不动点 evaluate 门 = 可执行 gauge src/test/back665-fixpoint.ts，显式运行：`bun test ./src/test/back665-fixpoint.ts`（文件名不含 .test.，bare `bun test` 不收录、不打断其它任务 DoD）。现 0/8 RED，每断言映射到负责 child（IA-2/3/4/5→BACK-664、IA-6→BACK-657 c1、IA-7→BACK-660+664C、IA-eval→BACK-657 c3）。随 child 落地逐条转绿，全绿=不动点达成——这是迭代收敛信号，防「child 全绿但业务目标未达」。
<!-- SECTION:NOTES:END -->
