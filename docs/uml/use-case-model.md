# epicd — RUP 用例模型（实现优先 + 术语漂移标注）

> 图：[`use-case-model.puml`](use-case-model.puml) →
> [View 1 交互面](epicd-uc-interactive.png) · [View 2 生命周期/车道](epicd-uc-lifecycle.png)
> 渲染：`PLANTUML_LIMIT_SIZE=16384 plantuml -tpng docs/uml/use-case-model.puml`
>
> **RUP 行为图（用户可见行为）**：
> [State](workitem-lifecycle-state.puml) · [Activity](issue-list-activity.puml) · [Sequence×3](issue-list-sequence.puml)。
> 多车道 issue-list 模型见 proposal [`2026-07-04-multi-lane-issue-list.md`](../proposals/2026-07-04-multi-lane-issue-list.md)。
> **内部架构骨架（class 图输入）**：[`architecture-class-skeleton.puml`](architecture-class-skeleton.puml) —
> 三平面（核心状态机 / 执行-驱动 / 展示）+ 两只读契约（IssueSource · Coordinator）+ RefineStrategy 注册表。
> 完整 class diagram / 内部实现设计仍待后续细化。

**方法**：典型 RUP 用例建模，**canonical 名以现有代码为准**（implementation-first）；文档/原型别名见漂移表。
状态：`impl`=已落地接线；`planned`=ADR/proposal 有设计但代码仅测试态或缺失；`deprecated`=弱化（代码保留但从导航隐藏/待退役）；`baime`=当前只存在于 loop-backlog/loop-draft 原型。

## 本轮决策（2026-07-03/04）

1. **lane 只指 pipeline**：取消把 "lane" 用作类型轴。类型轴一律用 **`role`**（compound=Epic / primitive=Basic，由树位置派生，ADR-011 D-1.1）。baime 的 `kind:basic/kind:epic`"ADR-005 lane label" = 这个 role 轴，改名归并。
2. **feature/task 保留 label 但改名**：`kind` 仍是 authoring 内的路由标签；把 baime `kind:task` 改名为 **`kind:chore`**（避免与实体 `Task` 冲突）。*名字暂定，备选 inquiry/study。* `kind:feature`（编码，Proposal+Plan+测试）不变。
3. **draft 退役目录式、采状态式**：退役 Backlog.md 的 `drafts/` 目录 draft；draft 成为 authoring pipeline 的一个 **state**（`Basic/Epic: Draft→Refining`，loop-draft 式）。
4. **Kanban/milestone 弱化**：标 `deprecated`、导航隐藏、代码保留；**多车道 issue-list 升为主视图**。milestone 与 Epic(compound) 语义重叠故退役。
5. **多车道 issue-list = 核心用例**：以现有 All Tasks 页（`TaskList.tsx`）为基座，加泳道（按 `pipeline_id`，数据驱动）+ 每行**驱动者指示**（👤 待你 gate / 🤖 正被 monitor 驱动的 Claude Code 处理）+ 内联 gate-review（gate-inbox 融入本页）。
6. **四轴分解**（proposal §2.3）：把今天单一 `state` 拆成 **lane**(`pipeline_id`) · **phase**(`state` 纯进度) · **turn**(新字段 `waiting_on∈{machine,human,none}`) · **claim**(Coordinator 运行时)。`needs-human` 不再是 state（= `waiting_on=human`）；`ready`/`in-progress` 合并（claim 区分排队 vs 在跑，stale=claim 超时）。monitor pick-up = `phase 可动作 ∧ waiting_on=machine ∧ 无有效 claim`。

## 实现现状速览

| 层 | 现状 |
|---|---|
| Human 面（CLI/Web/TUI） | ✅ impl。**无 auth**、**无 gate-inbox**。Kanban/milestone/folder-draft → deprecated。 |
| AI Agent 面（MCP） | ✅ impl，CLI **子集**（无 draft/decision/sequence/demote 工具）；`milestone_*` 概念 deprecated。 |
| 引擎 interpreter | ⚠️ `Interpreter.scan/dispatch` 存在但**仅测试接线**。 |
| driver/supervisor/complete/safety | ❌ 缺失；自驱环今天由 **baime Monitor + `scan-loop.js`** 跑。 |
| authoring 车道 / draft-refine | ❌ planned；config.yml 已加 `Draft/Refining` 状态（状态式 draft 的落点）。 |

## Actors（canonical → 别名）

| Canonical (code-first) | 别名（标出处） | 职责 |
|---|---|---|
| **Human (gate owner)** | 人 · human · 人类 · gate owner · Deciders(Yale Huang) | 边界处 capture + promote gate + gate-review。三面接入 CLI/Web/TUI。 |
| **AI Agent** | MCP client · worker · implementer Agent · **Handler**(代码座) · decomposer(规划变体) | 经 MCP 操作 backlog；被 spawn 时即执行体。 |
| **Architect Reviewer** | 独立 Agent reviewer · architect 评审 · posterior review · (gate) actor: llm | authoring 内 fan-out 的独立上下文 LLM，评审 proposal/plan 至 APPROVED。 |
| **IssueSource** | LocalIssueSource(唯一实现) · 远程 GitHub/GitLab(stub) · `sourceId` · (旧)`tasksDir` | 存储无关 task 数据源（BACK-601.1）。上游 = fork 自 Backlog.md。 |
| **Claude Code Monitor host** | Monitor(persistent) · harness · daemon | 承载并驱动自驱环的外部宿主；今天由它 + baime `scan-loop.js` 供电。 |
| **baime** | GCL/methodology(消费 payload) · old loop-backlog(soak fallback/冷备) · M2 采用方 | 解释 gate-event payload（E/C/H、GCL）。 |

## Work-item 层次厘清（feature/task/epic）

- **实体** = `Task`（唯一工作项类型）。
- **role**（派生）= `compound`(Epic，有子) | `primitive`(Basic，叶子)。role 随子任务出现**翻转**（decompose 把 primitive→compound）。
- **kind**（authoring 路由标签，仅 primitive 内）= `feature`（编码 → Proposal+Plan+测试）| `chore`（非编码：研究/审计/报告 → checklist）。改名自 baime `kind:task` 以消除与实体 Task 冲突。
- feature vs chore 的本质 = **走哪个 refine handler**（feature-to-backlog vs task-to-backlog），故它是 authoring 车道内的分支，**不是**两条车道。

## 完整生命周期（View 2）

```
[capture] 人 → kind:feature/chore/epic，落 Basic/Epic: Draft
   ↓ authoring 车道（scanner: basic-draft/epic-draft）
[refine] Draft→Refining，按 kind：feature→Proposal+Plan / chore→checklist / epic→plan(无子)
   ↓ →Backlog
[promote gate] 人：Backlog→Ready
   ↓ execution 车道（scanner: basic-ready/epic-ready/epic-eval-due）
[execute] feature→worktree 实现+DoD ; chore→跑 checklist ; epic→decompose 建子任务
   ↓ engine.complete → merge/advance → adjudicate DoD(ENG-8)
Done ；DoD fail/epic 评估异常 → needs-human（gate-review 在 issue-list 内联处理）
```

## 术语漂移表（现有实现优先取 canonical）

| 概念 | 用过的词（逐字） | 出处 | canonical / 处置 |
|---|---|---|---|
| **lane / 车道（关键消歧）** | 轴A: baime `kind:basic/kind:epic` "ADR-005 lane label" · 轴B: epicd "车道"=`pipeline_id` | epic-to-draft SKILL(轴A)；driver-supervisor §1/4.1(轴B) | **lane ≡ pipeline_id（仅轴B）**；轴A 改用 `role` |
| 类型轴 | role / compound / primitive · (baime) kind:basic/kind:epic / lane label | ADR-011 D-1.1；ADR-005 | **role**（派生） |
| kind 路由 | kind:feature · kind:task（与实体 Task 冲突！） | baime *-to-draft/backlog SKILL | **kind:feature / kind:chore**（chore 暂定） |
| 伞形系统 | 引擎/engine/engine core/`epicd`/受管 Bun 服务/daemon(`-d`) | ADR-011 header；ADR-010 | **engine / epicd** |
| 监督层 | supervisor/监督器/受管 Bun 服务/**Monitor**/供电 | driver-supervisor §4.3；authoring §4.1 | **supervisor** |
| 单车道循环 | driver/驱动器/**Monitor worker(主循环)**/scan-loop.js/**scanner** | driver-supervisor §4.2；ADR-012 ENG-6 | **driver** |
| "Monitor worker" 歧义 | 横跨 supervisor+driver+worker，自标"假定但未定义" | authoring §4.1/4.2 vs driver-supervisor §1 | 拆分使用 |
| 纯函数核 | 解释器/interpreter/极小解释器/Bun 引擎核 | ADR-011 D-2；ADR-013 D1 | **interpreter** |
| 执行体 | worker/执行体/implementer Agent/**Handler**(代码) | driver-supervisor §4.4；ADR-012 ENG-8 | **Handler**(代码)/worker(文档) |
| LLM 裁判 | 独立 Agent reviewer/architect 评审/posterior review/actor:llm | authoring §4.1；ADR-011 D-2 | **architect reviewer** |
| "llm" 过载 | handler 内 fan-out reviewer ↔ trust-ratchet gate actor | authoring §4.1 vs BACK-606 | 两机制勿混 |
| 工作实体 | **Task** / WorkItem(否决) / Epic(=复合显示) / primitive / item / item_id | ADR-011 D-1/D-6 | **Task** |
| **draft（关键消歧）** | 目录式: `drafts/` 文件夹 + `promoteDraft` 移文件 ↔ 状态式: `Basic:Draft` + kind + scanner refine | `src/cli.ts` draft/`server` /api/drafts(目录) ; `scan-loop.js`(状态) | **状态式（loop-draft）**；目录式 deprecated |
| 车道/通道(运行时) | pipeline/pipeline_id · (baime) mode(ready/draft) · channel(basic-ready/epic-draft) | ADR-011 D-2；scan-loop.js | **pipeline_id** |
| 驱动器身份/场 | field=(tasksDir,pipeline_id) → (sourceId,pipeline_id) / 场 | ADR-012 ENG-6；driver-supervisor §4.5 | **field=(sourceId, pipeline_id)** |
| ready 事件 | `item-ready:<pipeline_id>:<state>:<task_id>` · (baime) `basic-ready:TASK-N` | interpreter.ts；scan-loop.js | **item-ready** |
| 状态词汇 | 引擎 ready/in-progress/done ↔ UI To Do/... ↔ baime Basic:Ready/Epic:Awaiting Children | pipeline.ts/constants/scan-loop.js | 三套并存，按语境限定 |
| **状态分解（四轴）** | 旧：单一 `state`（ready/in-progress/needs-human 混装 phase+turn+active）→ 新：phase(`state`) · turn(`waiting_on`) · claim(runtime) | proposal §2.3；workitem-lifecycle-state.puml | **phase + waiting_on + claim**；`needs-human` 收敛为 `waiting_on=human`，ready/in-progress 合并 |
| 完成握手 | engine.complete(taskId,result) · (旧) `.agent-done-*` sentinel | ADR-012 ENG-8 | **engine.complete()** |
| **promote（收敛）** | (a)目录 draft→task[退役] (b)人 Backlog→Ready (c)authoring.done→execution (d)自治 gate 名 | server;authoring;ADR-011;BACK-606 | 退役(a)后剩 (b)(c)(d) |
| 分组 | milestone ↔ Epic(compound) — 语义重叠 | App.tsx/api ; ADR-011 | **Epic**；milestone deprecated |
| merge 锁 | 引擎 proper-lockfile ↔ 旧 loop `.merge-lock` | ADR-010 ENG-3；BACK-600.5 AC#1 | 须共享单锁 |
| fixpoint 过载 | driver 收敛幂等(600.6) ↔ Stage-2 自托管(§15.1) | BACK-601 guard#2 | 两义勿混 |
| 检查点单元 | Phase(=pipeline state,可恢复) ↔ Stage(非正式步,不可恢复,已移出) | ADR-011 D-2.2/D-6 | **Phase** |

## 用例清单（按 actor，标现状）

**Human — 已实现**：Manage tasks · Search · Docs & Decisions · Config/Init/Overview/Cleanup。
**Human — deprecated（弱化）**：Kanban board（→次要）· Milestones（≡Epic）· Folder-based drafts（→状态式）。
**Human — planned（新主面）**：Multi-lane issue list（人机双驱动可视 + 内联 gate-review）· Capture/intake · Promote gate · Ratchet trust。
**AI Agent（MCP）— 已实现**：`task_*` · `document_*` · `definition_of_done_defaults_*` · `get_backlog_instructions`（`milestone_*` 概念 deprecated）。
**Architect Reviewer — planned**：Refine feature（Proposal+Plan）· Refine chore（checklist）· Refine epic（plan）。
**引擎/execution 车道 — planned（今日 baime 跑）**：Scan(item-ready) · Execute feature/chore · Decompose epic · Evaluate epic · Complete(engine.complete) · Merge/advance · Adjudicate DoD(ENG-8) · Reap same-field peers · Flag stale-in-progress。
