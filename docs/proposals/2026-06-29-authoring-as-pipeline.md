---
title: "Authoring 作为一等 pipeline：后台化 propose/plan"
status: Proposal
stage: proposal
date: 2026-06-29
deciders: Yale Huang
applies-to:
  - "src/engine/pipeline.ts"
  - "src/engine/interpreter.ts"
  - "src/types/index.ts"
relates-to:
  - "docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md"
  - "docs/adr/ADR-010-engine-safety-invariants.md"
---

# Proposal: Authoring 作为一等 pipeline（后台化 propose/plan）

> 本文是 proposal（pre-decision 设计稿），**不含 plan**。收敛后再产出 plan / 升格 ADR。

## 1. 背景与动机

baime 的 authoring skill（`feature-to-backlog`/`epic-to-backlog`/`task-to-backlog`：把一段
意图驱动成 architect-reviewed 的 proposal + plan，落到 backlog）在交互会话里是**前台、阻塞**
运行的。诉求是让它们**缺省在后台跑**,仅在显式要求时前台。

对"如何后台化"做了三项经验探测（2026-06-29，在 baime 会话内实测）：

1. **真实耗时（60 次历史调用，10min idle 切断）**：
   `feature-to-backlog` p50≈13min / p90≈36min；`task-to-backlog` p50≈7min / p90≈14min。
   88%（53/60）≥5min，17 次 ≥15min。**前台阻塞的代价是实打实的。**
2. **嵌套 subagent：BLOCKED**。子代理的工具集里**根本没有 `Agent`/`Task` 工具**。而这些
   skill 的评审靠内部 fan-out 到独立 `Agent` 上下文跑。所以"把整个 skill 塞进一个后台
   子代理"会让评审循环失效。
3. **子代理无法回驱父会话**。实测：后台子代理是叶子节点，唯一回程是**完成时返回的文本**；
   `PushNotification`/`RemoteTrigger` 的收件人是用户或 claude.ai 远端，**不是父会话**；不能
   mid-run 通知、不能触发父去派生 agent。能"触发更多动作"的唯一间接通道是写共享文件 / Backlog
   板，**且必须有一个 watcher 在轮询**。

`claude -p`（脱离的 headless 子进程）作为后台机制被**显式否决**。

### 推论（本提案的核心论点）

> 能消费"后台产物并继续 fan-out"的执行体，**本身必须是一个主循环**（只有主循环持有 `Agent`）。
> epicd 里恰好已经有这样一个执行体:**Interpreter 的 `(pipeline, state)` handler**——它由 Monitor
> /worker（主循环）派发,因而能 fan-out 到独立 reviewer。

因此后台化 authoring 的自洽形态**不是**包子代理、**不是** `claude -p`,而是:

**把 authoring(propose/plan)建模为引擎里的第二条 pipeline,其 state-handler 在 Monitor worker
中运行,通过 `item-ready` 事件后台触发,fan-out 到独立 `Agent` reviewer,终态经 cross-pipeline
edge 派生进 execution pipeline,产物落板等人 gate。**

这与 ADR-011 完全对齐:authoring 只是"新增一条 pipeline + 新增 handler"(D-2.1/D-3 的加法
扩展),不触碰解释器 core;且正是 D-7-bis 所列随引擎发布的操作 skill(`propose`/`promote`)的
落地形态。

## 2. 问题陈述

当前 authoring 是交互式前台 skill,带来两个结构问题:

- **阻塞**:一次 7–36min 的 propose/plan 占住交互会话,人无法并行推进别的事。
- **机制错配**:想后台化时,所有"轻量"机制(子代理、headless 子进程)要么破坏评审 fan-out
  /独立性,要么被否决。缺一个**既后台、又保留主循环 fan-out 能力**的载体。

epicd 已有该载体(Interpreter + `item-ready` + Monitor),但目前只挂了一条 `execution`
pipeline;authoring 还停在 baime 的前台 skill 形态。

## 3. 目标 / 非目标

**目标**
- G1 authoring 缺省后台运行,不阻塞交互会话。
- G2 保留评审**独立性**:propose/plan 的 architect 评审仍在**独立 `Agent` 上下文**进行
  (反对"单上下文自评审"的质量打折)。
- G3 与 ADR-011 的"pipeline 即数据、引擎即通用解释器"一致:authoring = 新增 1 条 pipeline
  + handler,**不改解释器 core**。
- G4 人类 gate 保留在**边界**:人发起 authoring(intake)、人把终态产物 promote 进 execution。
  (符合 baime `dev-workflow-preference`:人管 gate,loop 管 execution。)

**非目标**
- N1 不在本提案产出 plan(显式约束)。
- N2 不实现完整 gate-event 富语义(E/C/H 归 `payload`,见 ADR-011 D-4)。
- N3 不改 `execution` pipeline 的既有行为。
- N4 不做交互式 mid-run 人类问答(authoring handler 无人值守;遇阻塞落 `needs-human` 软停)。

## 4. 提议设计

### 4.1 新增一条 `authoring` pipeline(数据)

```
authoring:
  states:
    - propose      (actionable: true,  gate, actor: llm)   # 起草 + architect 评审循环至 APPROVED
    - plan         (actionable: true,  gate, actor: llm)   # 由 approved proposal 生成 + 评审 plan
    - needs-human  (actionable: false)                      # 评审耗尽/阻塞软停
    - done         (actionable: false, terminal)            # 产物就绪,等 promote
  transitions:
    propose --on approved--> plan
    plan    --on approved--> done
    (任一 gate 耗尽预算) --> needs-human
  cross-pipeline edge:
    done --promote--> execution.ready   # provenance.spawned_from(ADR-011 D-2.3)
```

- propose / plan 都是 **gate state**(actor=llm):handler 内部跑"起草 →(fan-out 独立 Agent
  reviewer)→ 修订"循环,收敛到 APPROVED 或耗尽预算(对齐现有 skill 的 8 轮软限)。
- 终态 `done` 经 **cross-pipeline edge** 把产物(plan / 待执行 Task)派生进 `execution.ready`,
  用 `provenance.spawned_from` 记溯源,**区别于** `parent_id`(ADR-011 D-2.3)。

### 4.2 Handler 注册(逻辑进 handler,结构进数据 —— ADR-011 D-2.1)

```
interpreter.register(authoringPipeline, "propose", proposeHandler)
interpreter.register(authoringPipeline, "plan",    planHandler)
```

- `proposeHandler` / `planHandler` 在 **Monitor worker(主循环)** 中执行 → **持有 `Agent`** →
  可 fan-out 到独立 architect reviewer。**这正是子代理/headless 路径做不到、而本路径成立的根因。**
- handler 失败/耗尽 → 置 `state: needs-human`(非 actionable,软停等人)。
- gate 裁决写 `GateEvent`(ADR-011 D-4 最小写入即可);E/C/H 语义留 `payload`,引擎不解释。

### 4.3 后台触发与人类 gate 的位置

- **Intake gate(人)**:人创建一个 `pipeline_id: authoring, state: propose` 的 Task(一句话意图)。
  这是"create" gate,符合 `dev-workflow-preference`。
- **执行(loop,后台)**:Monitor `scan` 发现该 Task actionable → 发 `item-ready: authoring:propose:<id>`
  → dispatch 到 handler → 后台跑 propose→plan,无人值守。
- **Promote gate(人)**:`authoring` 落 `done` 后,产物在板上;**人** promote 它进 `execution`
  (或经一道显式 gate)。authoring 与 execution 之间不自动越界,保住人类对"开工"的最终授权。

→ 交互会话从此**不被 authoring 阻塞**;人只在两端(发起、放行)出现,中间评审全后台、全独立。

### 4.4 操作 skill 的归位(ADR-011 D-7-bis)

baime 现有的 `feature-to-backlog`/`task-to-backlog` 从"交互式前台 skill"重定位为
**引擎侧 `propose`/`plan` handler**(随引擎发布的操作 skill)。方法论语义(E/C/H、iteration
度量)仍归 baime,落在 `payload` 与 baime 自己的 skill —— 与 D-7-bis 的可移植性分界一致。

## 5. 为什么不是其他方案

| 方案 | 否决理由(经验依据) |
|---|---|
| 整个 skill 包进后台子代理 | 子代理无 `Agent` 工具(实测 BLOCKED),评审 fan-out 断。 |
| 子代理跑"单上下文自评审"(扁平化) | 丢掉独立 reviewer → 自评审偏置,违 G2。 |
| `claude -p` headless 子进程 | 用户显式否决。 |
| 子代理回驱主会话再 fan-out | 实测子代理只有 final-return,无 mid-run 上行通道,不能触发父动作。 |
| **authoring 作为 pipeline + handler(本提案)** | 唯一同时满足"后台 + 主循环 fan-out + 评审独立 + 与 ADR-011 同构"的形态。 |

## 6. 影响面 / 与现状的差距

当前 `src/engine/pipeline.ts` 的 `PipelineState` 只有 `{ name, actionable }`;ADR-011 D-2 的
富 State(`kind: normal|gate|terminal`、`actor`、`escalation`、`budget`)与 cross-pipeline
edge / `provenance.spawned_from` **尚未实现**(types 里无 `provenance`)。本提案落地需要:

- 扩 `PipelineState`:`kind` + `actor`(gate 默认裁决者)。
- 引入 `transitions` / `terminals`(当前 `Pipeline` 只有 `states`)与 `on` 具名事件。
- types 增 `provenance.spawned_from`,支持 cross-pipeline 派生。
- 注册一条 `authoring` pipeline 与两个 handler。

(以上为**差距清单**,非 plan;具体步骤、顺序、DoD 留待 plan 阶段。)

安全不变量沿用 ADR-010:authoring handler 虽不 merge 代码,其产物落板与派生仍走同一 worker
纪律(串行化写、cap 幂等);worktree 隔离对纯文档产物可放宽,待 plan 评估。

## 7. 风险与未决问题

- **R1 富 State / transitions 是 ADR-011 尚未实现的部分**:本提案会**拉动** E0 之后的 pipeline-as-data
  扩展。需确认这是否抢在自举里程碑(M1)的合理位置,还是应等 execution 自驱稳定后再上。
- **R2 gate 在 handler 内的循环边界**:propose/plan 的"评审至 APPROVED"是 handler 内部的 step
  (易逝、不可重入),而 `propose`/`plan` 作为 phase 是可恢复 checkpoint(ADR-011 D-2.2)。需明确
  崩溃恢复语义:重入是从 phase 起点整轮重跑,还是 handler 自带幂等续跑。
- **R3 promote 自动化程度**:`authoring.done → execution.ready` 是纯人 gate,还是允许带 SLO 的
  half-gate?(ADR-011 autonomy / B 类 preference 外化的位置。)
- **R4 与 baime skill 的迁移**:现有 `feature-to-backlog` 逻辑迁成 handler 的成本与等价性验证。

## 8. 收敛判据(proposal 级)

本 proposal 视为 ready-for-plan,当:
- 架构形态(authoring=pipeline+handler、cross-pipeline 派生、双端人 gate)经 architect 评审 APPROVED;
- R1(时机)与 R3(promote 自动化)得到人的方向裁决;
- 与 ADR-011 的一致性(只加 pipeline+handler、不动 core)被确认。

> 下一步(**不在本提案内**):据此产出 plan,或先把 R1/R3 升格为 ADR 增补。
