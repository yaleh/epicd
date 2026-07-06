---
id: BACK-665
title: >-
  任务生命周期模型不动点（M1）：数据/Web UI 符合 doc + status 去 Basic:/Epic: 前缀（has-children
  独立呈现）+ 每个机器 phase 有 skill
status: 'Epic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-06 11:15'
updated_date: '2026-07-06 12:15'
labels:
  - 'kind:epic'
  - 'area:engine'
  - 'area:runtime'
  - 'area:web'
dependencies: []
references:
  - docs/task-lifecycle-model.md
  - scripts/fixpoint-back665.ts
  - docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md
  - docs/adr/ADR-016-decomposition-orthogonality-checklist.md
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 这是什么

本 epic 是 docs/task-lifecycle-model.md 所描述模型的**单一不动点锚点**：不新增实现，而是把「模型完全落地」收敛为一个**可执行验收**的顶层 task。其收敛信号是 `bun scripts/fixpoint-back665.ts`——把下述整个期望系统编码为 red→green 检查的 value function（当前 **0/10，全 red**）。迭代直到它 10/10 且 `--with-suite` 全绿，不动点即达成；在此之前「所有子任务都 done」**不等于**业务目标达成（ADR-019）。

## 期望系统的完整画像（= docs/task-lifecycle-model.md 落地）

**四轴 + role 数据模型**——per-task 只持久化 `(pipeline_id, phase)` 两个结构量：
- **lane**（`pipeline_id`，存）、**phase**（存，唯一进度真值）。
- **role**（派生：有 children⇒compound；未分解 epic 由 `kind:epic` 派生 compound。渲染为**独立 has-children 指示器**，不进 status 串）。
- **actor / turn**（派生：`pipelineDef[phase].actor ∈ {machine,human,none}`）。
- **active / claim**（运行时：`Coordinator.claims`，永不持久；`In Progress` 是 claim 不是 status）。

**三条 pipeline**：execution / authoring / exploration，状态 = phase，每 phase 标 actor；机器 scanner 只捡 `actor==machine ∧ 无有效 claim`。

**三平面**：核心状态机（唯一词汇源）→ 执行/驱动面（monitor 原生 loop + claim + worktree/lock，替代 baime reaper）→ 人类展示面（CLI/TUI/Web 纯渲染器）。status/label 单向投影，永不反喂引擎（R3）。

**投影 = phase-only**：status 显示串 = `titleCasePhase(phase)`，**无 `Basic:`/`Epic:` 前缀**；compound 由独立 has-children 指示器呈现；无任何独立 status/role 编辑面；status/role 不落盘、渲染边界实时算；一条 CI lint 挡死回流。

**每个机器 phase 有执行 skill**：ready/decomposing/evaluating/draft/refining/spike 各有随 epicd 发布、contracts 合法、provenance 溯源、**零 baime 运行时依赖**的 skill（extract/mechanical/experiment 三分路径建成；spike 经实验收敛后提取）。`(pipeline_id,phase)→skill` registry 单一真值——人手动驱动与 monitor 自动驱动查同一张表。

**自我强制回路**：epic 的 evaluate **运行其 Integration Acceptance 并据此 gate**（非仅聚合子 terminal phase），故「装配后不达标」不会被误判为 done。

**自举 / 可卸载**：epicd 原生运行时（monitor 前台 loop + claim + engine-native staleness reaping）自足到零 baime 运行时依赖；停用 baime `scan-loop.js` reaper 后仍全程驱动 → 人可**外部卸载 baime**（不改 baime；M1 自举方向，ADR-011 D-7-bis）。

## 三个显式要求（用户明确，均含于上）

1. 数据结构 + Web UI 真正符合 docs/task-lifecycle-model.md。
2. status 中不再出现 `Basic:`/`Epic:`（显示时计算），compound 在合适位置**独立**呈现。
3. 每个需要机器处理的 phase 都有执行 skill。

## 组成（children，经 `--parent-id` 挂载）

- **BACK-664**（数据/UI L3）· **BACK-657**（机器 phase skill 集）· **BACK-658**（spike methodology-bootstrapping 实验）· **BACK-643**（roleOf 认 kind:epic，承重前置）· **BACK-660**（monitor 前台 loop，claim 轴前置）。

## 不动点 invariants

- **不改 baime**——替代之，由人外部卸载。
- 不动引擎核心机制（complete/adjudicate/DoD 重跑/merge-lock/worktree/claim 隔离/pipeline-as-data/phase 语义）。
- 三平面原则：状态机是唯一词汇源，界面只投影、永不反喂。
- 每个 leaf child = 可独立评审 PR（ADR-018）。
- **收敛判据 = fixpoint meter 全绿**：`bun scripts/fixpoint-back665.ts --with-suite` exit 0，**非**子任务 DoD 之并集。
- **迭代扩张**：执行中发现的新问题/缺口，若属现有 check 范围则修复令其转绿；若引入**新验收面**，则给 meter **加一条 red check + 开一个 child**——meter 随不动点一起演进，保证所有新发现被覆盖收敛。
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

1. 数据结构 + Web UI 全面符合 docs/task-lifecycle-model.md。
2. status 无 `Basic:`/`Epic:` 前缀、has-children 独立呈现、无独立编辑面。
3. 每个机器 phase 有执行 skill。
4. epicd 原生运行时自足、baime 可被人外部卸载。

## 收敛信号（单一 value function）

`bun scripts/fixpoint-back665.ts`（快，结构检查）/ `--with-suite`（含全量 `bun test`）。
当前 **0/10**。每个 check 标注它证明的 AC 与交付它的 child。10/10 且 suite 全绿 = 不动点达成。

## Sub-Task Decomposition（children，已 `--parent-id` 挂到本 epic）

- **BACK-664** — 数据/UI L3（sub-epic：投影 phase-only+移编辑面 / 删 role 字段 / claim 轴 / 删 status 字段 / lint）。
- **BACK-657** — 机器 phase 执行 skill 集（sub-epic：infra / primitive-executor / epic-lifecycle〔evaluate 跑集成验收〕/ authoring）。
- **BACK-658** — spike methodology-bootstrapping 实验（收敛后提取 spike skill）。
- **BACK-643** — roleOf 认 kind:epic（要求 2 承重前置）。
- **BACK-660** — monitor 前台 loop（要求 1 claim 轴前置）。

## Sequencing（三条轨 + 跨 child 依赖）

- **轨 A｜数据/UI monitor-free（即刻启动）**：BACK-664 child1（投影 phase-only + 移编辑面）→ BACK-643 → BACK-664 child2（删 role 字段）。翻绿：projection-phase-only / no-prefix-generator / no-cli-status-edit / no-web-status-select / has-children-indicator / web-lifecycle-conformance / (role 部分) no-persisted-status-role。
- **轨 B｜skills（与 A 并行）**：BACK-657 child1（infra→coverage 测试）→ child2（primitive-executor）∥ child3（epic-lifecycle，evaluate 跑集成验收）∥ child4（authoring）；BACK-658（spike 实验收敛）→ 回 657 补 spike skill。翻绿：phase-skill-coverage / evaluate-runs-integration-acceptance。
- **轨 C｜数据 monitor-gated**：BACK-660（monitor 原生运行时）→ BACK-664 child3（claim 轴）→ child4（删 status 字段）→ child5（lint）。翻绿：epicd-self-sufficient-no-baime / (status 部分) no-persisted-status-role。
- 轨 A、B 并行即刻启动；轨 C 由 BACK-660 就绪解锁。全绿后 baime 卸载由人外部执行（出 scope）。

## 迭代执行契约（LFDD）——「同意」即按此驱动

**主循环**（重复直到 meter 10/10 + suite 全绿）：
1. 读 meter，按轨序（A monitor-free 与 B skills 并行先行；C 待 BACK-660）选下一个 ready leaf。
2. 若该 leaf 尚非独立 task，先物化为对应 sub-epic 的 child（`task create --parent-id` + `feature-to-backlog` 补 proposal/plan）。
3. 用 LFDD 驱动该 leaf：分支/worktree → TDD 红→绿 → DoD gate → merge。
4. 重跑 meter：对应 check(s) 应转绿（回归即视为未完成）。
5. **处理新发现**（几乎必然出现）：属现有 check 范围 → 在当前/后续 leaf 修复；引入**新验收面** → 给 meter 加一条 red check + 开一个 child（`--parent-id` 到 BACK-665 或相应 sub-epic），纳入循环。
6. 回到 1。

**终止**：`bun scripts/fixpoint-back665.ts --with-suite` exit 0 → BACK-665 evaluate 通过 → done。

## Integration Acceptance（= 不动点可执行定义；ADR-019 装配后端到端）

0. **`bun scripts/fixpoint-back665.ts --with-suite` exit 0** —— 单一判据，下列各项是其分解 check（见脚本）。
1. `bun test` 全绿。
2. 无 task 文件持久化 `status:`/`role:`。
3. status 投影 phase-only：`label`/`displayStatus` 无 `Basic:`/`Epic:` 前缀，且全仓无前缀生成代码。
4. has-children 独立呈现 + 无编辑面（无 `-s/--status`、无 web StatusSelect、CLI list 有 has-children 标记）。
5. Web 符合 doc：pipeline 泳道 + phase 列 + `actor⟗claim` 驱动指示。
6. 每个 `actor==machine` phase 有 skill（或 experiment-pending 指向其实验）；evaluate 跑集成验收。
7. 自足证明：停用 baime `scan-loop.js` reaper 后 epicd 仍全程驱动 draft→…→done，全程不改 baime。

## Constraints

- **不改 baime**：仅替代，卸载由人外部执行。
- **不动引擎核心机制**。
- 每个 leaf child = 可独立评审 PR（ADR-018）。
- 本 epic 手动/LFDD 驱动：自动 decompose/monitor 本身是 children，不作为前置假设。

## 颗粒度论证（ADR-018）

顶层不动点锚点。children 含两个大 sub-epic（BACK-664、BACK-657，各数千行量级）+ 三 enabler（643/658/660）。合计远超单 epic 上限，≥2 独立可评审可合并交付（数据/UI 轨、skills 轨各自独立成立），符合 epic 判据；作为顶层锚点提供单一不动点验收（fixpoint meter）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
不动点 evaluate 门 = 可执行 gauge src/test/back665-fixpoint.ts，显式运行：`bun test ./src/test/back665-fixpoint.ts`（文件名不含 .test.，bare `bun test` 不收录、不打断其它任务 DoD）。现 0/8 RED，每断言映射到负责 child（IA-2/3/4/5→BACK-664、IA-6→BACK-657 c1、IA-7→BACK-660+664C、IA-eval→BACK-657 c3）。随 child 落地逐条转绿，全绿=不动点达成——这是迭代收敛信号，防「child 全绿但业务目标未达」。
<!-- SECTION:NOTES:END -->
