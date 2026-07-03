---
title: "ADR 即契约：机器可读 frontmatter + 三层强制 harness"
status: Proposal
stage: proposal
date: 2026-07-03
deciders: Yale Huang
applies-to:
  - "docs/adr/**"
  - "scripts/tests/**"
  - "src/engine/**"
relates-to:
  - "docs/adr/ADR-010-engine-safety-invariants.md"
  - "docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md"
  - "docs/adr/ADR-012-runtime-invariants-ported-from-baime-prototype.md"
  - "docs/adr/ADR-013-crystallization-melting-carrier-law.md"
ports: "baime docs/adr/ADR-008-adr-as-contract.md"
---

# Proposal: ADR 即契约 —— 机器可读 frontmatter + 三层强制 harness

> 本文是 proposal（pre-decision 设计稿），**不含 plan**。收敛后再产出 plan / 升格 ADR。
> 移植 baime ADR-008，落地 epicd 已继承 frontmatter 形状、却尚无 harness 消费的那半张图。

## 1. 背景与动机

epicd 的 ADR-010/011/012/013 的 frontmatter **已经带了** `enforcement`、`stage`、`applies-to`、
`lint` 字段——这个形状是从 baime ADR-008 继承来的。但 epicd **没有任何东西消费这些字段**：
没有校验器跑 `lint` 块，没有 plan 期把 ADR 断言注入 DoD，没有 review 期把 Decision 注入
reviewer。**那些 frontmatter 现在是"写了没接线"的死数据。**

这恰好是 baime ADR-008 亲自诊断的病：

> baime 有 7 个 ADR，但只有 ADR-006 真正接入执行管线，其余只是人类可读文档，靠 CLAUDE.md
> 一句"修改前读相关 ADR"提醒，无任何自动执行。后果可观测：TASK-183/190 都违反了 ADR-001/007
> 的同类约束，且都通过了多轮 plan review——因为 review 判据是固定结构规则，不含仓库架构约束。
> **ADR 写了不等于约束被执行。**

epicd 正在长出自己的 authoring pipeline（propose/plan handler）与安全不变量（ENG-1…8）。若此刻
不把 ADR 接进管线，epicd 会精确重演 baime 的病：ENG-* 与 ADR-013 载体律写在文档里，但 worker
跑 gate 时不会被自动拦截。**在 authoring pipeline 落地的同时把 ADR-as-contract 接线，是最省的时机。**

### 与 DoD 质量问题的接点

前序讨论（baime TASK-248：自由 shell DoD 会写反极性、逃逸到执行期）在 epicd 侧的解法之一正是
本提案的 **plan 层**：ADR 的 `lint` 断言**直接派生为 DoD 项**，而非手写。派生出的 DoD 极性统一、
可执行、可静态校验——把"DoD 从哪来"从人写改为从契约派生。本提案是 DoD-DSL 方向的承载层。

## 2. 问题陈述

- **P1 死 frontmatter**：`enforcement`/`stage`/`applies-to`/`lint` 已写入 ADR，无消费者。
- **P2 ADR 不被强制**：ENG-1…8、ADR-013 载体律无自动 gate；靠人读 CLAUDE.md，必然漂移。
- **P3 DoD 手写**：DoD 目前手写（`bun test …`），无从契约派生的机制，极性错误无静态防线。
- **P4 两处漂移**：baime ADR-006 现状是"规则在 ADR、代码在 validate 脚本"两处；epicd 不应重蹈。

## 3. 目标 / 非目标

**目标**
- G1 每个 ADR 携机器可读 frontmatter（沿用已有形状），由**单一 harness** 消费。
- G2 **新增一条可静态执行的 ADR 不需改 harness 代码——只加 frontmatter + `lint` 块。**
- G3 三层路由：static→check、`applies-to`+`lint`→plan 期 DoD、semantic→proposal/plan review。
- G4 `lint` 与决策**同住一个 ADR 文件**，杜绝 baime ADR-006 的两处漂移。

**非目标**
- N1 不在本提案产出 plan。
- N2 不重写现有 ADR 内容（只补/校准 frontmatter）。
- N3 不实现完整 DoD-DSL（Goss/CUE）——本提案只提供"lint→DoD 派生"的接线；DSL 选型另议。
- N4 不做 runtime 类 ADR 的在线断言编排（epicd 引擎运行时不变量由 ENG 测试覆盖，非本 harness）。

## 4. 提议设计

### 4.1 Frontmatter schema（沿用 baime ADR-008，已在 epicd ADR 中）

| 字段 | 类型 | 说明 |
|---|---|---|
| `adr` | string | 编号 |
| `status` | enum | `Proposed`\|`Accepted`\|`Superseded`\|`Withdrawn` |
| `applies-to` | [glob] | 路径 glob；任务/变更触及命中其一 → 该 ADR 相关 |
| `enforcement` | enum | `static`\|`semantic`\|`runtime`\|`advisory` |
| `stage` | [enum] | `proposal`\|`plan`\|`check` 子集，标明在管线哪几步生效 |
| `lint` | string\|null | `enforcement: static` 时必填：一段断言，exit 0 = 合规 |

`lint` 从仓库根执行，退出码即判定。epicd 语境下 `lint` 用 `bun`/shell 皆可（见 R2）。

### 4.2 三层路由（epicd 语境）

**check 层（static，确定性后防线）**
一个校验器（`scripts/tests/adr-lint.ts` 或纳入 `bun test`）遍历 `docs/adr/*.md`，对每个
`enforcement: static` 且 `status: Accepted` 的 ADR 执行其 `lint` 块，失败报错。lint 与决策同住
一文件，消除两处漂移（G4）。**这是 epicd 目前完全缺失的层。**

**plan 层（合成 DoD —— 接 authoring pipeline 的 planHandler）**
authoring pipeline（见 driver-supervisor 提案 + authoring-as-pipeline 提案）的 `planHandler`
在生成 plan 前，用任务触及文件匹配各 ADR 的 `applies-to`；命中且 `stage` 含 `plan` 的 ADR，
其 `lint` 断言**直接作为 DoD 项注入**。于是触及 `src/engine/**` 的任务自动带上 ENG-* 相关 DoD，
worker 跑 gate 时被自动拦截——**DoD 从契约派生，非手写**（G3 + 接 P3/DoD 质量）。

**proposal 层（语义约束注入 —— 接 proposeHandler）**
propose/plan review prompt 前，匹配 `applies-to`；命中的 ADR（尤其 `enforcement: semantic`，
如 ADR-013 载体律）的 Decision 段作为额外 review 判据注入 architect reviewer。语义类拦不住于
grep，靠注入让独立 reviewer 显式检查。

### 4.3 harness 的落址（结晶/熔融，ADR-013）

按 ADR-013 载体律分配三层的载体：
- **check 层 = 终态结晶**：纯机械跑 `lint`，落 Bun 校验器直接执行，不升 Agent（ADR-013 D4）。
- **plan 层 = 结晶→熔融**：`applies-to` 匹配 + `lint`→DoD 派生是**结晶**（引擎做），注入给
  planHandler 的 Agent 是**熔融后继**——二者在 authoring handler 内同 actor 完成（D5）。
- **proposal 层 = 纯熔融的指令结晶**：Decision 段作为**结晶指令**每轮重注给 reviewer（D3），
  不吃会被 compact 的会话记忆。

### 4.4 与引擎不变量的关系

ENG-1…8（ADR-012）与 ADR-013 载体律是 `enforcement: semantic`/部分 `static`。本 harness 让它们
从"文档"变"被强制"：ENG-* 的可静态断言部分（如 ENG-7 的"新 Task 落盘即合法"）可写成 `lint`
进 check 层；语义部分（如 ENG-8 的信任模型）进 plan/proposal 注入。**harness 是 ENG-* 从断言
变读数的开关**——呼应 baime 48h 复盘"最高杠杆是让不变量可强制，而非再加一条"。

## 5. 为什么是新文档而非并入现有 ADR

- 这是一个**机制/治理层**（harness + 路由），跨所有 ADR，不属于任何单条 ADR 的决策。
- 需要设计裁决（校验器用 bun 还是 shell、plan 注入接口、与 authoring handler 的耦合点），
  适合先 proposal 收敛再升格，而非直接改某个 ADR。
- 收敛后本提案自身升格为 epicd 的 ADR（如 ADR-014 "ADR-as-contract harness"）。

## 6. 影响面 / 与现状的差距

- **check 层**：新建 `scripts/tests/adr-lint.ts`（或 `bun test` 内的一个 suite），遍历 ADR 跑
  static `lint`。当前**完全缺失**。
- **frontmatter 校准**：现有 ADR-010/011/012/013 的 `lint` 多为 `null` 或注释占位（"待引擎
  运行时落地后补"）——需在对应 ENG 测试就绪后填实。
- **plan 注入接口**：依赖 authoring pipeline 的 `planHandler`（尚未实现，见 authoring 提案 §6）——
  本层**拉动** authoring pipeline 落地，二者有顺序依赖。
- **proposal 注入接口**：依赖 `proposeHandler`（同上）。

（以上为**差距清单**，非 plan。）

## 7. 风险与未决问题

- **R1 顺序依赖**：plan/proposal 两层依赖 authoring pipeline handler 存在。check 层可**独立先行**
  （不依赖 handler），建议先落 check 层拿到即时价值，plan/proposal 层随 authoring pipeline 上线。
- **R2 lint 载体**：`lint` 块用 shell（跨环境稳）还是 bun（与代码库同栈、可直接调 typed API）？
  baime 用 shell；epicd 可能倾向 bun 以便断言引擎内部状态。需定。
- **R3 lint→DoD 派生的粒度**：一条 ADR 的 `lint` 是整块作为一个 DoD 项，还是拆多项？影响 DoD
  可读性与失败定位。
- **R4 与 baime ADR-008 的分叉**：baime 版把路由绑在 `validate-plugin.sh` + feature-to-backlog；
  epicd 的宿主是 `bun test` + authoring handler。接口不同，语义应等价——需验证等价性。
- **R5 runtime 类 ADR 的归属**：`enforcement: runtime`（如部分 ENG-*）不进本 harness，由 ENG
  测试套件覆盖——需明确 harness 只管 static/semantic，runtime 划给 BACK-600.5 的引擎测试。

## 8. 收敛判据（proposal 级）

本 proposal 视为 ready-for-plan，当：
- 三层路由形态（check/plan/proposal + 各自载体分配）经 architect 评审 APPROVED；
- R1（先行 check 层）与 R2（lint 载体 bun/shell）得到人的方向裁决；
- 与 authoring pipeline handler 的接口（plan/proposal 注入点）对齐无缝；
- 与 ADR-013 载体律的一致性（三层各落正确载体）被确认。

> 下一步（**不在本提案内**）：据此产出 plan（建议 check 层先行、plan/proposal 层随 authoring
> pipeline），或先把本提案升格为 ADR-014。
