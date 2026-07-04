---
title: "多车道 issue-list：pipeline 泳道的人机协同视图"
status: Proposal
stage: proposal
date: 2026-07-04
deciders: Yale Huang
applies-to:
  - "src/web/components/TaskList.tsx"
  - "src/core/search-service.ts"
  - "src/server/index.ts"
relates-to:
  - "docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md"
  - "docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md"
  - "docs/uml/use-case-model.md"
  - "backlog BACK-601.1 (IssueSource)"
---

# Proposal: 多车道 issue-list —— pipeline 泳道的人机协同视图

> 本文是 proposal（pre-decision 设计稿），**不含 plan、不含 class/内部实现设计**（后者留待 class diagram 阶段）。
> 只定义**用户可见行为**与承载它的数据模型；行为图见 `docs/uml/`（use-case / sequence / activity / state）。

## 1. 背景与动机

epicd 的主交互面应从 Kanban 转为**以 issue-list 为主的多车道视图**（use-case-model View 1）。
现有 `TaskList.tsx`（All Tasks 表）已提供 status/priority/labels/milestone 过滤 + priority 排序，
是天然基座；但它是**单一扁平表**，没有"车道"概念，也读不到"某个 task 正被引擎（monitor 驱动的
Claude Code）处理"这一运行时事实。本提案把它升级为**多车道 + 人机双驱动可视 + 内联 gate** 的主视图。

## 2. 锁定的模型：三轴解耦

经评审裁定，**车道 / label / status 是三个正交轴**，各管一件事——这是本提案的核心约束：

| 轴 | 载体 | 语义 | 可配置性 |
|---|---|---|---|
| **车道 (lane)** | **`pipeline_id`（结构字段）** | 决定 task 属于**哪条车道** | 固定集合，**仅经 config 调整**（= 增删 pipeline）|
| **label** | 自由标签 | 车道**内/跨**的正交过滤 | 保持 **OR** 语义，**与车道定义无关** |
| **status / state** | pipeline state | 车道**内**的列 / 排序 / 可见性 | pipeline 车道的列 = `states[]`（有序）|

裁决要点：
- **车道 ≡ `pipeline_id`**，是结构字段，**不是 label、不是用户可存的任意过滤**。加车道 = config 里加一条
  pipeline（与 pipeline-as-data / ADR-011 D-2、E3 完全一致）。**明确否决** baime 的 "lane = `kind:` label" 做法——
  在 epicd 里 `kind:*` 只是普通正交标签（与 E1 把结构轴搬离 label 同向）。
- **label 保持 OR、保持独立**：不加 AND、不升谓词表达式（simplicity）。label 用来在任意车道视图内**再收窄**，
  但**不参与车道成员资格**。
- **status 双重身份**：既可影响车道内**排序/可见性**（如默认隐藏终态），又是车道内**分列**轴；pipeline 车道
  优先用其 `states[]` 有序分列。

### 2.1 非目标（本提案显式排除）

- N1 **不做** saved-filter / 具名自定义车道预设。
- N2 **不改** label 过滤语义（保持 OR）。
- N3 **不做** class diagram / 内部实现架构（组件拆分、状态管理、缓存等留待后续）。
- N4 **不设计** auth（见 BACK-604）、不设计 gate-event 富语义（E/C/H 归 payload）。

### 2.2 三平面原则（治理约束，2026-07-04 裁决）

三个平面**词汇不同、变更速率不同、外部约束不同**，只能经**显式单向投影/契约**耦合：

| 平面 | canonical | 代码锚点 | 变更速率 | 约束源 |
|---|---|---|---|---|
| **核心状态机** | domain state machine | `Pipeline`/`PipelineState` + `Interpreter`（纯数据+纯函数）| 最慢，受 ADR 保护 | 我们（ADR-010/011/012）|
| **执行/驱动** | execution-driver plane | monitor + `scan-loop.js` + claim(`.active-agents`/`.caps`) + worktree/lock | 最快，soak=baime→M1=引擎 | **外界**：Claude Code session、spawn 成本、worktree 隔离 |
| **人类展示** | presentation plane | `TaskList.tsx` 多车道 | 产品/UX 速率 | 人的注意力 |

**总原则**：状态机是唯一权威词汇；另两平面**从它投影**，永不反向定义它。可变性被推到投影函数与注册表里，核心 closed（开闭）；两平面各设一道**只读防腐契约**——数据面 = `IssueSource`，运行时面 = `Coordinator`。UI 只消费投影，禁止显示/config 字符串反喂引擎逻辑。

## 3. 用户可见行为（RUP 行为图索引）

本提案的行为由 `docs/uml/` 下四张图定义（渲染：`PLANTUML_LIMIT_SIZE=16384 plantuml -tpng docs/uml/<f>.puml`）：

| 图 | 文件 | 表现什么 |
|---|---|---|
| **Use Case** | `use-case-model.puml` (View 1) | 多车道 issue-list 作为主面：swimlane by pipeline_id、人机双驱动可视、内联 gate-review |
| **State** | `workitem-lifecycle-state.puml` | 一个 Task 在 authoring→execution 两条 pipeline 间的状态机（用户看到它怎么流动）|
| **Activity** | `issue-list-activity.puml` | 端到端人机协同流：capture→authoring(自动)→promote gate(人)→execution(自动)→gate-review(人) |
| **Sequence** | `issue-list-sequence.puml` | 三个交互：加载多车道板 · agent 驱动的实时更新 · 人的内联 gate-review |

## 4. 提议设计（用户可见层）

### 4.1 布局

```
┌ lane-switcher: [全显] [execution] [authoring] [exploration] … ┐   ← 车道来自 config pipelines[]
├─ ▼ Execution   (pipeline_id = execution)         ← 可折叠 swimlane 分区
│     列 = execution.states 有序 | 排序 = priority
│     ┌ row: 👤 待你 gate  /  🤖 正被 Claude Code 处理  ┐   ← 每行驱动者指示
├─ ▶ Authoring   (collapsed)
└─ ▼ (no pipeline)   ← 兜底车道：无 pipeline_id 的旧 Backlog.md task（回填前）
```

- **基座**：`TaskList.tsx`（过滤条 + priority 排序列复用）。
- **多车道**：每条 pipeline 一个**可折叠分区**（swimlane），顶部 **lane-switcher**（全显 / 选若干 / 单选专注）。
  swimlane 渲染复用 `MilestonesPage` 现有结构。
- **label 正交**：过滤条中的 label（OR）在任意车道视图内**再收窄**显示，不影响分车道。
- **status 内轴**：车道内按 status/state 排列（pipeline 车道用 `states[]` 有序），priority 二级排序，
  默认可隐藏终态。

### 4.2 人机双驱动可视（核心差异点）

每行显示**谁在驱动这条 task**，由 domain state（IssueSource）与 live claim（Coordinator）**join** 得出：

| domain state | 有 active claim? | 指示 | 含义 |
|---|---|---|---|
| needs-human | — | 👤 | 待你 gate（claim 无关）|
| in-progress | 有 | 🤖 | 引擎正在动 |
| **in-progress** | **无** | **⚠️ stale/orphaned** | 崩溃/孤儿——stale-in-progress 免费掉出 |
| ready | 无 | ○ | 待 scan |

claim 信息来自**运行时协调面**（`Coordinator.claims()`，见 R1），经 WebSocket 实时刷新（复用现有
`tasks-updated` 通道）。人看着 issue-list 就能看到引擎在动，也能一眼看出孤儿行。

### 4.3 内联 gate-review

`needs-human` 行内联提供 approve / reject / escalate——**gate-inbox 融入本页**，不另设页面。
裁决 = 一次状态写入（经 IssueSource.upsert 推进 state），随后 WebSocket 广播、其它视图同步。

## 5. 影响面 / 与现状的差距

- **唯一后端缺口**：`src/core/search-service.ts` 的 `NormalizedFilters` 只有 status/priority/labels/assignee/
  modifiedFiles，**无 `pipeline_id`**。须把 `pipeline_id`（可含 `role`/`state`）纳入搜索索引与过滤器——
  这是"按 pipeline 分车道"的前提。status/labels 已可过滤，无需改。
- **前端**：`TaskList.tsx` 增 group-by-lane 分区 + lane-switcher + 每行驱动者指示；label 过滤条保留正交。
- **config**：车道集来自 pipelines[]；**车道显示配置（列/排序/默认折叠）建议直接挂在 pipeline 定义上**，
  不另设 `lanes[]`，省一层。
- **兜底车道**：无 `pipeline_id` 的旧 task 归 "no pipeline" 车道；与 E1 就地回填衔接，回填后自动归位。
- **运行时协调面**：4.2 依赖 supervisor/Coordinator 暴露 claim/active-driver 状态（driver-supervisor proposal
  的运行时侧；本提案只消费，不定义其内部）。

## 6. 风险与未决问题

> R1/R3/R4 已于 2026-07-04 依 §2.2 三平面原则裁决方向；R2 仍未决。

- **R1 驱动者状态来源 — 已裁决**：🤖 指示是**正交运行时事实**，不是 pipeline state，永不折进 task 持久
  状态。走独立只读契约 `Coordinator.claims(): Map<taskId, {driverId, field:(sourceId,pipeline_id), since}>`，
  前端 `tasks(IssueSource) ⟗ claims(Coordinator)` 做 join。**契约形状 soak↔引擎不变**：soak 期由 baime
  `.active-agents`/`.caps` 投影，M1 后由引擎 claim registry 投影，UI 不变（driver-supervisor §7 R5 边界内）。
  推论：`state=in-progress ∧ ¬claim` = **stale/orphaned**，stale-in-progress 免机制免费掉出（见 4.2 指示表）。
- **R2 兜底车道与回填时序 — 未决**：回填前大量旧 task 挤在 "no pipeline"；是否给它一个临时默认 pipeline_id？
- **R3 status↔state 词汇 — 已裁决**：**不统一词汇，统一来源**。canonical = 引擎 pipeline state；config
  `Basic: Ready`、UI `To Do/In Progress/Done` 都是显示投影，由**单向纯函数** `label(state, role, plane)` 产出，
  **只存在于渲染边界**。禁止 UI/config 字符串反喂引擎逻辑。R3 由此从"大重构"降级为"边界处一张 pure lookup +
  一条单向规则"（与 ADR-011 D-2.1 同向）。
- **R4 车道显示配置 — 已裁决**：**结构留 pipeline，显示提示分层**。`states[]` 顺序是结构真值，留在 pipeline；
  纯显示提示（默认折叠 / 隐藏终态 / 图标 / 车道标题）挂一层薄 presentation config `{pipeline_id → displayHints}`，
  **引用** pipeline_id 而不写进 pipeline 定义——守住 ADR-011 D-2.1，且不必另设重量级 `lanes[]`。

## 7. 收敛判据（proposal 级）

本 proposal 视为 ready-for-plan，当：
- 三轴解耦模型（lane=pipeline_id / label 正交 OR / status 内轴）经 architect 评审 APPROVED；
- R1（驱动者状态读取契约）与 R2（兜底车道/回填时序）得到方向裁决；
- 四张行为图（use-case/state/activity/sequence）与本模型一致且被确认；
- 与 driver-supervisor proposal（运行时协调面）、BACK-601.1（IssueSource 数据面）接口对齐。

> 下一步（**不在本提案内**）：class diagram + 内部实现架构；据此产出 plan 或起 backlog task
> （"search 加 pipeline_id 过滤 + TaskList 多车道分区 + 驱动者指示"）。
