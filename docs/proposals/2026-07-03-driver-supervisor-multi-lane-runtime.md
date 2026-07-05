---
title: "驱动器与监督器：多车道 pipeline 的运行时基座"
status: Proposal
stage: proposal
date: 2026-07-03
deciders: Yale Huang
applies-to:
  - "src/engine/driver.ts"
  - "src/engine/interpreter.ts"
  - "src/engine/complete.ts"
relates-to:
  - "docs/adr/ADR-010-engine-safety-invariants.md"
  - "docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md"
  - "docs/adr/ADR-012-runtime-invariants-ported-from-baime-prototype.md"
  - "docs/proposals/2026-06-29-authoring-as-pipeline.md"
---

# Proposal: 驱动器与监督器 —— 多车道 pipeline 的运行时基座

> 本文是 proposal（pre-decision 设计稿），**不含 plan**。收敛后再产出 plan / 升格。
> 它设计的是 authoring-as-pipeline 提案所**假定但未定义**的那个"Monitor worker 主循环"。

## 1. 背景与动机

epicd 已经把"车道"结晶成数据：一条 pipeline = 一个 `pipeline_id`（ADR-011 D-2），
`Interpreter.scan/dispatch` 已实现为纯函数。但**没有任何东西在循环里调用它们**——
`scan/dispatch` 目前只被单测驱动，没有 driver loop、没有轮询、没有进程监督（见 BACK-600.4）。

与此同时，[authoring-as-pipeline 提案](2026-06-29-authoring-as-pipeline.md) 的核心论点是
"能消费后台产物并继续 fan-out 的执行体本身必须是一个主循环"，并把该主循环命名为
**"Monitor worker"** 反复引用（§4.1/§4.2/§6）——但那个 Monitor worker **是什么、如何起、
多条 pipeline 如何共存**，该提案标记为"epicd 已有该载体"却**未加设计**。

本提案补上这块基座：**driver（单车道驱动器）+ supervisor（多车道监督器）**，并把
baime 原型用运行时 debug 换来的边界（ADR-012 的 ENG-6/7）从第一版就焊进去。

### baime 现状作为参照

baime 的 `loop-backlog` / `loop-draft` 是**仍在跑的原型**，它的运行时正好是三层，可逐层映射：

| baime（在跑） | 本质 | epicd 对应物 | epicd 现状 |
|---|---|---|---|
| `mode`（`ready`/`draft`） | 一组可动作谓词的投影 = **一条车道** | **pipeline**（`pipeline_id`） | `executionPipeline` 已有；authoring 待建 |
| `scan-loop.js`（自 reap 单例、`/proc` 自省、pulse 行协议） | 车道的**驱动器 driver** | 待建 `src/engine/driver.ts`（BACK-600.4） | **缺**（只有纯函数 scan/dispatch） |
| Monitor（Claude Code 内编排器，SKILL 只 arm 它） | 车道的**监督/供电** supervisor | 待建 受管 Bun 服务（ADR-010 提及） | **缺** |
<!-- 修订（ADR-015）：Monitor 的本质不是"编排器/调度"，而是 **invocation adapter**——`claude -p` 的
     计费替身。它承担 supervisor（单例/存活）+ invocation transport（把 item-ready 投给一个 seat）两个
     适配器角色；调度（when/which）属 driver/engine，prompt authoring 属 engine。见 docs/adr/ADR-015。 -->
| channel（`basic-ready`/`epic-draft`…） | 车道内一个 actionable 谓词 | pipeline 的一个 actionable `state` | 已有 |
| worker（templates + complete-task.sh，worktree 隔离） | 执行体 | worktree worker + `engine.complete()` | 待建（BACK-600.4/600.5） |

**核心差异**：baime 把"车道"实现成 `scan-loop.js` 里硬编码的 `MODE_CHANNELS` 分组 +
一堆 `const *_STATUS`（散文/代码分支）；epicd 应把"车道"实现成 **pipeline-as-data 的一个
`pipeline_id`**。epicd 在此设计更优——车道是数据、不是代码分支。本提案**不移植 baime 的
scan-loop 代码**，只把它已实测可行的"多车道单驱动器"形态，实现成 epicd 的数据化基座。

## 2. 问题陈述

- **P1 无 driver**：`interpreter.scan/dispatch` 无人在循环里调用；引擎不会自驱。
- **P2 无 supervisor**：无进程负责起/守/停 driver；无单例保证、无冷启动 offset 恢复。
- **P3 多车道共存未定义**：authoring 与 execution 两条 pipeline 要同板运行，但"两个驱动器
  在同一 `tasksDir` 上如何不互相干扰"没有机制——baime 恰在此踩过 scanner 互杀（ADR-012 ENG-6）。
- **P4 authoring 提案悬空**：它假定的"Monitor worker 主循环"没有实体，导致该提案无法落 plan。

## 3. 目标 / 非目标

**目标**
- G1 一个 **driver** 把 `detect→spawn→merge→advance` 闭环在 interpreter 之上（= BACK-600.4）。
- G2 一个 **supervisor** 起若干 driver，每 driver 绑一个**场** `field = (tasksDir, pipeline_id)`，
  负责单例、生命周期、stop、冷启动 offset。
- G3 **多车道共存**：authoring 与 execution 两条 pipeline 同板并行且**互不 reap**（ENG-6）。
- G4 从第一版即满足 **ADR-012 ENG-6/7** 与 **ADR-010 ENG-1…5**（安全栏），不留 baime 已知坑。
- G5 为 authoring-as-pipeline 提案提供其所需的 "Monitor worker 主循环" 实体，解锁其 plan。

**非目标**
- N1 不在本提案产出 plan（显式约束）。
- N2 不设计 authoring handler 内部（propose/plan 评审循环）——那归 authoring 提案。
- N3 不实现富 gate-event 语义（E/C/H 归 `payload`，ADR-011 D-4）。
- N4 不做交互式 mid-run 人类问答（handler 无人值守，遇阻落 `needs-human`）。

## 4. 提议设计

### 4.1 场身份：`field = (tasksDir, pipeline_id)`（ENG-6）

一个 driver 实例拥有一个**场**，场身份是二元组 `(tasksDir, pipeline_id)`，**不是**单独的
`tasksDir`。authoring 与 execution 对同一块板并存运行时是**两个场**，必须共存不互杀。
driver 的 reap/supersede 谓词**当且仅当** `tasksDir` **且** `pipeline_id` 都相同才判同场。

> baime 的对应补丁（参考、非照抄）：`scan-loop.js` reap 谓词
> `path.resolve(target) === myTasksDir && candMode === myMode`——`candMode` 那一半正是修
> scanner 互杀的补丁。epicd 的 `pipeline_id` 天然就是这个维度。

### 4.2 driver（单车道驱动器，BACK-600.4）

每个场一个 driver 循环：

```
driver(field = (tasksDir, pipeline_id)):
  reapSameFieldPeers(field)             # ENG-6：只 reap 同 (tasksDir,pipeline_id)，读进程自省排除自身
  offset = loadOffset(field)            # ENG-4：持久 offset，冷启动不重放已 settled 事件
  loop until stopRequested(field):
    tasks  = store.load(tasksDir)
    events = interpreter.scan(tasks, pipeline)          # 已有纯函数
    for e in events after offset:
      if capSatisfied(e.task): continue                 # ENG-1：cap 幂等，重启不二次执行
      persistStateBeforeSpawn(e.task)                   # ENG-1：状态推进先于 spawn
      spawnInWorktree(e.task)                           # ENG-2：worktree 隔离，成败都清理
    for r in completions():                             # engine.complete(taskId,result) 回程
      advanceUnderMergeLock(r)                          # ENG-3：merge 串行化；冲突→needs-human
      assertSelfCleared(r)                              # ENG-7 附则：transition 自清须可断言
    commitOffset(field)                                 # ENG-4
    sleep(interval)
```

相对 baime scan-loop 的**结晶改进**（把 baime 液态处凝固）：
- **无硬编码 channel 表**：baime 的 `channels[]` + `MODE_CHANNELS` 两处列表（有 desync 风险）
  → epicd 直接来自 `pipeline.states` 的 `actionable` 投影，单一数据源。
- **事件即 `item-ready:<pipeline_id>:<state>:<task_id>`**（已在 `interpreter.ts`）——`pipeline_id`
  已内建场维度，比 baime 的 `basic-draft:` 前缀干净。
- **completion 是类型化 API**：`engine.complete()` 取代 baime 的 `.agent-done-*` sentinel 文件。

### 4.3 supervisor（多车道监督器）

supervisor 是受管 Bun 服务（ADR-010 决定的"受管服务取代 nohup Bash"的实体），只做**进程
生命周期**，不含车道逻辑（车道逻辑全在 pipeline 数据 + handler）——对应 baime "Monitor 只 arm、
不持有设计态"：

```
supervisor（受管 Bun 服务，受 ENG-1…7 约束）
├── driver(field=(board, "authoring"))    # 前台 inline，maxParallel=1，handler 持有 Agent 可 fan-out
└── driver(field=(board, "execution"))    # 后台并发，worktree 隔离
        ↑ pipeline_id 不同 = 两个场 = ENG-6 保证不互 reap
```

- **authoring 车道**为何须 `maxParallel=1` 且前台 inline：其 handler 要 fan-out 到独立 architect
  reviewer（authoring 提案 §4.2 的根因——只有主循环持有 `Agent`）。这条车道占用 driver。
- **execution 车道**可后台并发多 worker，受 ENG-2/ENG-3 约束。
- supervisor 负责：单例启动、崩溃重启、`stopRequested` 广播、冷启动时各 driver 恢复 offset。

### 4.4 两条车道的衔接（人类 gate 在边界）

复用 authoring 提案 §4.3 的双端人 gate，本提案只补"谁在驱动中间段"：

```
[人 intake gate]  创建 pipeline_id=authoring,state=propose 的 Task
      ↓  (authoring driver 后台驱动 propose→plan，全独立评审)
authoring.done  ──promote──▶  execution.ready     # cross-pipeline edge, provenance.spawned_from
      ↑ [人 promote gate]                             (ADR-011 D-2.3)
      ↓  (execution driver 后台驱动 ready→in-progress→done，worktree worker)
execution.done
```

两个 driver 各自跑各自的场；跨车道派生（`authoring.done → execution.ready`）是一次**数据写入**
（写目标 Task 的 `pipeline_id/state` + `provenance`），由 promote gate（人）触发，不自动越界——
保住 `dev-workflow-preference`"人管 gate、loop 管 execution"。

### 4.5 数据面：driver 经 IssueSource 取数，场身份从 `tasksDir` 泛化为 `sourceId`

§4.2 的 driver 循环写作 `tasks = store.load(tasksDir)`——**直接按本地目录读文件**；§4.1 的场身份
`field = (tasksDir, pipeline_id)` 也把**存储路径**焊进了身份。这两处都把 driver 与"本地 markdown
文件"这一具体存储介质绑死。本节把这层耦合解开，作为**"先做数据面"排序决定在本提案的落点**
（数据抽象先于展现/泛化）。

- **driver 经 `IssueSource` 取数（不再自读目录）**：driver 的数据来源改为
  `store` → **`IssueSource.list(filter)`**（接口见 BACK-601.1：`list/get/upsert`，存储无关的
  tagged-markdown 契约）。`§4.2` 的 `tasks = store.load(tasksDir)` 泛化为
  `tasks = issueSource.list({ pipeline_id })`。`LocalIssueSource`（读 `backlog/tasks/*.md`）是**默认
  且当前唯一**实现；远程 source（GitHub/GitLab）留接入位、**本提案不实现**。
- **场身份泛化 `(tasksDir, pipeline_id) → (sourceId, pipeline_id)`（ENG-6 增补）**：ENG-6 的
  reap/supersede 判据不再按目录路径，而按 `sourceId`。`tasksDir` 只是 `LocalIssueSource` 的
  `sourceId` 特例（如 `local:<abs tasksDir>`）。这样 supervisor 起多个 driver 时，"同场判据"
  与存储介质无关，远程 source 也能有稳定场身份。**ENG-6 的语义不变**（每场至多一个活动驱动器），
  只是身份的第一维从"目录"升为"数据源标识"。
- **协调面（锁/offset/staleness）保持本地，即使数据面远程**：merge 锁（ENG-3）、持久 offset
  （ENG-4）、staleness/cursor 属 **supervisor / 协调关注点**，**不塞进 `IssueSource`**——否则远程
  adapter 被迫实现 `.merge-lock` / 文件 mtime 语义，接口泄漏。`IssueSource` 只回答"有哪些 tagged
  文档、状态是什么"；"谁在处理、锁、游标"归 supervisor，且可（且大概应）**始终本地**。这与 §4.3
  supervisor "只做进程生命周期、不含车道逻辑"的分层一致：**数据面解耦、协调面留本地**。

> 落地纪律：本节是接口/身份的**泛化**，非新机制。`store.load(tasksDir)` 与
> `field=(tasksDir,…)` 的每处引用都应能替换为 `issueSource.list(…)` 与 `field=(sourceId,…)`
> 而不改 driver/supervisor 的控制流。远程 adapter 的增加应"只加一个 `IssueSource` 实现"，
> 不触碰 driver/supervisor core（与 §4 的耦合纪律同构）。

## 5. 为什么是新文档而非并入 authoring 提案

| 关切 | 归属 |
|---|---|
| authoring handler 内部（propose/plan 评审循环、cross-pipeline edge 语义、skill 迁移）| authoring-as-pipeline 提案 |
| **driver 循环、supervisor、场身份、多车道共存、offset/单例/生命周期** | **本提案** |

authoring 提案 §6 把"Monitor worker 载体"列为"已有"并跳过；实际它属 BACK-600.4，是本提案的
主体。二者是**互补**关系：本提案提供基座，authoring 提案提供跑在基座上的第二条车道。合并会让
两个不同抽象层（运行时基座 vs 单车道 handler）挤在一篇，违背 ADR-011 D-2.1 的"结构/逻辑分离"精神。

## 6. 影响面 / 与现状的差距

- `src/engine/driver.ts`：**新建**（BACK-600.4 已规划）。detect→spawn→merge→advance 循环。
- `src/engine/complete.ts`：**新建**（BACK-600.4）。类型化 `engine.complete(taskId,result)`。
- supervisor 进程：**新建**（本提案新引入的实体；BACK-600.4 driver 之上的监督层，可能拆为
  BACK-600.4 的后续 child 或独立 task）。
- **数据面 `IssueSource`（§4.5）**：driver 取数改经 `IssueSource.list()`（接口/实现见 BACK-601.1，
  数据面优先）；ENG-6 场身份泛化为 `(sourceId, pipeline_id)`。**`store.load(tasksDir)` 与
  `field=(tasksDir,…)` 的引用点需随之替换**，控制流不变。
- offset / 单例 / stop 机制：随 driver 落地（ENG-4/ENG-6），且**保持本地**（协调面不随数据面外移）。
- 安全不变量测试：ENG-6/7 的 `engine-safety-field-identity.test.ts` / `engine-atomic-create.test.ts`
  （ADR-012 §强制与测试），ENG-1…3 归 BACK-600.5。

（以上为**差距清单**，非 plan；步骤/顺序/DoD 留待 plan 阶段。）

## 7. 风险与未决问题

- **R1 supervisor 归属**：它是 BACK-600.4 的一部分，还是 driver 稳定后另立 task？driver 单场
  可先无 supervisor 裸跑（单车道 MVD），supervisor 在上第二条车道（authoring）时才必需。
  建议：MVD 只做单场 driver（execution），supervisor 与 ENG-6 多场共存随 authoring 上线同期落地。
- **R2 前台 inline 的 authoring driver 与后台 execution driver 的进程模型**：同进程多协程，
  还是多进程？authoring handler 要持有 `Agent`（Claude Code 主循环能力），这约束了它的宿主
  形态——可能 authoring driver 必须活在能 spawn Agent 的上下文里，而 execution driver 可纯 Bun。
  这是本提案最不确定处，需在 plan 前定方向。
- **R3 soak 期跨机制并发**（BACK-600.5 AC#1 + ADR-012 ENG-6）：引擎 driver 与旧 baime loop-backlog
  若同板运行，须共享 merge 锁互斥，或旧 loop 降冷备。方向裁决影响 supervisor 是否需感知外部锁。
- **R4 offset 存储**：ENG-4 的持久 offset 落在哪——gate-event log（ADR-011 D-4）内，还是独立
  checkpoint 文件？影响冷启动恢复实现。

- **R5 数据面抽象层级（§4.5）**：driver 经 `IssueSource` 取数、场身份泛化为 `(sourceId, pipeline_id)`
  已定方向（"先做数据面"），但两个边界待定：(a) `sourceId` 的**编码规范**（`local:<absDir>` 是否够，
  远程如何编址而不泄漏凭据）；(b) `IssueSource` 与 supervisor 的**职责红线**——list/get/upsert 归
  `IssueSource`，锁/offset/staleness 归 supervisor，但 `epic-eval-due`（所有子任务终态才触发）这类
  **需读关系**的谓词落在哪一侧？倾向：关系查询归 `IssueSource.list` 的 filter，**判定**归 driver/
  interpreter。plan 前需钉死这条红线，否则接口会被运行时谓词污染。

## 8. 收敛判据（proposal 级）

本 proposal 视为 ready-for-plan，当：
- 三层形态（field=(tasksDir,pipeline_id)、driver 循环、supervisor 监督）经 architect 评审 APPROVED；
- R1（supervisor 归属/时机）与 R2（authoring driver 进程模型）得到人的方向裁决；
- 与 ADR-012（ENG-6/7）、ADR-010（ENG-1…5）、ADR-011（pipeline-as-data）的一致性被确认；
- 与 authoring-as-pipeline 提案的接口（本提案供基座、彼提案供 authoring handler）对齐无缝；
- R5 的数据面红线（`sourceId` 编码、`IssueSource` 与 supervisor 职责边界）得到裁决，且与
  BACK-601.1 的 `IssueSource` 接口对齐。

> 下一步（**不在本提案内**）：据此产出 plan，或先把 R1/R2 升格为 ADR 增补 / 补进 BACK-600.4 plan。
