---
title: "Pipeline 驱动机制与队列语义：driver 是纯传输，队列是 (phase, claim) 的派生"
status: Proposal
stage: proposal
date: 2026-07-08
deciders: Yale Huang
applies-to:
  - "src/engine/pipeline.ts"
  - "src/engine/driver.ts"
  - "src/engine/interpreter.ts"
  - "src/engine/complete.ts"
  - "src/engine/run.ts"
  - "src/engine/safety.ts"
  - "src/engine/dispatch.ts"
  - "src/engine/retreat.ts"
relates-to:
  - "docs/task-lifecycle-model.md"
  - "docs/adr/ADR-010-engine-safety-invariants.md"
  - "docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md"
  - "docs/adr/ADR-015-monitor-as-invocation-adapter.md"
  - "docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md"
  - "docs/proposals/2026-07-04-multi-lane-issue-list.md"
  - "plugin/skills/fixpoint-convergence/SKILL.md"
  - "plugin/skills/adjudicate/SKILL.md"
  - "plugin/skills/primitive-executor/SKILL.md"
provenance:
  - "从 BACK-682（收敛机制层）落地后的实操驱动经验中提炼（2026-07-08 讨论）"
---

# Proposal: Pipeline 驱动机制与队列语义

> 本文是 proposal（pre-decision 设计稿），**不含 plan**。它把 BACK-682 落地后一次
> 真实驱动（fixpoint-convergence 作为前台 stand-in driver 把 BACK-682 自身驱动到
> done）中暴露的机制问题提炼成模型级判断，作为 BACK-660（monitor 后台 driver）与
> 收敛机制层运行时补全的设计依据。它不引入与 `docs/task-lifecycle-model.md` 冲突的
> 新词汇，只在其 4 轴模型之上**细化 actor 轴**并**硬化 claim 轴**。

## 1. 背景

`docs/task-lifecycle-model.md` 已确立 4 轴模型：per-task 只持久化 `(pipeline_id,
phase)`，其余（role / actor / active-claim）全部派生或运行时。`actor` 由
`pipelineDef[phase].actor ∈ {machine, human, none}` 查表得出；`active/claim` 是正交
运行时轴，永不持久（`phase=ready ∧ 无 claim = stale 孤儿`）。

BACK-682 新增了 `execution/adjudicating`（独立 judgment 复核 + 单步回退契约）。在把
BACK-682 自身驱动到 done 的过程中，两件事被实证：

1. **driver 从不写 phase**。`ready→adjudicating` 由 `engine complete`
   （`completeTask`）落笔；`adjudicating→done` 由 adjudicate skill 的独立叶子 agent
   落笔。前台 stand-in driver 只做了"派谁、何时派、派完校验"。
2. **`actor=machine` 太粗**。它把"引擎 tick 内同步跑完的机械活"和"必须派一个 LLM
   会话的长耗时活"混为一类，而 scan-loop/monitor 唯一昂贵的动作恰恰是"派会话"。

本文据此给出整体驱动机制，然后给出具体 pipeline/phase 变更方向。

## 2. 不变量：driver 是纯传输

> **驱动器（driver）是纯传输；phase 迁移永远由该 phase 的 actor 落笔，driver 只决定
> "何时 invoke 谁"。driver 自己从不写 `phase` 字段。**

这条不变量是"两种运行模式可互换"的根基：fixpoint-convergence（前台手动 stand-in）
与 monitor（后台自动）消费同一套机制层、同一份 phase→skill registry、同一套"谁落笔
phase"的责任划分。二者是**同一个循环的两套 invoke/claim 实现**，不是两套方法论。

### 2.1 共享的 tick 循环（mode-independent）

```
loop:
  1. scan   : 找 actor(phase)=machine-agent ∧ 无有效 claim 的 task
  2. claim  : 占据运行时 claim（正交轴，带租约，永不落盘进 phase）
  3. invoke : 按 (pipeline_id, phase) 从 registry 查出 phase skill，派它
  4. ——skill / engine-primitive 干活 + 落笔 phase 迁移——（不是 driver 干）
  5. release: 释放 claim（或让租约到期）
  6. 直到 fixpoint（无 machine-agent phase 且无 claim = hasPendingWork()==false）
```

`human` phase 不进这个循环——driver 跳过，等人；`none` phase 是终态/等子。

### 2.2 两种模式 = 同一循环

| 环节 | fixpoint-convergence（前台，手动） | monitor（后台，自动，BACK-660） |
|---|---|---|
| 谁跑循环 | 人在一个 CC 会话里 | 常驻进程 |
| scan | 人读 board / `task view` | `engine scan` |
| claim | 隐式（人是唯一 driver） | `.active-agents` + 引擎原生 claim 记录 |
| invoke | 人 `/skill` 或派 Agent | `dispatch.ts` 渲染 payload → 会话 |
| fixpoint | 人判断"没活了" | `hasPendingWork()==false` |
| **迁移落笔** | **skill / primitive / 人** | **skill / primitive / 人（同一方）** |

推论（应作为 BACK-660 的机械 AC）：**替换 driver（前台↔后台）不改变任何一次 phase
迁移的落笔方**。这是 ADR-015 swap-litmus 强化到迁移粒度的形式。

## 3. actor 细化：machine-mechanical vs machine-agent

`actor=machine` 应细分为两类，因为它们在调度成本上根本不同：

| 细分 | 含义 | 成员 |
|---|---|---|
| `machine-agent` | 必须 dispatch 一个 LLM 会话（spawn 成本、多数要 worktree、分钟级） | execution/ready、execution/decomposing、execution/adjudicating(**full**)、authoring/draft、authoring/refining |
| `machine-mechanical` | 引擎 tick 内同步 resolve（无 LLM、无 worktree、无会话） | execution/evaluating、execution/adjudicating(**light**) |

- **只有 5 步真正需要 LLM 长耗时**（`machine-agent`）。它们才值得 scan-loop 掏
  "派会话"的成本，才进 `dispatch`。
- `evaluating` 是纯机械：`engine evaluate`（`evaluateEpic`）跑 epic 的 IA shell 命令
  + 聚合子 task 终态算 verdict。为它占用一个座席/会话是纯浪费——引擎应在 tick 内直接
  跑掉。**现成机械 AC：删掉 `dispatch.ts` 的 `evaluating→epic-eval-due` 分支。**
- `adjudicating` 是**条件 LLM**：`auditDepthFor`（`src/engine/retreat.ts`）的
  risk-scaling 正是"把机械情形塌缩到 light（machine-mechanical）、只给高风险情形保留
  full（machine-agent）"的开关。

## 4. 队列语义：不加 phase、不删 phase，硬化 claim 轴

关键判断：**队列不是一个 phase，而是 `(phase, claim)` join 的派生视图。**

```
queue(P)      = { t | t.phase=P ∧ actor(P)∈{machine-agent, human} ∧ ¬activeClaim(t) }
processing(P) = { t | t.phase=P ∧ activeClaim(t) }
```

### 4.1 为什么不是独立 phase（否决"queued/processing 两 phase"）

这会把模型刻意合并的 `ready`/`in-progress` 拆回去（§task-lifecycle-model.md §3：
"排队 vs 在跑靠运行时 claim 区分，不是两个 phase"）。且"谁把 queued 推进 processing"
只能是 driver——**直接违反 §2 的 driver-never-writes-phase 不变量**。

### 4.2 为什么不是"处理时删 phase、完成再推回"（否决"claim-by-removal"）

这是经典耐久队列的 pop-with-visibility-timeout 模式，直觉正确但在本库里实现方式错。
原因在**真值归属**：在 SQS/Redis 里队列本身是唯一真值，item 无别的家；这里带 phase
的 task 文件才是耐久真值，有永久的家。"别让两个 driver 抢同一 task"这个可见性问题，
由 claim（带 stale-timeout）解决——**claim 就是 visibility lease 的等价物**。于是：

> **phase = item 属于哪个队列（永久）；claim = 可见性租约（临时、自动过期）。
> "pop" = 拿 claim，不移动 item；"崩溃后重现" = 租约过期，不重新插入 item。**

删 phase 会把"处理期间这 task 在哪"的真值搬到一个单独 pop-record，劈裂真值；CLI/TUI/
web 三渲染器全读 phase，删了 phase 的 task 无从渲染——"一个字段干五件事"的反模式换
马甲回来。选项 2（claim 派生）严格优于此：**phase 从不移动 → 崩溃恢复免费**（claim
消失，task 自动回到"排队"，无任何恢复性写入）。

### 4.3 藏在"删 phase"直觉里的真需求：claim 租约必须会过期

`flock`（exec-lock）在进程死亡时自动释放（好），但 `.active-agents`/`.caps` 是**文件**，
`kill -9` 后不自清——崩溃的处理者会把 task 永久卡在 processing。真正该做的：

> 给 claim 配 **stale-lease + reaper**：租约过期 → 自动判回排队（免费重排队）；若有
> 半成品 worktree → 续跑或 GC。

这正是 task-lifecycle-model.md §4 列为"删除 `status:` 前置"的 engine-native staleness
reaping。"持久存储以对付中断"的落点是**存 claim/in-flight 元数据**（worktree 路径、
分支、entry_phase、lease 到期时刻、puller 上下文标识），**不是存 phase 的副本**。

### 4.4 人类 phase 也是队列：统一模型

| phase 类别 | 谁 pull | pull 方式 | 是否队列 |
|---|---|---|---|
| `machine-agent` | driver 自动扫 | 自动（scan → dispatch 会话） | ✅ 队列 |
| `human` | 人 | 手动（人把 task assign 给自己 = 认领） | ✅ 队列 |
| `machine-mechanical` | 引擎 tick | tick 内瞬时 resolve（队列深度≈0） | 退化队列 |
| `none` | —— | awaiting-children 等事件 / done 终态 | ❌ 非队列（barrier/终态） |

> **每个 machine-agent 与 human phase 都是队列;队列 = 该 phase 下无 claim 的 task 集;
> "正在处理" = 同 phase + 有 claim。actor 决定谁有资格 pull（driver 自动 / 人手动 /
> 引擎 tick），claim 标记谁 pull 了。`none` 不是队列（barrier 或终态）。**

人类 phase 用同一套 claim 顺带得到互斥：谁 assign 给自己谁持 claim，两人不会同时上手
同一个 `needs-human`。

## 5. phase 迁移责任表（**现状快照**；终态见 §10.6 / §11）

> 本表记录**改动前的现状**，用于推导。终态 pipeline（`ready→implementing`、
> `decomposing` 折入、`evaluating` 折入 gate）见 §10.6，冻结决策见 §11。

出边落笔方永远不是 driver——要么 skill 交接触发的 engine primitive（`engine
complete`），要么 phase skill 自身（`adjudicate → task edit --phase`），要么人。

| phase | actor 细分 | 出边由谁落笔 | 机制 | 现状 |
|---|---|---|---|---|
| authoring/draft | machine-agent | draft skill | — | 未接线（E7/BACK-608） |
| authoring/refining | machine-agent | refine skill | — | 未接线；今天靠人 promote |
| authoring/backlog | human | 人 | `engine promote` | ✅ |
| execution/ready | machine-agent | `engine complete`（primitive-executor 干活+merge+DoD 后） | `completeTask` | ✅ |
| execution/decomposing | machine-agent | decompose handler | driver 注入 | ✅ |
| execution/awaiting-children | none | 子完成触发 | barrier | — |
| execution/evaluating | machine-**mechanical** | `engine evaluate` | `completeTask`/`evaluateEpic` | ✅（但仍误入 dispatch，应退出） |
| execution/adjudicating | machine-agent(full)/mechanical(light) | adjudicate skill 独立叶子 agent | `completeAdjudication` / `recordRetreat` | ✅ 机制在；fresh-context 仅靠纪律 |
| execution/needs-human | human | 人 | `task edit --phase` | ✅ |
| execution/done | none | 终态 | — | — |

## 6. 变更方向（不含 plan）

按"不增 phase、硬化 claim 轴"落成可执行方向，建议拆成两个可独立交付的 deliverable：

**A. 收敛机制层运行时补全**（BACK-682 直接 follow-up、BACK-660 前置）
1. **claim 升为一等 + 耐久 + 可回收**：把 execution 专用的 `.caps/<id>.wt`/`.signal`
   泛化成引擎原生 claim/in-flight 记录，覆盖全部 5 个 agent-phase；配 staleness reaper
   （租约过期 → 免费重排队 / 半成品续跑或 GC）。
2. **`entry_phase` 在每次入 pipeline 时写**：`engine promote` 今天只写
   `pipeline_id/phase`，不写 `entry_phase` → `assertSingleStepRetreat` 对任何真实 task
   必 throw，三分类回退契约（AC#4/#8）在真实任务上是死代码。属"入边义务"，与 claim
   记录同批落地。有测试断言 promote 后 `entry_phase` 非空且等于入边前的
   `${pipeline_id}/${phase}`。
3. **adjudicating-full 的 fresh-context 变成可检查属性**：adjudicating-full 的 puller
   上下文标识 ≠ 产出该 diff 的 ready-phase puller 标识；复用第 1 条的 puller 上下文
   字段，从"靠纪律"变成 claim-provenance 可断言。
4. **给 adjudicating 补 claim 保护**：今天落进 adjudicating 后无任何 exec-lock/claim
   （`driver.ts` 注释明说 worktree/exec-lock untouched）。多车道/前台 loop 下两个并发
   audit 能同时动手。adjudicating 应与 ready 同享 claim。

**B. actor 细化 + 调度成本正确性**
1. 把 actor 轴细化为 `machine-agent` / `machine-mechanical`（数据层或 phase 正交属性）。
2. `scan`/`hasPendingWork`/`dispatch` 一致地只为 `machine-agent` 掏 spawn 成本。
3. `machine-mechanical`（evaluating、adjudicating-light）由 Interpreter tick 内 resolve。
4. **机械 AC**：删掉 `dispatch.ts` 的 `evaluating→epic-eval-due` 分支（evaluating 不再
   dispatch，改由 tick 内 `evaluateEpic` 直接跑）。

## 7. 与既有裁决的一致性

- 不新增/删除任何 phase，不在处理时清空 phase → 保 §4 "phase 是唯一进度真值"。
- actor 仍折进 phase（`turn = actor(phase)` 恒成立）；只是把 `machine` 一分为二，不引入
  正交叉乘，非法组合仍不可表达。
- active/claim 仍是正交运行时轴，永不持久进 phase；本文只把它从散落的 `.caps`/
  `.active-agents`/append-notes 提升为引擎原生、带租约与 reaper 的一等记录。
- 与 driver-supervisor 多车道方向兼容：队列是 per-phase 派生视图，多车道靠多 puller +
  claim 纪律，不写死单车道。

## 8. 一句话总结

**核心机制变更只有一条：把 claim 从今天散落的 `.caps`/`.active-agents`/append-notes
提升为引擎原生、带租约与 reaper 的一等 in-flight 记录；phase 一个字段都不加、不删、不
在处理时清空。队列 = `(phase, claim)` 的派生；driver = 纯传输；只有 5 个 machine-agent
phase 值得 dispatch 一个 LLM 会话。**

## 9. phase 命名与 kind 绑定（§3 actor 细化的落地）

§3 把 `actor=machine` 细分为 `machine-agent` / `machine-mechanical`。本节把该细分落成
**registry 数据 + phase 命名**的具体变更。

### 9.1 组织原则：registry 条目的 kind 就是 actor 细分

`plugin/skills/phase-coverage.json` 今天一律 `"status":"skill"`，把"跑 shell gate"和
"实现整个 task"登记成同类——`execution/evaluating` 被登记为 `skill`（`epic-evaluate`），
但它本质是机械脚本。修法：**registry 升级为 phase→(kind, handler)，`kind` 携带 actor
细分**，`scan`/`dispatch`/`hasPendingWork` 只读 `kind` 即知是否掏 spawn 成本。

| actor 细分 | 绑定物 | 执行方式 | registry `kind` |
|---|---|---|---|
| machine-agent | **skill** | dispatch 一个 LLM 会话 | `skill` |
| machine-mechanical | **script** | 引擎 tick 内跑 | `script` |
| machine（gate 混合，见 §9.4） | script + skill | 机械优先，必要时升级 | `gate` |
| human | 无 | 人工 gate | `human` |
| none | 无 | 终态 / barrier | —（不登记） |

### 9.2 machine-agent phase：名字即行为，一 phase 一 skill

`ready` 是唯一不描述行为的 phase 名——它是被合并掉的 `ready/in-progress` 队列态残留。
但"排队 vs 在跑"已确立为 claim 轴（§4），故 `ready` 作为 phase 名冗余且误导：phase 应
命名"机器在这儿做什么"。统一为 -ing 动名词：

| pipeline | 现名 | 定案名 | skill | 状态 |
|---|---|---|---|---|
| execution | **`ready`** | **`implementing`** | primitive-executor（吸收 decompose，见 §10） | **改名**（承重） |
| execution | `decomposing` | —（折入 `implementing`，见 §10） | 不再是 phase-skill；由 implementing 的 skill 调用 | 折叠 |
| execution | `adjudicating` | `adjudicating` | adjudicate | 保留 |
| authoring | `draft` | **`drafting`** | authoring-draft | **改名**（定案） |
| authoring | `refining` | `refining` | authoring-refining | 保留 |
| exploration | `spike` | **`spiking`** | exploration-spike | **改名**（定案） |

改名后 `phase=implementing ∧ 无 claim` 天然就是"待实现队列"，不再需要独立的 `ready`
落脚态。skill 名不必与 phase 字面相同（`implementing ↔ primitive-executor` 已够清楚），
要求只是"每个 machine-agent phase 恰有一个编码其方法论的 skill"——现状已满足。

### 9.3 machine-mechanical phase：降为 script，退出 dispatch

`evaluating` 是纯机械（`engine evaluate` / `evaluateEpic`：跑 IA shell 命令 + 聚合子
task 终态）。变更：

- registry `execution/evaluating` 从 `kind:skill`（`epic-evaluate`）改为 `kind:script`
  （`engine evaluate`）。
- 删掉 `dispatch.ts` 的 `evaluating→epic-eval-due` 分支（机械 AC）。
- `epic-evaluate` skill 退役（它本无方法论，是薄封装），回落为引擎 tick 内直接调用。

### 9.4 单个 adjudicating phase：不拆，做成"gate 优先、必要时升级"的混合

adjudicating **保持一个 phase**，不拆成 `-light`/`-full` 两个；风险分级留在 phase
内部（`auditDepthFor`）。它是唯一同时绑定 script 与 skill 的 phase（`kind:gate`）：

```
adjudicating（kind: gate）
  ├─ 先跑机械 gate-script（tick 内）:DoD 全绿? AC 全勾? 无越界 diff? auditDepthFor?
  │    ├─ light（全绿 + 低风险）→ 直接落 done              ← 机械,不派会话
  │    └─ full（高风险/有 IA/engine 触及）→ 升级 ──┐
  └─ 升级 → dispatch adjudicate skill（fresh-context 会话）→ done/needs-human/retreat
```

一举满足：单 phase（结构不膨胀）+ machine-mechanical 有 script（gate-script）+
machine-agent 有 skill（adjudicate）+ 修掉 light 情形的 spawn 浪费。

### 9.5 evaluating 折进 adjudicating 的 gate（**已定**）

adjudicating 既已有机械 gate-script，`evaluating`（epic 的 IA + 子聚合）又是紧邻在前
的机械步，**合并**：gate-script 统一跑所有确定性检查（DoD + IA + 子终态聚合 + scope），
全绿且低风险→done，全绿高风险→升级判断，红→needs-human/retreat。epic 路径

```
awaiting-children → evaluating → adjudicating → done
      ↓（折叠后）
awaiting-children → adjudicating(gate: IA+聚合+判断) → done
```

**少一个 phase**。代价：gate-script 同时承载 epic 聚合与 per-task 判断两套失败语义，但
gate 本就产出统一 verdict，承载得住。

> **决策（§11 冻结）**：evaluating 折进 gate 已采纳为定案（非可选）。`evaluating` 作为
> 独立 phase 退役，其 IA+子聚合机械逻辑并入 adjudicating 的 gate-script。

### 9.6 变更后的 pipeline 形态（**已被 §10.6 取代**）

> ⚠️ 本小节的 pipeline 图是 §9 单独看时的中间态（epic 仍走独立 `decomposing`）。§10
> 统一 implementing 后，**权威 pipeline 形态见 §10.6**，冻结形态见 §11。此图保留仅为
> 推导轨迹，不作数。

### 9.7 迁移成本（如实标）

- **`ready → implementing` 是 breaking pipeline 变更**：backfill 现有 task 的 `phase`；
  引用点含 `pipeline.ts`、`dispatch.ts`（`renderBasicReadyDispatch`）、
  `handle-basic-ready.sh`、`run.ts` 及大量测试。属"承重改名"（类比 BACK-683 包名改名），
  一次性 sweep + lint 挡回流。
- **`epic-evaluate` 退役 + 删 `evaluating→epic-eval-due`**：勿破坏 BACK-628.4 epic 评估
  测试套件（迁移到 tick 内直接调用的断言）。
- **`gate` kind 引入**：`dispatch.ts` 与 driver 的 adjudicating 分支要"先跑 script，按
  `auditDepthFor` 决定是否升级 dispatch"——升级出去的会话标识须 ≠ implementing 的会话
  标识，这正是 §6-A 的 claim 记录 + puller 上下文标识落地后顺带能表达的 fresh-context
  约束。

## 10. 统一 implementing：分解是它的一个分支（decompose 决策从 promote 挪到 implementing）

§9.6 的 pipeline 形态里 epic 仍在 promote 时静态分叉到 `decomposing`。本节把该分叉
**取消**，统一入口为 `implementing`，分解退化为 implementing 内部的一个分支。本节的
pipeline 形态**取代 §9.6**。

### 10.1 概念转变：静态 promote 分叉 → 动态 implementing 判断

现状：`engine promote`（`cli.ts:4560-4565`）在 promote 时读 `kind:epic` label 静态分叉
（`isEpic ? "decomposing" : "ready"`）。但"该不该拆"是 CLAUDE.md 的两段式 decompose
test（≥2 个独立可交付物 + 规模 ≥1.8-2× ceiling）——**要钻进 task 才做得出的判断，非
promote 时拍 label 能定**。CLAUDE.md 自身即写："start as Basic … only convert to an
Epic mid-implementation if the actual scope demonstrably overruns"。

这正是 fixpoint-convergence `assessAndDecompose` 的形状：driveTask 第一步是"评估 → 仅在
必要时 decompose"，decompose 不是前置。故统一后 **implementing phase 的行为 =
driveTask 入口**：drafting/refining/人类只能通过 `kind:epic` 等**建议**（hint），
implementing 是**权威决策点**。也更忠于 ADR-011 D-1 递归 Task 本体——"实现一个 task" =
要么直接写代码（叶子），要么拆子再装配（compound），是同一活动的不同粒度。

### 10.2 硬约束：barrier 无法消除，只能命名或编码

epic 必须等所有子终态，而"等"既不能占活会话、也不能占 driver → 这是一个 `actor=none`
状态。claim/队列模型处理"等 puller 来拉"，**处理不了"等事件（子全终态）"**。故 barrier
天生 `actor=none`，只能选择**命名它**（`awaiting-children` phase）或**编码它**
（implementing + "子未完"scan 谓词）。这是评估实现模式的标尺。

### 10.3 三种实现模式与裁决

- **模式 A**（implementing 入口，decomposing+awaiting-children 仍是 phase，汇入
  adjudicating）：改动最小、barrier 干净、scan 谓词不变。
- **模式 B**（decomposing+awaiting-children 做成独立 pipeline）：需跨 pipeline
  round-trip + provenance；独立 pipeline 应留给真正不同的生命周期，不为一个子步造整条
  道。**否决**（除非未来 decomposition 要被多 pipeline 复用）。
- **模式 C**（完全内联进 implementing）：撞 barrier——(c1) 会话阻塞等子=长命会话死攥
  claim，违背 barrier 释放 driver 的初衷；(c2) implementing 可重入 + "子未完不重拉"scan
  谓词，把 barrier 语义塞进谓词、弄脏 actor 模型。

**裁决：A/C 混合。** `decomposing`（建子 task）是 agent 活，implementing 的 handler 直接
做，**不需独立 phase → 折入 implementing**；`awaiting-children` 是绕不过的 barrier，
**保留为 `actor=none` phase**。

### 10.4 分支末尾汇入 adjudicating，不流回 implementing

依据不变量：**只有叶子携带代码；epic 的"实现" = 其子被装配完成。**

- 装配若需代码 → 那是**集成型子 task**（decompose 时建出），非 epic 自身活 → 无需回
  implementing。
- 流回 implementing 会触发循环（子已存在 ⇒ roleOf=compound ⇒ 又进 compound 分支）。
- 叶子路径与 compound 路径**在 adjudicating 汇合**，对称。

**"流回"能力经 guarded retreat 承载，而非前向边**：adjudicating 判断装配后的 epic，若
发现**分解层缺口**（子拆错/漏 deliverable），分类 `decomposition`，单步回退到
`entry_phase`(=implementing) → implementing 重跑评估、补建缺子 → 再 awaiting-children。
`recordRetreat` 的守卫（单步、gap 指纹去重）既给了"重新分解"能力，又挡住 ready⇄refining
震荡。

### 10.5 连带影响

1. **`kind:epic` 从 gate 降为 hint**：`engine promote` 删除 epic 分叉，恒落
   `implementing`；`roleOf` 的 `kind:epic` 分支不再被 promote 读，改由 implementing 的
   decompose test 作先验参考（可被推翻）。
2. **crash 幂等搬家**：现 `makeDecomposer` 靠"board 上是否已有 `parent_id===epic.id` 的
   子"判重入（`decomposer.ts:262-268`），这段搬进 implementing 的 compound 分支——与
   §6-A"decompose 幂等应与统一 claim 记录合流"对齐。
3. **scan 谓词不变**：保留 awaiting-children 作 `actor=none`，implementing 的 scan 谓词
   仍是最简 `machine-agent ∧ 无 claim`。
4. **entry_phase**：epic 的 entry_phase 在 promote 时写（=`authoring/backlog`），
   decomposition-layer 回退落到 implementing，语义正确。

### 10.6 变更后 execution pipeline（取代 §9.6）

```
implementing(agent) ──┬─ 叶子 ───────────────────────────┐
                      └─ compound: 建子 ─▶ awaiting-children(none) ─┘
                                                                     ▼
                                                   adjudicating(gate) ─▶ done(none)
                                                          └──▶ needs-human / retreat→entry_phase(implementing)

authoring    drafting(agent) ──▶ refining(agent) ──▶ backlog(human)
exploration  spiking(agent) ──▶ done(none)
```

execution phase 数：`implementing / awaiting-children / adjudicating / needs-human /
done` = **5**（从 7 降下：`ready` 改名 `implementing`、`decomposing` 折入、`evaluating`
折入 adjudicating gate）。**没有新增 phase，统一了入口。递归 Task 的故事字面成立：
implementing 是唯一的"把这个 task 做完"phase，分解只是它选择委派给子 task。**

### 10.7 迁移成本增量（叠加 §9.7）

- **`engine promote` 去分叉**：删除 `isEpic ? decomposing : ready` 逻辑，恒落
  implementing；迁移 promote 相关测试（epic 不再直接落 decomposing）。
- **`decomposing` phase 退役**：`makeDecomposer` 的建子 + 幂等逻辑迁入 implementing 的
  compound 分支；`decomposing→epic-ready` dispatch 分支迁移/删除；`decomposing` 从
  pipeline.ts、phase-coverage.json、backfill 表移除；backfill 现有 `decomposing` 态的
  task 到 `implementing`。
- **`epic-decompose` skill 去向（已定）**：**不再是 phase 对应的 skill**（phase-coverage
  里删除 `execution/decomposing` 条目），而是**由 implementing 对应的 skill 调用**。即
  `implementing` 的执行 skill（primitive-executor）跑 decompose test，判定 compound 时
  **invoke `epic-decompose` 作为一个子能力**产出子 task 提议，再由引擎创建子 task +
  推进到 `awaiting-children`。`epic-decompose` 的方法论保留（仍是一个 skill 文件），只是
  它的调用者从"引擎按 phase dispatch"变成"implementing 的 skill 内部调用"——不占独立
  phase、不进 phase→skill registry。

## 11. 决策与冻结（收敛出口）

本节把全文收敛成"冻结的 spine + 定案的叉 + 可裂解的交付物 + 可运行的验收 meter"。
本节之后本 proposal 视为收敛，可升格为一个 Epic + 3 个 child 走 authoring。

### 11.1 冻结的 spine（后续 plan 不得推翻）

1. **driver = 纯传输**：phase 迁移永远由该 phase 的 actor 落笔，driver 从不写 phase（§2）。
2. **两模式同一循环**：fixpoint-convergence（前台）与 monitor（后台）是同一 tick 循环的
   两套 invoke/claim 实现；替换 driver 不改变任何一次 phase 迁移的落笔方（§2.2）。
3. **队列 = `(phase, claim)` 派生**：不加/删 phase 表达队列，不在处理时清空 phase；崩溃
   恢复靠 claim 租约过期自动重排队（§4）。
4. **actor 四分类 + kind 绑定**：`machine-agent↔skill` / `machine-mechanical↔script` /
   `gate↔script+skill` / `human` / `none`；registry 条目的 `kind` 携带该分类（§9.1）。
5. **claim 升为一等**：引擎原生、带租约 + reaper 的 in-flight 记录，覆盖全部 agent-phase；
   存 claim 元数据（worktree/branch/entry_phase/lease/puller 标识），不存 phase 副本（§4.3/§6）。
6. **统一 implementing**：promote 恒落 implementing；decompose 是 implementing 内部分支
   （agent 判定 compound → invoke epic-decompose 子能力建子 → awaiting-children）；分支
   汇入 adjudicating，"流回"只经 guarded retreat→entry_phase（§10）。

### 11.2 定案的叉（本轮决策）

| 叉 | 决策 |
|---|---|
| evaluating 是否折进 gate | **折**。evaluating 作为独立 phase 退役，IA+子聚合并入 adjudicating gate-script（§9.5） |
| `draft→drafting`、`spike→spiking` | **改名**（与 `ready→implementing` 同批一次到位，§9.2） |
| `epic-decompose` skill 去向 | **不作 phase-skill**，由 implementing 的 skill 调用；phase-coverage 删 `execution/decomposing` 条目（§10.7） |
| proposal 升格形态 | **一个 Epic + 3 个 child（A/B/C）** 走 authoring（§11.3） |

### 11.3 交付物裂解（Epic + 3 child）与依赖序

| child | 交付物 | 关键内容 | 依赖 |
|---|---|---|---|
| **A** | claim/in-flight 硬化 | 引擎原生 claim 记录（覆盖全 agent-phase）+ staleness reaper + **A1: `entry_phase` 在 promote 写** + adjudicating claim 保护 + puller 上下文标识 | A1 无依赖（最先） |
| **B** | actor 细化 + kind 绑定 | registry 加 `kind`（skill/script/gate）+ `evaluating` 降 script 并退出 dispatch + `adjudicating` 变 gate（script 快路径 + skill 升级） | gate 的 fresh-context 用 A 的 puller 标识 |
| **C** | 统一 implementing | `ready→implementing` 承重改名 + `decomposing` 折入 implementing（epic-decompose 变子能力）+ promote 去分叉 + `kind:epic` 降 hint + `drafting`/`spiking` 改名 | retreat→implementing 用 A1 的 entry_phase |

**落地顺序**：`A1 → (A2 ∥ B) → C`。A1 极小且立刻让 BACK-682 的死 retreat 边活过来、又是
BACK-660 前置，作第一刀。B 与 C 都重写 `pipeline.ts`/`dispatch.ts`/`phase-coverage.json`，
有物理耦合——refining 时决定"B 先落 C 再叠"还是合并（合并恐超 ~2000 行 ceiling，倾向拆）。

### 11.4 可运行的验收 meter（每条机械可检，ADR-019）

- **A1**：`bun test` 覆盖"promote 后 `task.entry_phase` 非空且 == 入边前 `${pipeline_id}/${phase}`"；
  且"真实 task 从 adjudicating 单步 retreat 到 entry_phase 成功"（BACK-682 现为死代码）。
- **A2**：注入 stale claim → reaper 使其自动重排队的测试；`grep` 确认 `.caps`/`.active-agents`
  读写集中到单一 claim 模块。
- **B**：`grep` 确认 `dispatch.ts` 无 `evaluating→epic-eval-due` 分支；registry 每条有
  `kind`；adjudicating light 路径不 spawn 会话的测试。
- **C**：`grep -r "\"ready\"\|\"decomposing\"" src/engine/pipeline.ts` 为空；promote 恒落
  `implementing` 的测试；**自举 meter**：引擎用新 implementing 驱动一个真实 epic（内部
  判 compound → 建子 → awaiting-children → 汇 adjudicating → done）到底。

### 11.5 自举安全序约束（叠加 size 切分）

每一步 merge 后引擎必须仍能驱动自己（Stage-2 fixpoint）：

- `decomposing` 不能在有 in-flight epic 用它时删——过渡期引擎同时认新旧、或先排空、或
  stop-the-world backfill。
- `ready→implementing` 的 backfill 与引擎读取路径同批切，杜绝"board 是 ready、代码只认
  implementing"的空窗。
- C（去 promote 分叉）用**旧机制**实现、落地后**新机制**才自洽——C 的 Acceptance 必须挂
  §11.4 的自举 meter。

### 11.6 收敛后的下一步

本 proposal 收敛。下一步：走 authoring 建 **Epic「pipeline 驱动机制与队列语义」+ 3 child
（A/B/C）**（先落 authoring/draft，不 promote），由 refining 把每 child 的 Phase/DoD/
Acceptance Gate 钉死（含 §11.4 的 meter 与 §11.5 的自举序）。BACK-660（monitor）依赖
child A；BACK-682 的死 retreat 由 child A1 修复。
