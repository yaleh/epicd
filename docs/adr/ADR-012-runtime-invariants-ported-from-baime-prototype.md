---
adr: "012"
title: "从 baime 原型迁移的运行时不变量：ENG-6 驱动器场身份 + ENG-7 落盘原子合法性"
status: Proposed
date: 2026-07-03
applies-to:
  - "src/engine/driver.ts"
  - "src/engine/complete.ts"
  - "src/engine/interpreter.ts"
  - "src/core/**"
  - "scripts/tests/engine-invariants.test.sh"
enforcement: semantic
stage: [proposal, plan]
lint: |
  # 待 E0 引擎驱动器落地后补：
  # bun test src/test/engine-safety-field-identity.test.ts
  # bun test src/test/engine-atomic-create.test.ts
depends-on: ["ADR-010", "ADR-011"]
supersedes-context-of: ""
---

# ADR-012: 从 baime 原型迁移的运行时不变量

**Status**: Proposed（草案，2026-07-03）
**Date**: 2026-07-03
**Deciders**: Yale Huang
**Ports / distills**: baime `loop-backlog` / `loop-draft` 在 2026-07-02～07-03 窗口实测出的运行时失败比特
**Extends**: 本仓 ADR-010（ENG-1…ENG-5）、ADR-011（D-1 Task schema / D-2 pipeline-as-data）

## Context

ADR-010 从 baime **旧 daemon 的 15 条静态不变量**（sentinel 脆弱性）蒸馏出 ENG-1…ENG-5。
那批不变量归纳的是 fork **之前**已知的回归。

但 baime 的 loop-backlog / loop-draft 是**仍在运行的原型**，它在 2026-07-02～07-03 的
自驱窗口里又**新**实测出一批失败模式——这些不在 ADR-010 的 15 条内，因为它们是
**多 scanner 并发 + 捕获-细化流水线**这两个 baime 近期才引入的机制暴露出来的。epicd 因为
**驱动器尚未落地**（`Interpreter.scan/dispatch` 目前只是被单测驱动的纯函数，见 BACK-600.4），
这些坑一个都还没踩到。

本 ADR 的判断（与 ADR-010 同构）：**这些失败比特是 baime 用运行时 debug 换来的证据，
应在 epicd 起 driver loop（BACK-600.4）之前，就作为不变量凝固进引擎 core，而不是等 epicd
自己再踩一遍。** 按 GIT 结晶判据——每条不变量都删除了一个"此前可达的非法态"，且由
**已命名的复发故障**（baime 实测）背书，不是凭设计直觉。

将它们编号为 **ENG-6 / ENG-7**，接续 ADR-010 的 ENG-* 序列。

## Decision

### baime 窗口失败比特 → 引擎不变量映射

| baime 实测失败（证据） | 根因 | 引擎不变量 |
|---|---|---|
| 同一 repo 起第二个 `scan-loop.js --mode draft` 会 SIGKILL 掉 `--mode ready` 的 scanner——reap 场判据原本只按 `tasksDir`，不含 mode | 场身份维度缺失：两个逻辑通道被误判为同一场 | **ENG-6** |
| soak 期旧 loop-backlog 与引擎可能同时 advance 真板同一 task（本仓 BACK-600.5 AC#1 已识别） | 无"每场至多一个活动驱动器"的强制 | **ENG-6** |
| 并发 scanner 在 Task `create` 与随后的 `edit --description` 之间 claim 了任务（Draft→Refining），细化器与晚到的 edit 竞争 | create-then-edit 之间存在可被 claim 的非法窗口 | **ENG-7** |
| 新捕获的 Task 在车道标签被细化器回填前，短暂不通过 lane 校验（ADR-005 违规窗口） | 落盘瞬间字段不全 = 一个可达的"结构非法但已可见"态 | **ENG-7** |
| self-clear 谓词"文档写了、代码没做"反复复发（baime adr009 家族） | transition 的自清语义是散文承诺，无可执行断言背书 | **ENG-7 附则**（强化 ENG-4） |

### 引擎运行时不变量（ENG-*，接续 ADR-010）

#### ENG-6: 驱动器场身份唯一 —— `field = (tasksDir, pipeline_id)`

- 一个驱动器实例**拥有一个场**，场身份是 `(tasksDir, pipeline_id)` 的二元组，**不是**单独的
  `tasksDir`。多个 pipeline（如 execution 与 authoring）对同一块板并存运行时，是**不同的场**，
  必须能共存而**不互相 reap**。
- 驱动器的 supersede/reap 谓词（"新臂夺场、旧臂退位"）**当且仅当** `tasksDir` **且**
  `pipeline_id` 都相同才判为同场。跨 pipeline 的驱动器互不干涉。
  > baime 的对应实现（参考、非照抄）：`scan-loop.js` reap 谓词
  > `path.resolve(target) === myTasksDir && candMode === myMode`——加上 `candMode` 那一半
  > 正是 baime 修这个互杀 bug 的补丁。epicd 的 `pipeline_id` 天然就是这个维度。
- **每场至多一个活动驱动器**：reap 是自安全的（读 `/proc/<pid>/cmdline` 或等价的进程自省，
  排除自身，避免自杀式匹配）。soak 期与旧 loop-backlog 的跨机制并发（BACK-600.5 AC#1）是
  本条的一个实例：要么共享板级 merge 锁互斥，要么钉死"引擎运行时旧 loop 为冷备"。
- **删除的非法态**：两个不同职责的 scanner 被误判同场而互杀；两个驱动器同时改一块板。

#### ENG-7: 落盘原子合法性 —— 新 Task 单次写入即全字段合法，禁 create-then-edit

- 创建一个 Task 必须在**单次写入**内写全所有 **pipeline 路由字段**
  （ADR-011 D-1：`pipeline_id`、`state`、`role`、`parent_id`，以及 `dod`/`cap` 若适用）。
  Task **落盘的那一刻**就必须通过 pipeline 合法性校验——不存在"已可见但字段不全"的中间态。
- **禁止 create-then-edit 路由字段**：任何"先建后补路由/分类字段"的两步写入序列都为并发
  scanner 留出了 claim 窗口。捕获/propose/inbox 这类入口必须**先备好全字段、再单次 create**。
  > baime 的对应修复：`capture-draft.sh` 从"create 后 `backlog task edit --description`"改为
  > 单次 `task create` 带全字段 + 车道标签；并被 baime 既有 manifest-lint 规则 R1
  > （`field='description'` 仅允许 `task create`、不允许 `task edit`）独立佐证。
- **附则（强化 ENG-4）：transition 自清语义必须由可执行断言背书。** 若某 pipeline transition
  声称"消费后谓词自动翻假 / 自动推进"，该自清必须有逐 transition 的不变量测试证明它**真的**
  发生，而非停留在 pipeline 数据定义的注释里。这封死 baime adr009 家族"写了没做"的复发陷阱：
  在 epicd 的 `transitions[]` 尚未实现（ADR-011 D-2 的 MVD 暂时省略了它）之际，正是把这条
  纪律**在凝固前**写进 D-2 实现的最佳时机。
- **删除的非法态**：create 与 edit 之间任务被半成品状态 claim；落盘即结构非法的 Task；
  文档承诺但代码未实现的自清 transition。

### 强制与测试

- **归属 Epic**：ENG-6 归 **BACK-600.4**（驱动器 detect→spawn→merge→advance 必须以 `field`
  为单位；`engine.complete` 推进 state 时 ENG-7 附则的自清断言在此层校验）；ENG-7 归
  **BACK-600.4 + 捕获/authoring 入口**（对应本仓 `task-1` authoring-as-pipeline）。
- **测试载体**（待 BACK-600.4 驱动器落地后建立）：
  - `src/test/engine-safety-field-identity.test.ts`：起两个不同 `pipeline_id`、同 `tasksDir`
    的驱动器，断言二者**共存不互杀**；起两个同场驱动器，断言 reap 收敛到单例。
  - `src/test/engine-atomic-create.test.ts`：断言新建 Task 落盘即通过 pipeline 合法性；
    模拟"create 后立即 scan"，断言不存在字段不全的可 claim 窗口。
  - transition 自清：逐 transition 的单测（随 ADR-011 D-2 `transitions[]` 实现一并建立）。
- E0 是否强制 ENG-6/7 全量：ENG-6 的"单例/场身份"随 BACK-600.4 驱动器同期落地（否则驱动器
  一多就损坏）；ENG-7 的"原子创建"随第一个写盘入口落地。ENG-7 附则待 `transitions[]` 存在时生效。

## Consequences

- epicd 的驱动器（BACK-600.4）从第一版就带正确的场身份，不会重演 baime 的 scanner 互杀，
  也不会在 create-then-edit 窗口漏 claim。
- ENG-6 与 BACK-600.5 AC#1（soak 期跨机制并发）是同一不变量的两个面：本 ADR 把"单一活动
  驱动器 / 场互斥"从一条 AC 提升为可跨 epic 引用的稳定契约。
- ENG-7 附则给 ADR-011 D-2 的 `transitions[]` 实现附加了一条落地纪律，防止 pipeline-as-data
  在获得转移语义时重新引入 baime 的 fictional-self-clear。
- 与 ADR-010 的关系：ADR-010 是 fork **之前**的 15 条；本 ADR 是 fork **之后** baime 原型
  在多 scanner + 捕获流水线机制下**新实测**的补充。二者同属"别把库改坏 + 别让并发损坏状态"
  的安全栏，编号连续（ENG-1…5 in ADR-010，ENG-6…7 here）。

## Alternatives Considered

- **等 epicd 驱动器上线后按 bug 反应式补**：被否。这几条已被 baime 实测、根因清楚、且恰好落在
  epicd 尚未凝固的驱动器/入口层——预防成本近零，反应式修复要重走 baime 的整轮 debug。
- **把 ENG-6/7 直接内联进 BACK-600.4/600.5 plan**：被否，理由同 ADR-010——安全栏应有稳定
  可引用的契约文档，而非散在 epic plan 里；且 ENG-6 跨 600.4 与 600.5 AC#1 两处，需要单一出处。
- **合并进 ADR-010**：被否。ADR-010 的语义是"fork 前 15 条的重诠释"，边界清晰；本 ADR 的
  证据窗口（07-02～07-03 多 scanner 实测）在 ADR-010 之后，独立成篇更诚实地反映证据来源。

## References

- baime scan-loop 场身份补丁：`/home/yale/work/baime/plugin/scripts/scan-loop.js`（reap 谓词含 `candMode === myMode`）
- baime 捕获引擎原子化：`/home/yale/work/baime/plugin/scripts/capture-draft.sh`（单次 create 带全字段 + 车道标签）+ manifest-lint 规则 R1
- baime adr009 家族（self-clear fictional）：`/home/yale/work/baime/docs/adr/ADR-009-pulse-predicate-self-clearing.md`
- 本仓 ADR-010（ENG-1…5）、ADR-011（D-1 Task schema / D-2 pipeline-as-data / D-4 gate-event log）
- 相关 Epic/task：BACK-600.4（驱动器 + completion API）、BACK-600.5（安全不变量，AC#1 跨机制并发）、`task-1`（authoring-as-pipeline 后台化）
