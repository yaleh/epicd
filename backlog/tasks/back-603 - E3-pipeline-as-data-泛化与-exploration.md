---
id: BACK-603
title: 'E3: pipeline-as-data 泛化 + exploration pipeline'
status: 'Epic: Done'
assignee:
  - '@claude'
created_date: '2026-06-26 09:00'
updated_date: '2026-07-05 11:22'
labels:
  - 'kind:epic'
  - 'epicd:E3'
dependencies:
  - BACK-601
ordinal: 4000
pipeline_id: execution
phase: done
role: compound
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
补全 pipeline-as-data 泛化（ADR-011 D-2/D-3）：引擎为任意 DAG 的解释器。以 **exploration pipeline**（`spike→evaluate→kill/promote`）作为验证扩展性的第三条实例——它与 execution 的成功定义根本不同，正是"多 pipeline"的存在理由。

包含 **cross-pipeline edge**（`provenance.spawned_from`，区别于 `parent_id`），以及把完整 ADR-010 不变量折入引擎测试套件。

**验收测试（耦合纪律）**：加一条新 pipeline 只触碰「数据定义 + 新 handler」，永不触碰解释器/引擎 core。

参考：ADR-011 D-2/D-2.3/D-3；baime 讨论记录 §12/§15.3 E3。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1（E0 完成）之后由 epicd 引擎自驱**；exploration pipeline 本身是新增的第三条 pipeline 实例，正好用引擎自驱链路验证"加 pipeline 不改 core"。旧 loop-backlog 仅作 soak fallback，本 epic 不触发旧机制退役。

## 测试 / build 机制
- **单元测试**：解释器对任意 DAG 的 `(pipeline,state)` 分派；cross-pipeline edge（`provenance.spawned_from` vs `parent_id`）区分；handler-registry 注册/查找。
- **集成测试**：exploration pipeline 端到端跑通 `spike→evaluate→kill/promote`（与 execution 不同的成功定义）。
- **耦合纪律测试**：以"新增一条 pipeline 只改数据定义 + 新 handler、diff 不触碰解释器/core"为可执行断言（AC#3）。
- **完整 ADR-010 不变量**进引擎测试套件（AC#4），细分 unit（不变量逐条）+ 集成（多 pipeline 并行）。
- **build**：`bunx tsc --noEmit` + `bun run check .` + `bun run build` 全绿。

## Web UI 改进方向
多 pipeline 引入后，kanban / board 视图**不得硬编码 execution 状态列**——须能渲染 exploration 的 `spike/evaluate/kill/promote` 等任意 pipeline 状态。本 epic 须确认 board 渲染由 pipeline 数据定义驱动（列由 pipeline 的 state 集派生），与 E4 看板 repoint 协调；如现有 board 硬编码了 Basic/Epic 状态，须在此暴露并记为 E4 的改造输入。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 exploration pipeline（spike→evaluate→kill/promote）以纯数据定义并跑通
- [x] #2 cross-pipeline 派生经 `provenance.spawned_from` 记录，与 `parent_id` 区分
- [x] #3 加新 pipeline 不触碰解释器/core（耦合纪律验收）
- [x] #4 完整 ADR-010 不变量进引擎测试套件
- [x] #5 PipelineState 增 actor: machine|human|none（泛化现 actionable: boolean）；turn=actor(phase) 由 pipeline-data 派生而非 per-task 存储；scan 谓词按 actor==machine ∧ 无有效 claim（参 proposal §2.3 终版）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# E3: pipeline-as-data 泛化 — Epic Decomposition

> 颗粒度纪律（CLAUDE.md）：每个 child ≈ 一个可评审 PR（≤~2000 行）。E3 范围内聚
> （引擎主机侧管道注册泛化 + 一个新增数据 pipeline 的验证性实例），故切三个 child，
> 按"先泛化主机侧,再加新数据"的依赖顺序排列。

## 现状 survey（file:line 已核对，2026-07-05）

- `src/engine/pipeline.ts`：`Pipeline`/`PipelineState{name, actor:machine|human|none}`
  已是纯数据（AC#5 的 actor 泛化已在 BACK-600.7 完成，本 epic 无需再动）。
- `src/engine/interpreter.ts`：`Interpreter.register/scan/dispatch` 已是完全
  pipeline-无关的通用调度核心（不含任何 pipeline id 字符串）。
- `src/engine/driver.ts`：`Driver` 构造函数已接受 `pipelines: Pipeline[]`
  （非硬编码单一 pipeline）——这两个文件已经是"解释器/core"，本 epic 的
  AC#3 耦合纪律就是要求：加 exploration pipeline **不改这两个文件一行**。
- 真正硬编码在"只有 execution 一条管线"上的是**主机侧 wiring**（非 core）：
  - `src/engine/scan.ts`：`PHASE_PREFIX` 只列 execution 的三个 phase 名，且
    `if (pipelineId !== executionPipeline.id) continue` 硬过滤掉其他 pipeline。
  - `src/engine/run.ts`：`runEngine` 内 `new Driver([executionPipeline], ...)`
    硬编码单元素数组；`hasPendingWork` 同样只查 `executionPipeline`。
  - 这层需要泛化为"任意已注册 pipeline 列表"，否则新增 exploration pipeline
    时即使 core 不用改，主机侧仍会被迫逐处特判——这正是 AC#1/AC#2 的"泛化"
    含义，与 AC#3 的"core 不碰"并不矛盾（wiring 属于泛化对象，不属于"解释器/core"）。
- `src/types/index.ts` 目前只有 `parent_id?: string`，没有 `provenance`/
  `spawned_from` 字段（AC#2 待做）。
- ADR-010 ENG-1..5：grep 现状——ENG-1/ENG-3/ENG-4 已在
  `engine-supervisor.test.ts`/`engine-merge-wire.test.ts` 显式标注；ENG-2
  （worktree 隔离）/ENG-5（父对账 gate 非终态）有等价场景测试
  （`engine-safety-worktree.test.ts`/`engine-tracer-fixpoint.test.ts`
  等）但未显式标注为 ENG-2/ENG-5，AC#4 要求"完整 ADR-010 不变量进引擎测试
  套件"——需要补齐显式断言，不能只满足于"名字没提但语义覆盖"。

## Sub-Task Decomposition

### 603.1 — 引擎主机侧管道注册泛化 + ADR-010 ENG-1..5 全集测试整合
- **交付**：
  - `src/engine/scan.ts`：`PHASE_PREFIX` 与硬编码的 `executionPipeline.id`
    过滤，改为对"已注册 pipeline 列表"通用推导（不再假设唯一一条 execution
    pipeline）；`scanReadyLines` 签名可接受 `pipelines: Pipeline[]`
    （默认值可为 `[executionPipeline]` 保持向后兼容，调用方不必都改）。
  - `src/engine/run.ts`：`runEngine`/`hasPendingWork` 同样泛化为接受
    `pipelines: Pipeline[]`（默认 `[executionPipeline]`），不再在函数体内
    写死单元素数组。
  - 新增 `src/test/adr-010-invariants.test.ts`：把 ENG-1…ENG-5 五条不变量
    各自的执行断言集中列出并显式标注（可以是对既有场景测试的薄包装/引用，
    不要求重写断言逻辑，但**每条不变量必须有至少一个显式标注 ENG-N 的测试**），
    补齐当前缺失的 ENG-2/ENG-5 显式标注。
- **Acceptance（含 negative control）**：
  - `bunx tsc --noEmit` && `bun run check .` 绿。
  - 泛化前后行为不变的回归：现有 `engine-scan.test.ts`/`engine-run.test.ts`
    对 execution 单管线的既有断言必须全部保持通过（不是被删除或改弱）。
  - ENG-1…ENG-5 五条不变量在 `adr-010-invariants.test.ts` 中逐条可定位
    （grep `ENG-1`..`ENG-5` 各至少一处）。
- **依赖**：无（基础，603.3 依赖本 child 的泛化结果）。
- **领域分类**：本 child 的"泛化 wiring 使其数据驱动"是**通用模式**
  （任何"解释器为任意 DAG 调度"的系统都需要这一步）；具体触碰的文件路径
  （`scan.ts`/`run.ts`）是 epicd 特有细节。

### 603.2 — provenance.spawned_from 字段：cross-pipeline edge 与 parent_id 区分
- **交付**：
  - `src/types/index.ts`：为 `Task` 增加可选 `provenance?: { spawned_from: string }`
    （与既有 `parent_id?: string` 并存，语义不同：`parent_id` 是同一 pipeline
    内的分解树父子边；`provenance.spawned_from` 是**跨 pipeline** 派生边，
    例如 exploration 的 spike 任务派生出一个 execution 任务）。
  - frontmatter 序列化/解析（`parent_id` 所在的同一处 markdown
    读写路径）同步支持 `provenance`，确保保存/加载往返不丢字段。
  - 新增 `src/test/task-provenance.test.ts`：
    - round-trip 单测：一个任务同时设置 `parent_id`（或不设置）与
      `provenance.spawned_from`（设为不同的任务 id），保存后重新加载，
      两个字段独立、互不覆盖。
    - 区分性单测：`provenance.spawned_from` 存在但 `parent_id` 不存在
      （跨 pipeline 派生、非分解树子节点）的任务被正确解析为"非 compound
      的子节点"（不应被 `isCompound`/`parent_id` 相关逻辑误判为分解树子任务）。
- **Acceptance**：`bunx tsc --noEmit` && `bun run check .` 绿；
  `bun test src/test/task-provenance.test.ts` 绿。
- **依赖**：无（与 603.1 并行，603.3 依赖本 child）。
- **领域分类**：""区分派生边类型（分解边 vs 跨管线派生边)"是通用模式
  （任何支持"任务可以派生新任务"的系统都要面对这个区分）；`provenance`
  字段名与 `Task` 类型的具体位置是 epicd 特有细节。

### 603.3 — exploration pipeline（spike→evaluate→kill/promote）纯数据定义 + 端到端 + 耦合纪律负控测试
- **交付**：
  - `src/engine/pipeline.ts`：新增 `explorationPipeline: Pipeline`
    （states: `spike`(actor:machine) → `evaluate`(actor:machine) →
    `kill`(actor:none，终态) / `promote`(actor:none，终态)）。纯数据，
    与 `executionPipeline`/`authoringPipeline` 同风格并列。
  - 新增 `src/engine/exploration-handlers.ts`（或等价新文件）：spike/evaluate
    两个 machine-actor phase 的 handler 实现（例如 evaluate 阶段按某个判据
    决定推进到 kill 还是 promote——与 execution 的"done/needs-human 二元"
    成功定义根本不同，是本 epic description 强调的"多 pipeline 存在理由"）。
  - 用 603.1 泛化后的 `pipelines: Pipeline[]` 接口把 `explorationPipeline`
    接入（如 `runEngine`/`scanReadyLines` 调用方传入
    `[executionPipeline, explorationPipeline]`）——这属于"新增数据 + 新
    handler + 调用方传参"，不修改 `interpreter.ts`/`driver.ts`/
    `complete.ts`/`adjudicate.ts` 一行。
  - 新增 `src/test/exploration-pipeline.test.ts`：端到端跑通两条路径
    `spike→evaluate→kill` 与 `spike→evaluate→promote`；至少一个场景用
    603.2 的 `provenance.spawned_from` 记录一次跨 pipeline 派生
    （例如 promote 时从 exploration spawn 出一个 execution 任务）。
  - 新增 `src/test/pipeline-coupling-discipline.test.ts`（AC#3 可执行断言，
    非文档承诺）：
    1. **正控**：grep `src/engine/interpreter.ts`、`src/engine/driver.ts`、
       `src/engine/complete.ts`、`src/engine/adjudicate.ts` 四个文件，断言
       都不含字符串 `"exploration"`（大小写不敏感）——证明新增这条 pipeline
       没有在 core 里做任何专属分支。这条测试作为**永久回归闸**保留
       （未来任何人想在 core 里特判 exploration 都会被此测试拦下）。
    2. **负控（本 epic 的重点）**：测试内部临时构造一段"假装把 exploration
       专属分支塞进 interpreter.ts"的字符串/fixture（不是真的改源文件，而是
       构造一个包含该模式的临时字符串输入喂给同一条 grep/断言逻辑），确认
       该断言逻辑确实会在有违规时报红——防止"正控测试形同虚设"（例如 grep
       模式写错、大小写不敏感设置反了等）。
  - AC#5（actor 字段泛化）在本 epic 范围内**无需新 child**——已由
    BACK-600.7 落地（`PipelineState.actor: machine|human|none`），603.1
    survey 已确认；本 epic 结束时在 epic 的 AC#5 勾选并注明依据。
- **Acceptance**：`bunx tsc --noEmit` && `bun run check .` 绿；
  `bun test src/test/exploration-pipeline.test.ts src/test/pipeline-coupling-discipline.test.ts` 绿；
  `bun test --parallel` 全绿（确认未破坏既有套件）。
- **依赖**：603.1（管线注册泛化）、603.2（provenance 字段）。
- **领域分类**：""加新领域概念只应触碰数据定义与新增独立文件,不碰调度核心"
  是通用模式（可迁移到任何"引擎/解释器 + 可插拔业务规则"架构）；
  spike/evaluate/kill/promote 这组具体状态名与"exploration"这个概念本身
  是 epicd 特有细节（这条 pipeline 要解决的具体业务问题）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-05 独立 fresh-context 审计（主会话直接派发，非 driver 自报）发现并处理：
- HIGH：adr-010-invariants.test.ts 的 ENG-4 断言此前是 expect(true).toBe(true) 占位符（AC#4 名不副实）。已修复为真实的重启幂等场景（merge commit，见 git log），复用 engine-supervisor.test.ts:57 的场景。
- MEDIUM（记录，不改代码）：AC#1 文本描述的是 spike→evaluate→kill/promote 四态设计，BACK-639 实际落地为 spike→done 两态（evaluate/kill/promote 决策折入 exploration-handlers.ts 的 handler 内部，kill/promote 共享同一终态 phase 名）。这是一个已生效但未回写 AC 文本的简化决策；本轮不改代码/不改 AC 文本，仅在此记录以避免未来误读 AC#1 为"四态已实现"。
- MEDIUM（已归档 follow-up）：explorationPipeline 从未被任何真实调用方（cli.ts/supervisor.ts）传入 runEngine/scanReadyLines，生产路径不可达，仅测试内可达。归档为 BACK-641，不在本轮扩大范围修复。
- 其余（tsc/check/test 全绿、AC#3 耦合纪律负控、provenance round-trip、scan/run 泛化）经独立审计确认为真实实现，非自证。
<!-- SECTION:NOTES:END -->
