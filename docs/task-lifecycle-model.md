---
title: "任务生命周期模型（canonical 参考）"
status: Reference
date: 2026-07-06
supersedes-display-of:
  - "扁平 status 词汇（Basic:/Epic: × Proposal/Plan/…）"
crystallizes:
  - "docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md（D-1 单一递归 Task · D-2 pipeline-as-data · D-3 加法领域 · D-5 field-registry）"
  - "docs/proposals/2026-07-04-multi-lane-issue-list.md（§2.2 三平面 · §2.3 四轴 · §6 R1/R3/R4 裁决）"
  - "docs/proposals/2026-06-29-authoring-as-pipeline.md"
  - "docs/uml/workitem-lifecycle-state.puml"
implemented-in:
  - "src/engine/pipeline.ts（三条 pipeline + PipelineState.actor）"
  - "src/types/index.ts（Task：per-task 只存 pipeline_id + phase；roleOf 派生）"
  - "src/core/field-registry.ts（label/displayStatus 投影；titleCasePhase）"
  - "src/core/backlog.ts（Core.updateTask：phase→status 单向同步）"
---

# 任务生命周期模型（canonical 参考）

> 这是 epicd 任务生命周期的**唯一权威参考**。它不引入新决策，只把已散落在 ADR-011 /
> 2026-07-04 proposal / UML / 代码里的既定模型汇成一页。CLI、TUI、Web 三个界面都应
> 指向本文档，且都只是本模型的**渲染器**，不得各自发明状态词汇。
>
> 与 ADR-011 的关系：ADR-011 D-1 的 schema 草案里写的是 `state` 字段与 E0 版
> `backlog→ready→in-progress→done` execution pipeline；那是 MVD 版本，已被
> 2026-07-04 proposal §2.3 **取代**为下面的"存 `phase`、删 `state`、合并
> ready/in-progress、status 派生"终版。本文档描述的是**当前已落码的模型**。

## 1. 一句话模型

**一个递归 `Task`（Epic = 有子节点的 Task）+ 若干条各含小状态集的 pipeline（状态 =
phase）+ 三个派生维度（role 由树位置、actor 由 `pipelineDef[phase].actor` 查表、
active 由运行时 claim）。per-task 只持久化 `(pipeline_id, phase)` 两个结构量,其余全部
投影/派生。**

## 2. 四轴 + role：五个维度，各管一件事

生命周期位置是多维的。把它们分开，是消除"一个 status 串做五件事"混乱的关键。

| 维度 | 问题 | 载体 | 存 / 派生 |
|---|---|---|---|
| **lane（pipeline）** | 属于哪条生命周期？ | `pipeline_id` 字段 | **存** |
| **phase** | 进度走到哪？ | pipeline 的一个 state（裸名，如 `ready`/`needs-human`/`done`）| **存**（唯一进度真值）|
| **role** | 是否可再分解？ | 树位置：有子节点⇒`compound`，叶子⇒`primitive`（未分解 epic 由 `kind:epic` 派生 compound）；**渲染为独立 has-children 指示器，不进 status 串** | 派生（`roleOf`）|
| **actor / turn** | 按规则此刻**该谁**动？ | `pipelineDef[phase].actor ∈ {machine, human, none}` | 派生（查表）|
| **active / claim** | 此刻**谁真的在**驱动？ | Coordinator 运行时 claim | 运行时，**永不持久** |

关键设计判断（已裁决，保留）：

- **actor 折进 phase，而非做成正交叉乘。** `needs-human` 不是"某 phase + turn=human"，
  它**本身就是一个 `actor=human` 的 phase`**。这样 `turn = actor(phase)` 恒成立，且
  非法组合（如 `done × human`、`backlog × machine`）根本无法表达。代价是"进度相近但
  该谁动不同"的点会分裂成两个 phase（如 `evaluating`(machine) 与 `needs-human`(human)），
  这是刻意用 phase 数量换取"无非法组合"的安全性。
- **active 是正交运行时事实，永不折进持久状态。** "谁在实际跑"走独立只读契约
  `Coordinator.claims()`，前端 `tasks ⟗ claims` 做 join。推论：`phase=ready ∧ 无
  claim` = stale 孤儿。
- **role 由树位置派生**（`roleOf`：有 children ⇒ compound，叶子 ⇒ primitive）；**未
  分解的 epic（尚无 children）由 `kind:epic` label 派生 compound**。L3 删除 `role:` 持久
  字段后，`kind:epic` label 是 pre-decompose 声明 compound 的**唯一**durable 途径——故
  `roleOf` 必须认 `kind:epic`（BACK-643 因此从「cosmetic 修正」升为 L3 的**承重**前置）。

## 3. 三条 pipeline（当前已落码，`src/engine/pipeline.ts`）

每个 phase 标注 actor。机器 scanner 只捡 `actor=machine ∧ 无有效 claim` 的 phase；
`actor=human` 是人类 gate；`actor=none` 是终态/等待。

```
authoring   draft(machine) ──▶ refining(machine) ──▶ backlog(human)
                                                          ║ engine promote（人类 gate 边界）
                                                          ▼
execution   ready(machine) ──▶ [decomposing(machine) ──▶ awaiting-children(none) ──▶ evaluating(machine)]  ──▶ done(none)
              │                 └─ 仅 compound（Epic）走这段；primitive：ready ──▶ evaluating ─┘
              └──▶ needs-human(human) ──▶ ready | done

exploration spike(machine) ──▶ done(none)     // 侧track：未 authoring 的 spike；promote 时经 provenance.spawned_from 派生一个 execution task
```

- **一个 Task 生于 authoring**，在 `backlog` 处被人类 gate，`engine promote` 推入
  execution，机器驱动至 `done`，除非撞上 `needs-human` gate。
- `ready` 合并了旧的 `in-progress`：排队 vs 在跑靠运行时 claim 区分，不是两个 phase。
- exploration 与 execution 靠 `provenance.spawned_from`（跨 pipeline 派生边，区别于
  `parent_id` 的 containment）连接。

## 4. status / role 是投影，不落盘（L3，无妥协）

**目标态（L3）**：唯一真值 = `(pipeline_id, phase)`。`status` 与 `role` **不持久化到
task 文件**，只在渲染边界由纯函数实时算；**没有任何独立编辑面**（无 `task edit -s`、
无 `task create -s`、web status 为只读派生 badge）；运行时「谁在动」是**独立 claim 轴**
（`Coordinator.claims`），永不借道 status——`In Progress` 从数据模型消失。一条 CI lint
**挡死回流**：任何 task 文件含 `status:`/`role:`、或任何代码写它们即构建失败。

> **本文档定的是 L3，不是 L1「兼容缓存」。** 早先「phase 迁移时把 status 回写进
> frontmatter 供外部 raw-`status:` 消费者使用」的 compat-cache 立场**已作废**——那只是
> 迁移途中的临时态。删除 `status:` 的唯一前置是：**epicd 自建原生运行时（monitor 前台
> loop + Coordinator claim + engine-native staleness reaping，全读 `phase`+claim、不读
> status）替代掉 baime 的 `scan-loop.js` reaper**。**不改 baime**——epicd 自足后由人外部
> 卸载 baime（对 baime 零依赖 = M1 自举方向，ADR-011 D-7-bis）。迁移序列见承载此目标的
> epic。

人看到的 status 串**只是 phase**（title-case），是纯投影、**无 role 前缀**（不再有
`Basic:`/`Epic:` 字样），只存在于渲染边界：

```
status_display = titleCasePhase(phase)   // "Ready" / "Needs Human" / "Done"
```

- 真值是 `(pipeline_id, phase)`；引擎读 `phase` 一个 key 查 pipeline-data 拿 actor，
  **从不解读串里的英文字**。
- 旧 UI 的 `To Do/In Progress/Done`、旧扁平 `Basic: Ready` 都只是被取代的投影词汇，
  **禁止反喂引擎逻辑**（三平面原则 R3）。
- **role 是独立的显示轴，不进 status 串**：一个 task 是否 compound（有无子 task）由
  **独立的 has-children 指示器**呈现（web：父/子数 chip 或展开三角；CLI：`task list`
  行标记），**永不**拼进 status 词里。`role = roleOf(tree)`（有子节点⇒compound，否则
  primitive；未分解的 epic 由 `kind:epic` label 派生 compound），派生、不落盘、无编辑面。
- **过渡期（L1，将被 L3 取代）**：当前实现仍在 phase 迁移时把派生 status 回写 frontmatter、
  且 `role`/`status` 仍在文件里——这是迁移**途中**态，不是目标。终态是删除这两个字段、
  移除全部写入路径与编辑 UI、并由 lint 挡死。`In Progress` 当前经 status 承载 claim，
  终态必须移到独立 claim 轴。

### 4.1 旧扁平 status 词汇与本模型的映射

下列旧 status 值**不是**任何 pipeline 声明的 phase，属于被取代的扁平词汇。数据回归
本模型时按此映射（`Proposal→draft`、`Plan→refining` 为**工作假设**，待跟进任务的
proposal 阶段最终批准）：

| 旧 status | 归宿 | 说明 |
|---|---|---|
| `Proposal` | authoring `draft` | **工作假设**（born in authoring）|
| `Plan` | authoring `refining` | **工作假设** |
| `Backlog` | authoring `backlog` | 直接对应 |
| `Ready` / `Decomposing` / `Awaiting Children` / `Evaluating` / `Needs Human` / `Done` | execution 同名 phase | 直接对应 |
| `Draft` / `Refining` | authoring 同名 phase | 直接对应 |
| `In Progress`（旧 Basic 专有）| **不是 phase** → active/claim 层 | 机器持 `ready` 的活跃 claim；渲染为 🤖 |
| `To Do`（legacy 三态）| authoring `draft` | 迁移遗留 |

## 5. 三平面原则：界面是渲染器，不是词汇源

| 平面 | canonical | 代码锚点 | 约束源 |
|---|---|---|---|
| **核心状态机** | domain state machine | `Pipeline`/`PipelineState` + Interpreter（纯数据 + 纯函数）| ADR-010/011/012 |
| **执行 / 驱动** | monitor + scan-loop + claim + worktree/lock | 运行时协调面（`Coordinator`）| 外界：Claude Code session、spawn 成本 |
| **人类展示** | 多车道 issue-list 等界面 | CLI / TUI / Web 渲染层 | 人的注意力 |

**总原则：状态机是唯一权威词汇；另两平面从它投影，永不反向定义它。**

三个界面对本模型的正确姿态（都是 §2 五维度的渲染器）：

- **CLI**：`task list` 按 `pipeline → phase` 分组，每行标 actor 指示 + has-children 标记
  （compound 的独立呈现，不进 status）；`task create` 默认落 `authoring/draft`（不是旧默认
  `Basic: Proposal`），暴露 `--pipeline/--phase` 且校验 phase 合法性（`task edit` 已有这两个
  选项）；**L3 下删除 `-s/--status` 独立编辑面**。drift-lint（status 有值但 pipeline_id/phase
  空、或 phase 不属其 pipeline）归此层。
- **TUI / Kanban**：列 = 某 pipeline 的 phases，一条 pipeline 一条泳道，同一套 actor
  指示。列**不得**是旧扁平 status 词汇。
- **Web**：Pipeline 泳道视图即正确形态。status badge **文本 = phase**（title-case，无
  `Basic:`/`Epic:` 前缀），只读派生、不是可独立编辑的字段（无 status 下拉）；一个 task
  是否 compound（有无子 task）由**独立 has-children 指示器**（父/子数 chip 或展开三角）
  呈现，不进 status。驱动者指示由 `actor(phase) ⟗ claim` join 得出（👤 待你 gate / 🤖
  Claude Code 正在跑 / ⚠️ stale 孤儿 / ⏳ 排队 / ✓ 终态）。

## 6. phase → 执行 skill 映射（手动驱动参考）

每个 **machine-actor** phase 都有一个「执行 skill」——一个 Claude Code 会话在该 phase
被 invoke 它来把这个 phase 的活干出来。**手动驱动**时：看一个任务的 `(pipeline_id,
phase)`，按下表 invoke 对应 skill；skill 做完该 phase 的工作并推进 phase；对下一个 phase
重复。`human`/`none` phase 没有 skill（人工 gate / 终态）。

一个 skill 的价值来自它**编码的方法论是否有效**，而有效性来自 methodology-bootstrapping
实验，不来自它能过结构 lint。故每个 skill 按其 phase 背后方法论的状态用正确路径建成：
**extract**（已收敛方法论 → knowledge-extractor 打包）/ **mechanical**（无方法论的薄 CLI
封装）/ **experiment**（无已验证方法论 → 先跑实验收敛再提取）。详见 BACK-657。

| pipeline / phase | actor | 执行 skill | 创建路径 / provenance | 承载 |
|---|---|---|---|---|
| execution / ready | machine | `primitive-executor`（LFDD） | **extract** ← LFDD 实验 | BACK-657 child 2 |
| execution / decomposing | machine | `decompose` | **extract** ← ADR-018 + epic-to-backlog | BACK-657 child 3 |
| execution / evaluating | machine | `evaluate` | **mechanical**（包 `engine evaluate`，无方法论） | BACK-657 child 3 |
| authoring / draft | machine | `draft` | **extract/reference** ← feature-to-backlog | BACK-657 child 4（运行时接线待 E7/BACK-608） |
| authoring / refining | machine | `refine` | **extract/reference** ← feature/epic-to-backlog | BACK-657 child 4（同上） |
| exploration / spike | machine | `spike` | **experiment** ← 待 BACK-658 收敛后 extract | experiment-pending（BACK-658） |
| execution / needs-human、authoring / backlog | human | 无（人工 gate） | — | — |
| execution / done、awaiting-children、exploration / done | none | 无（终态/等待） | — | — |

- **单一真值**：上表是给人看的手动驱动参考；机器侧的 `(pipeline_id, phase) → skill`
  registry 折入 BACK-657 child 1 的 phase→skill 覆盖 manifest（同一份），后续 monitor
  自动驱动（见 DRAFT-16）消费同一 registry 做运行时注入——人手动和机器自动查的是同一张表。
- **里程碑边界**：到「手动用 skill 驱动执行」为止**不需要 monitor**——skills（BACK-657）
  + 4 轴数据/CLI/web（BACK-655 + 已有）+ 本表就够。monitor（DRAFT-16）只是把手动那步自动化。

## 7. Draft 实体弃用声明

旧 `backlog/drafts/*.md` / `DRAFT-N` id 空间（独立 Draft 实体）已于 BACK-663 **正式弃用并移除**。

- **替代方案**：`pipeline_id=authoring, phase=draft`（即 `task create` 的默认值）。
- **数据迁移**：所有存量 drafts 已批量迁移为 `backlog/tasks/` 下带 `authoring/draft` 的普通 Task。
- **CLI**：`backlog draft` 命令组已删除；请改用 `backlog task create`（不加参数即落 authoring/draft）。
- **Web**：Drafts 侧边栏入口已删除；authoring pipeline 泳道即查草稿的正确入口。

> **设计理由**：Draft 与 authoring/draft-phase Task 在语义上完全相同——都是"尚未通过 gate
> 进入正式执行的想法"。旧 Draft 实体的历史原因（早于四轴模型）已不存在，保留两套表示只带来
> 可见性缺口（drafts 在 Web All Tasks 视图中不可见）和不必要的 API 表面。

## 8. 术语速查

- **Task**：唯一递归实体。**Epic** = 有子节点的 Task（compound 的展示名）；primitive =
  裸 Task。二者不是独立类型。
- **Phase** = 执行 pipeline 的一个 state：引擎可观测、持久、可恢复的 checkpoint。
- **Stage** = phase-handler 内部的子步：易逝、重试重跑、引擎不跟踪（口语称 "step"）。
  已移出正式模型。
- **actor(phase)** = 按规则该谁动（machine/human/none），查 pipeline-data 得，派生。
- **claim / active** = 谁此刻在实际驱动，运行时事实，永不持久。
