---
adr: "011"
title: "Task Schema 与 Pipeline 契约：引擎核心数据模型"
status: Proposed
date: 2026-06-26
applies-to:
  - "src/types/index.ts"
  - "src/markdown/parser.ts"
  - "src/markdown/serializer.ts"
  - "src/core/**"
enforcement: semantic
stage: [proposal, plan]
lint: |
  # 待引擎实现 schema 后补：schema 校验测试（static）
  # bash scripts/tests/workitem-schema.test.sh
---

# ADR-011: Task Schema 与 Pipeline 契约

**Status**: Proposed（草案，待 human 过设计 gate）
**Date**: 2026-06-26
**Deciders**: Yale Huang
**Crystallizes**: baime 讨论记录 `docs/discussions/2026-06-26-backlog-engine-fork-direction.md` 的决策 D1–D8（§7/§12/§13）
**Provisional engine name**: Mainspring（裸 npm/org 名已被无关小项目占用，需 scoped 包名或换 org；终名待定）

## Context

本仓库（forked Backlog.md）将重构为 baime 自有的"自治工作引擎"，并把 loop-backlog
的确定性运行时移入。当前 Backlog.md 的 task 结构是通用看板模型，baime 一直在
*迁就* 它：`cap:*` 幂等标记、DoD 结果、parent 链接、E/C/H premise-ledger、gate 证据
都被塞进 freeform notes，事后靠正则反取（即信息论框架中 `L(R|G)` 的膨胀）。

本 ADR 把已决的数据模型钉死为引擎契约，作为 E0（引擎自驱 MVD）的前置——E0 的
最小字段集必须是本 ADR 的子集。详见讨论记录 §10、§15。

## Decision

### D-1. Task：单一递归 schema

取消 Epic/Basic/Job 等并列类型。**只有一种实体 `Task`，可递归含子节点。**

> **命名（2026-06-26 修订）**：实体直接复用 **`Task`**，不另造 `WorkItem`。理由：fork 的现有类型
> 已是 `Task`（`src/types/index.ts` / parser / serializer / `backlog task` CLI / `task-NNN` 文件 /
> `task_create` MCP），命名为 `WorkItem` 会与全栈既有词汇永久分裂；复用 `Task` = **扩展现有类型**，
> 改动面最小。"Task" 一词的重载由 D-1.1/D-6 解决：**`Epic` 是唯一带标记的角色**，primitive 即裸 `Task`。

```
Task := {
  id:          string            // 稳定唯一
  title:       string
  pipeline_id: string            // 引用一条 pipeline 定义（见 D-2）
  state:       string            // 必须是该 pipeline 的一个 state
  role:        "compound" | "primitive"   // 见 D-1.1
  parent_id:   string | null     // 分解树边（containment）
  domain:      string            // software|research|experiment|writing|...（属性，非层级）
  provenance:  { spawned_from?: string } | null  // 跨 pipeline 派生边，区别于 parent_id（见 D-2.3）
  dod:         DoDItem[]         // 结构化、可执行的验收门
  cap:         CapMarker[]       // 结构化幂等标记（取代 freeform cap:*）
  budget:      Budget | null     // 可选预算上限
  created_at:  timestamp
  updated_at:  timestamp
  body:        markdown          // 人面向视图：description / plan / notes
  // 扩展字段经 D-5 的通用机制声明，引擎不硬编码 baime 概念
}

DoDItem   := { check: string, status: "pending"|"pass"|"fail" }
CapMarker := { key: string, value: string }     // 如 {key:"execute", value:"done"}
```

`children` 不存储，由 `parent_id` 反向派生。

#### D-1.1 role 派生规则 + 能力相对停止判据

- `role` 默认 **派生**：有子节点 ⇒ `compound`；叶子 ⇒ `primitive`。
- 允许在子节点出现前 **声明意图**（一个尚未分解的 compound）。
- **`Epic` 是唯一带标记的角色 = compound 角色的展示名；primitive 无需标签，就是裸 `Task`（实体名本身）。**
  二者都不是独立类型——只是同一 `Task` 实体在树中位置不同时的展示。（参照 GitHub：万物皆 Issue，
  "Epic" 只是带 sub-issue 的 Issue。）散文里凡指 compound 一律称 "epic" 以消歧。
- 分解停止判据（决定一个节点何时为 primitive，必须显式且为安全栏）：

  > 一个节点是 **primitive（Task）** 当且仅当：*单个自治 worker 能在一个隔离
  > worktree 内、预算之内，把它做到可验证的 DoD*。否则为 **compound（Epic）**，必须分解。

- 该边界 **随模型能力浮动**（G 增强 → `L(R|G)` 收缩 → primitive 线上移）。
  schema 不得把叶子大小固化为常数（如固定 story point / 固定层数）。

理由：HTN 规划的 compound/primitive 二元；WBS work-package 判据；GitHub sub-issues
的统一递归。见讨论记录 §13。

### D-2. Pipeline 作为数据；引擎作为通用解释器

```
Pipeline := {
  id:    string,
  entry: string,                                  // 起始 state
  states: State[],
  transitions: Transition[],
  terminals: { state: string, classification: "success"|"kill"|"failure" }[],
}
State := {
  name: string,
  kind: "normal" | "gate" | "terminal",
  actor?: "llm" | "human",        // gate 的默认裁决者（见 D-4 / ADR autonomy）
  escalation?: string,            // 升级条件的具名引用（逻辑在 handler，不在数据）
  budget?: Budget,
}
Transition := { from: string, to: string, on?: string }   // on 为具名事件，不是表达式
```

- 引擎是 **任意 DAG 的解释器**，不是 Basic/Epic 硬编码派发器。
- 引擎对处于 `(pipeline, state)` 且 actionable（非终态、未阻塞、gate 满足）的
  Task 发出 **单一参数化事件**：`item-ready: <pipeline_id>:<state>:<task_id>`（`item-ready`/`item_id`
  为解释器的通用基质词汇——"流经某 pipeline state 的一个 item"——其载体即 Task）。
  （取代旧 daemon 的 5 个硬编码事件。）

#### D-2.1 耦合纪律：结构进数据，逻辑进 handler

- **数据**：states / transitions / gate 标记 / 默认 actor / 预算 / terminal 分类。
- **handler 代码**：state 上发生什么工作（按 `(pipeline_id, state)` 注册）。
- **禁止** 在 pipeline 定义里出现条件 / 表达式 / 循环——那属于 handler。
- **验收测试**：加一条新 pipeline，只触碰「数据定义 + 新 handler」，**永不**触碰
  解释器 / 引擎 core。

#### D-2.2 Phase = pipeline state；Stage 移出模型

- **Phase** = 执行 pipeline 的一个 state：引擎可观测、持久、可恢复的 checkpoint
  （= orchestrator 能重入的点）。不再是树层级。
- **Stage** = 单个 phase-handler 内部的子步：agent 内部、易逝、重试重跑、引擎不跟踪
  （= orchestrator 不能重入的点）。**移出正式模型**（建议口语称 "step"）。
- 判别规则：**可恢复性即边界**。参照 Temporal workflow(持久)/activity(非持久)。见 §13.4。

#### D-2.3 Cross-pipeline edge

- 一条 pipeline 的 terminal state 可向另一条 pipeline **派生** Task（如
  exploration `promote` → execution `backlog`）。
- 该"派生/溯源"关系经 `provenance.spawned_from` 记录，**区别于** `parent_id`
  的 containment 关系。二者不强制重合。

### D-3. role/domain 是属性，不是层级（加法，非乘法）

新增领域（研究/实验/探索）只 **新增一条 pipeline**，不产生新树层级、不产生新 schema。
固定分类法会令复杂度 = 领域 × 层级（乘法）；本模型令其 = 领域 + 层级（加法）。见 §13.5。

### D-4. Gate-event log：通用基质 + baime 语义

人面向 task 仍是 markdown（视图）；gate event **同时** 追加到结构化、可查询的日志（仪器）。

```
GateEvent := {
  id:         string,
  item_id:    string,
  pipeline_id:string,
  gate:       string,
  actor:      "llm" | "human",
  verdict:    string,
  timestamp:  timestamp,
  payload:    object,          // 引擎不解释；baime 在此放 E/C/H 等语义
}
```

- 存储：append-only，可查询（JSONL 或 SQLite，实现待定）。
- **边界**：引擎只知道 GateEvent 的通用形状与读写 API（可上游）；**E/C/H、GCL、
  delta_H 的语义全在 `payload`，由 baime 的 GCL 管线解释**。引擎 core 永不硬编码这些。
  见 §7。

### D-5. Field-registry：单一描述符表

字段处理收敛为 **一张描述符表**，`parse / serialize / validate / TaskCreateInput /
TaskUpdateInput / MCP schema` 全部由它派生（取代当前 ≥5 处分散逻辑）。baime 概念
（role、cap、结构化 DoD、扩展字段）作为该机制的 **声明实例** 注册，引擎不硬编码。

```
FieldDescriptor := {
  yamlKey: string, tsName: string, type: TypeTag,
  parse: fn, serialize: fn, validate: fn, mcpSchema: object
}
```

### D-6. 命名

- 实体：**`Task`**（单一递归 schema，复用 fork 现有类型，不另造 `WorkItem`）。
- 角色：**`Epic`** 是唯一带标记的角色名（= compound 展示）；primitive 即裸 `Task`，无独立标签。
  **弃用 `Job Task`、`Basic Task`，以及把 `Task` 当作"与 Epic 并列的角色标签"的旧说法。**
- **Phase** 保留（= 执行 pipeline state）；**Stage** 降为 informal step，移出正式模型。
- **ADR-005 调整**：原"强制 `kind:` label"前提改为 **role 派生/声明**（叶子⇒裸 Task、
  有子⇒Epic）；仅在需预先声明意图时存储 role。

### D-7-bis. 操作 skill 随引擎发布（可移植性边界）

引擎不仅是 Core + 运行时 + UI，**还包含一个 Claude Code 插件**，承载 *操作引擎的通用 agentic skill*：
`propose` / `promote` / `inbox` / `run` / `init` + Monitor/worker。它们是引擎面向 LLM 的 UX，
**随引擎 repo 发布**，可移植到任意项目。

- **分界**（D-2.1/§7 同一条边界应用到 skill 层）：
  - 引擎插件 = *操作* skill（驱动 pipeline、过 gate、派发 worker）——通用，随引擎走。
  - baime = *方法论* skill（iteration-executor、knowledge-extractor、measurement 等）+ `payload` 中的 E/C/H 语义。
- **可移植性验收测试**：在一个全新项目里装上引擎插件，应得到可用的自治 backlog，**对 baime 零引用**。
  若不能，说明有 skill 泄漏到了错误的一侧。
- **被自举纪律强制**：自举里程碑 M1（引擎 repo 自驱自身开发）要求操作 skill *就在引擎 repo 内*——
  否则它无法用"住在别处"的 skill 驱动自己。故 skill-in-engine 不仅方便，是 M1 的前置。

### D-7. E0（MVD）最小字段子集

E0 只需实现以下子集（其余推给 MVD 自驱完成，见 §15.4）：

- Task: `id, title, pipeline_id, state, role, parent_id, dod, cap`
- 一条 **execution pipeline** 定义（`backlog→ready→in-progress→done` + `needs-human`）
- GateEvent **最小写入**（至少捕获完成事件）+ **agent→engine 完成 API**
- 解释器最小核：`item-ready` 事件 + 按 `(pipeline,state)` 分派 handler
- **安全关键**（不可省）：merge 串行化、worktree 隔离、cap 幂等（ADR-010 子集）

延后：domain 富语义、field-registry 完美、exploration pipeline、完整 GateEvent 查询、UI、auth。

## Consequences

- 四个命名层级（Epic/Task/Phase/Stage）+ 潜在领域叉乘，压缩为
  **一个递归节点 + pipeline(数据) + 一条能力相对判据**。
- 结构化数据从 freeform notes 迁出，GCL 管线由"取证式重建"变"干净读取"。
- 引擎保持通用、可上游；baime 概念全部位于 `payload` / 声明实例 / handler，不污染 core。
- E0 的字段集有了明确、最小、安全的边界。

## Alternatives Considered

- **固定分类法（Jira 风 Epic>Story>Task>Sub-task）**：被否。subtask 不能再嵌套是
  公认痛点；无法表达"叶子随能力浮动"。
- **完全通用 workflow 引擎（YAML 里图灵完备）**：被否。Temporal/Airflow/BPMN 沼泽；
  本 ADR 限定"控制流进数据、逻辑进 handler"。
- **gate event 仅存 markdown body 段**：被否。GCL 管线需可查询；正则反取即当前痛点。

## Open Questions（延后，不阻塞本 ADR）

- escalation predicate 先上哪个（不可逆闸门 vs 校准置信度）—— §11.8。
- gate-event 存储是否最终走"结构化为唯一真相源"—— §11/§13 的更激进选项。
- 是否需要 baime 私有扩展 *表* 对 E/C/H 做重度索引查询 —— §7。
- 引擎终名 + scoped 包名 / org 决策。

## References

- baime 讨论记录：`/home/yale/work/baime/docs/discussions/2026-06-26-backlog-engine-fork-direction.md`（§7/§12/§13/§14/§15）
- [HTN 规划](https://en.wikipedia.org/wiki/Hierarchical_task_network) · [WBS work package](https://www.rock.so/blog/work-breakdown-structure) · [Temporal 持久执行](https://docs.temporal.io/workflow-execution) · [GitHub sub-issues](https://github.blog/engineering/architecture-optimization/introducing-sub-issues-enhancing-issue-management-on-github/)
