---
adr: "013"
title: "结晶/熔融相变边界：确定性操作与判断操作的载体分配律"
status: Proposed
date: 2026-07-03
applies-to:
  - "src/engine/**"
  - "src/mcp/**"
  - "docs/proposals/**"
enforcement: semantic
stage: [proposal, plan]
lint: null
depends-on: ["ADR-011"]
ports: "baime docs/adr/ADR-014-crystallization-melting-phase-boundary.md（+ ADR-013 description-integrity 的 D3 面）"
---

# ADR-013: 结晶/熔融相变边界 —— 载体分配律

**Status**: Proposed（草案，2026-07-03）
**Date**: 2026-07-03
**Deciders**: Yale Huang
**Ports**: baime `ADR-014`（结晶/熔融相变边界）+ baime `ADR-013`（Monitor description 完整性）的 D3 面
**Generalizes**: 本仓 ADR-011 D-2.1（"结构进数据、逻辑进 handler"）

## Context

ADR-011 D-2.1 已定了一条工程纪律："pipeline 定义里不得有条件/表达式/循环——**结构进数据，
逻辑进 handler**"。这是对的，但它只覆盖了"pipeline 定义 vs handler"这一个切面。

baime 在自己的 loop-backlog 演化里，把同一直觉提炼成一条**更一般的载体分配律**（ADR-014）：
任一操作该由哪种载体承担，取决于它在**"确定性 ↔ 需判断"**轴上的位置；而 baime 还实测到
一个热力学类比——**context compact 是一次热扰动，只熔化熔融态（in-context 指令），破坏不了
结晶态（磁盘）**（ADR-013 记录的故障：compact 后模型从记忆合成简化指令，丢了关键约束）。

epicd 作为"pipeline 即数据、引擎即解释器"的重写，其**整个设计合法性都依赖这条律**：
- 为什么 pipeline 是数据、handler 是代码？——结晶 vs 熔融。
- 为什么 authoring 的评审必须 fan-out 到独立 Agent、而 detect/advance 留在 Bun？——载体升级律。
- 为什么 driver 的 `detect→spawn` 不能跨进程拆分？——孤儿约束（baime 实测的"In Progress +
  空 worktree + 无 agent"孤儿态）。

因此把这条律**显式移植为 epicd ADR**，作为 D-2.1 的母定律与 driver/handler 设计的判据来源。
本 ADR 同时标注：哪些面对 epicd 的 **Bun 引擎核**消解（引擎不经历 compact），哪些对
**Claude 托管的 authoring handler / 操作 skill 层**保留。

## Decision

### D1: 两相分类

| | 结晶态 (crystal) | 熔融态 (molten) |
|---|---|---|
| 本质 | 映射固定，零自由度，同输入必同输出 | 映射依赖内容，需解释/推理 |
| epicd 载体 | Bun 引擎代码（interpreter/driver/typed Core API）、pipeline 数据、config | LLM 一次推理（handler 内 fan-out 的 Agent、操作 skill） |
| 成本 | 极低，确定可复现 | 高（token），但能适应未预见情形 |
| compact 韧性 | 免疫 | 脆弱（仅当载体在 Claude context 内） |

相变边界切在"映射是否固定"处：固定的进结晶载体，不固定的进熔融载体。

### D2: 错配代价对称

- **过度结晶**（把判断冻进代码/pipeline 数据）→ 脆性：遇未预见 case 即崩。epicd 反例：把
  "proposal 是否 APPROVED"这种判断写成 pipeline 的条件转移，会撑裂 D-2.1。
- **过度熔融**（把机械操作留给 LLM）→ 浪费 token + 暴露于 compact。epicd 反例：让 handler 的
  Agent 去算"哪些 Task actionable"（那是 interpreter.scan 的确定性投影）。

### D3: 指令结晶、执行熔融（并入 baime ADR-013 的面）

熔融操作不可消除（fan-out 评审、分解、posterior review 本质是判断）。但它们的**指令**可独立
于执行被结晶：

- 反模式（baime ADR-013 实测）：指令(熔融, in-context) → 执行(熔融, Claude)——compact 同时熔掉
  指令与无关上下文，接收方从退化记忆合成简化指令，丢约束。
- 正模式：指令(结晶, 磁盘/数据 + 每周期重新注入) → 执行(熔融, Claude)——compact 碰不到指令；
  每周期从结晶源新鲜重发。

**epicd 归属**：
- **引擎核（Bun driver/interpreter）对 compact 免疫**——D3 的 compact 动机在此**消解**：driver
  是常驻进程，不经历 context 压缩，指令即代码。
- **但 authoring handler fan-out 的 Agent、以及 D-7-bis 的操作 skill 仍在 Claude 托管、仍会
  compact**——D3 对这一层**保留**：发给 reviewer/skill 的指令必须来自**结晶源**（pipeline 数据 /
  磁盘 prompt 模板 / 引擎每周期重注），而非依赖会被压缩的会话记忆。handler 每次被 dispatch 时，
  引擎应把完整指令**重新注入**，使评审"新鲜重触发"，不吃退化记忆。

### D4: 载体升级律（carrier-escalation law）

**不要把低熵载体能终结的操作升到高熵载体。** 只有不可化约的熔融余项才升到 LLM。

- 升级的最小单元 = "在低熵载体里结晶到底之后，剩下的那部分"。先在 Bun 引擎里结晶到底，剩什么
  再 emit 给 handler 的 Agent。
- **终态结晶**（fully resolvable，之后无熔融后继）的操作由引擎**直接执行**，根本不升到 LLM——
  升上去就是把已固态的东西熔了再凝固，纯浪费。
- epicd 应用：`interpreter.scan`（谁 actionable）、`advance`（状态推进）、offset 记账、cap 检查
  都是终态结晶 → 留 Bun；只有 propose/plan 的"起草→评审→修订至 APPROVED"是不可化约熔融 → 升 Agent。

### D5: 孤儿约束（orphan constraint）—— 对 driver 的安全属性

结晶段若有**熔融后继**（其产物只有跟上熔融步骤才有意义），结晶段与后继**必须在同一 actor 内
发生**，不得跨载体拆分。

- baime 反例（实测）：daemon 跑完 `basic-ready` 的 worktree 准备（结晶）后 emit，若 Claude 那步
  没发生（session 死/忙/compact 中断），留下 **"In Progress + 空 worktree + 无 agent"的孤儿态**。
- **epicd 直接同构**：driver 的 `detect`（结晶：扫出 actionable + 建 worktree）与 `spawn`（熔融：
  跑 worker）**必须同 actor 同事务**。若 detect 建了 worktree、持久了 `in-progress`，而 spawn 因
  崩溃/竞争没发生，就留孤儿 Task + 悬空 worktree。
- **约束**：driver 的"种子（结晶）"与"生长（熔融）"要么同步完成、要么一起回滚；`in-progress` 的
  持久化（ENG-1）与 worker spawn（ENG-2）之间不得存在可崩溃的裸窗口。这与 ENG-1/ENG-2 合流，
  是它们的**动机说明**。

### D6: 三类操作 → 三种载体（D4 + D5 的合取）

| 类型 | 判据 | epicd 载体 |
|---|---|---|
| **终态结晶** | 全机械，之后无熔融后继 | 引擎**直接执行**（scan/advance/offset/cap），不升 Agent |
| **结晶→熔融** | 机械准备，只有跟上熔融才有意义 | 引擎 spawn worker；准备与执行**同 actor**（D5，= ENG-1+2） |
| **纯熔融** | 整个是判断 | 引擎把**结晶指令**注入 handler 的 Agent（D3） |

终态结晶下放给引擎直接执行，须满足：**幂等**（ENG-1 cap）、**快速有界**（不阻塞 driver 主循环）、
**无跨载体竞争**（该事件类型引擎独占，worker 不碰）。

## Consequences

- ADR-011 D-2.1 从一条局部纪律获得母定律：D-2.1 是 D1+D2 在"pipeline vs handler"切面的特例。
- driver 设计（BACK-600.4）拿到显式判据：scan/advance 留 Bun（D4）、detect+spawn 同 actor（D5）、
  发给 reviewer 的指令来自结晶源并每周期重注（D3）。
- ENG-1/ENG-2 获得动机说明（D5 孤儿约束），ENG-8 获得理论定位（终态裁决是引擎的终态结晶职责，
  worker 的熔融产出不能自证）。
- Bun 引擎核对 compact 免疫这一事实被显式记录：epicd 相比 baime 的**结构优势**正是把大量原本
  熔融在 SKILL.md 的逻辑降到了 compact-免疫的结晶载体——这是 fork 的核心收益之一。

## Alternatives Considered

- **只保留 ADR-011 D-2.1、不移植母定律**：被否。D-2.1 不覆盖 D4（升级律）/D5（孤儿约束）/D3
  （指令结晶），而这三条恰是 driver 与 authoring handler 设计的关键判据；缺了它们，
  driver 会重演 baime 的孤儿态与 compact 退化。
- **把 baime ADR-014 逐字复制**：被否。baime 版预设 SKILL.md/scanner/Monitor 语境，epicd 需
  标注哪些面消解（Bun 核免疫 compact）、哪些保留（Claude 托管层），逐字复制会语义错配。
- **合并进 ADR-011**：被否。ADR-011 是"数据模型契约"，本 ADR 是"载体分配的治理原则"，
  关注点不同；独立成篇便于被 driver/authoring 设计引用。

## References

- baime ADR-014（出处）：`/home/yale/work/baime/docs/adr/ADR-014-crystallization-melting-phase-boundary.md`
- baime ADR-013（D3 面，compact 热扰动）：`/home/yale/work/baime/docs/adr/ADR-013-monitor-description-integrity.md`
- 本仓 ADR-011 D-2.1（结构/逻辑分离，本 ADR 的特例）、ADR-012（ENG-1/2 孤儿约束、ENG-8 终态裁决）
- 相关 proposal：`docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md`（driver 的 detect→spawn 同 actor）、`docs/proposals/2026-06-29-authoring-as-pipeline.md`（fan-out 评审 = 纯熔融）
