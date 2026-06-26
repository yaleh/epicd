---
adr: "010"
title: "引擎安全不变量：从 loop-backlog 15 条 daemon 不变量重诠释而来"
status: Accepted
date: 2026-06-26
applies-to:
  - "src/core/**"
  - "src/core/git/**"
  - "src/engine/**"
  - "scripts/tests/engine-invariants.test.sh"
enforcement: semantic
stage: [proposal, plan]
lint: |
  # 待引擎实现运行时后补：引擎不变量测试（static + 单测）
  # bash scripts/tests/engine-invariants.test.sh
supersedes-context-of: "baime docs/adr/ADR-010-daemon-invariants.md"
---

# ADR-010: 引擎安全不变量

**Status**: Accepted（2026-06-26）
**Date**: 2026-06-26
**Deciders**: Yale Huang
**Ports / reinterprets**: baime `docs/adr/ADR-010-daemon-invariants.md`（INV-1…INV-15）
**Derived from**: baime 讨论记录 `docs/discussions/2026-06-26-backlog-engine-fork-direction.md` §15 + ADR-011 D-7

## Context

baime 的 ADR-010（`Daemon 不变量断言清单`）把 loop-backlog daemon/worker 的
**15 次 fix 提交**归纳为 15 条静态可断言的不变量（INV-1…INV-15），由
`scripts/tests/daemon-invariants.test.sh` 在 `validate-plugin.sh` 中验证。

那 15 条不变量描述的是**旧确定性运行时**——一个 `nohup` 起的 Bash daemon + 前台
`tail` 事件流 + prose/`sed`/`grep` worker + `.agent-done-*` sentinel 文件。fork 讨论
（§D8、§③④）的核心判断是：

> ADR-010 的 15 条不变量**几乎都关于这层 sentinel 的脆弱**；状态进引擎后，大部分
> 变成**类型系统保证或单测**，而非需反复审计的 prose。

因此 epicd 不应逐字复制 baime 的 ADR-010（那 15 条都在讲一个 epicd 里不再存在的
机制）。本 ADR 把它们**重新诠释**为引擎语境下的归属，并钉死哪些是 E0/E3 必须落地的
**安全关键不变量**。本文件让 epicd 仓库内对"ADR-010 子集 / 完整 ADR-010"的引用
（ADR-011 D-7 第 210 行、Epic E0/E1/E3）就地可解析。

## Decision

每条原 daemon 不变量在引擎语境下归入三类之一：

- **DISSOLVED（消解）**：该脆弱性源于旧机制（Bash 生命周期、tail 重放、CJS/ESM、
  prose+sed/grep）。机制被引擎替换后，这一类回归从根上消失，**无需任何断言**。
- **TRANSFORMED（转化）**：关切仍在，但实现从"手工审计的 prose"升级为
  **类型化 API / 持久事件存储 / 引擎服务生命周期**。断言从 grep prose 变为单测或类型检查。
- **PRESERVED（保留）**：这就是"别把库改坏"的安全关键核心。引擎**必须**保留并测试。
  E0 折入其最小子集，E3 折入全部。

### 15 条不变量的引擎归属

| 原 INV（daemon） | 关切 | 引擎归属 | 引擎不变量 |
|---|---|---|---|
| INV-1 路径不含前导点 | `.backlog/` 崩溃 | DISSOLVED | 路径是类型化配置常量，非 prose 字符串 |
| INV-2 Monitor 前台 tail 事件流 | 事件源丢失 | TRANSFORMED | 事件来自类型化队列 / agent→engine API，无 tail |
| INV-3 nohup+disown 生命周期 | daemon 自杀 | DISSOLVED | 引擎是受管 Bun 服务进程，非 nohup Bash |
| INV-4 禁 isParentAlive 自杀 | ppid 退出即自杀 | DISSOLVED | 无 ppid 耦合生命周期 |
| INV-5 daemon 版本 tag / 防陈旧安装 | 项目留旧版 daemon | TRANSFORMED | 单一引擎二进制 + 版本化 build；无逐项目 daemon 拷贝 |
| INV-6 ESM 用 .cjs | CJS/ESM 冲突 | DISSOLVED | 引擎是单一 TS/Bun 代码库，不注入 .js |
| INV-7 tail -n 0 不重放 | 伪事件重放 | TRANSFORMED → **ENG-4** | 事件消费由持久 offset/检查点保证幂等 |
| INV-8 spawn 前置 In Progress | 跳过状态、无法追踪 | **PRESERVED → ENG-1** | 状态推进必须先于 spawn（状态机 + cap 幂等） |
| INV-9 后台 Agent 派发 | 内联实现破坏协调 | **PRESERVED → ENG-2** | 执行经隔离 worktree 的 worker；引擎拥有 spawn |
| INV-10 merge 退出码被捕获 | 管道掩盖失败 | **PRESERVED → ENG-3** | 类型化 GitOperations，merge 错误不被掩盖 |
| INV-11 merge 后查 MERGE_HEAD / 未合并 | 冲突被标 Done | **PRESERVED → ENG-3** | 冲突检测 → `needs-human` |
| INV-12 heartbeat 在 Monitor 层过滤 | 空闲噪音干扰 dispatch | DISSOLVED | 无 heartbeat/tail 噪音；类型化事件 |
| INV-13 stopStaleMon 先 TaskStop | 孤立 Monitor 重复派发 | TRANSFORMED | 单引擎实例受管；无陈旧 Monitor 进程 |
| INV-14 冷启动 OFFSET 置 EOF | 重放历史耗时 | TRANSFORMED → **ENG-4** | 恢复是类型化检查点（持久 offset 在事件存储） |
| INV-15 child-done gate 在 Awaiting Children | 终态后仍复发 | **PRESERVED → ENG-5** | 父对账 gate 在 pipeline state，非永久终态 |

### 引擎安全不变量（ENG-*）

以下五条是从 PRESERVED/TRANSFORMED 类提炼的引擎必须保证的不变量。**ENG-1…ENG-3
即 ADR-011 D-7 所称"安全关键子集"，E0 必须落地并测试；ENG-4/ENG-5 为完整集，E3 折入。**

#### ENG-1: cap 幂等 — 任何 phase 执行前必检 cap 标记（保留 INV-8）

- 引擎在对 `(pipeline, state)` 派发 handler 前，必须检查 Task 的结构化 `CapMarker[]`
  （ADR-011 D-1）。已完成的 phase 重启后**绝不**二次执行。
- 状态推进（如旧 `Basic: In Progress`）必须先于 worker spawn 持久化，使重入点可观测。
- 取代旧 INV-8 的 prose 协议；现为状态机 + `cap` 字段的类型保证。

#### ENG-2: worktree 隔离 — 每个 spawn 在独立 worktree（保留 INV-9）

- 每个被 spawn 的 Task 执行于自己的 `git worktree`，成功或失败都**保证清理**。
- 引擎拥有 spawn；worker 不内联在引擎进程内改主工作树。
- 取代旧 INV-9 的"后台 Agent + signal 文件"，现为引擎 spawn API 的契约。

#### ENG-3: merge 串行化 + 冲突即停（保留 INV-10 + INV-11）

- merge 经类型化 `GitOperations`，退出码/错误**不得被掩盖**（无管道吞码）。
- 一次只允许一个 merge（串行化锁），并发 advance 不能损坏主分支。
- merge 后必须检测冲突（`MERGE_HEAD` / 未合并文件）；有冲突则把 Task 转 `needs-human`，
  **绝不**标为成功终态。
- 这是"别把库改坏"的核心——引擎即将修改自己所在的库（E0 自举）。

#### ENG-4: 事件消费幂等 — 持久 offset 检查点（转化 INV-7 + INV-14）

- 引擎事件（`item-ready` 等，ADR-011 D-2）的消费由**持久 offset / 检查点**保证幂等；
  重启或冷启动**不重放**已 settled 的事件。
- 取代旧 tail `-n 0` / `OFFSET=EOF` 的 prose 约定，现为事件存储（gate-event log，
  ADR-011 D-4）内的类型化 offset。

#### ENG-5: 父对账 gate 在非终态（保留 INV-15）

- child-done 触发的父 epic 对账，必须 gate 在父处于"等待子节点"的 pipeline state，
  **而非永久终态**。父已达终态后不得复发对账，确保引擎可静默（fixpoint）。
- 取代旧 INV-15 的 `Awaiting Children` 字符串守卫，现为 pipeline state 谓词。

### 强制与测试

- **E0（MVD）**：必须实现并测试 **ENG-1 / ENG-2 / ENG-3**（即 ADR-011 D-7 安全关键子集）。
  对应 Epic BACK-600 AC#5。
- **E3（pipeline 泛化）**：把 **ENG-1…ENG-5 全部**折入引擎测试套件，
  细分 unit（逐条不变量）+ 集成（多 pipeline 并行）。对应 Epic BACK-603 AC#4。
- 断言载体：`scripts/tests/engine-invariants.test.sh`（待 E0 引擎运行时落地后建立；
  形态从 baime 的 grep-prose 升级为对类型化 core 的单测 + 必要的静态检查）。

## Consequences

- epicd 仓库内对"ADR-010"的引用就地可解析，不再悬空跨仓。
- 15 条历史回归类别中，9 条因机制更替而**消解**（不再需要持续审计），
  5 条收敛为引擎类型保证/单测（ENG-1…ENG-5），其中 3 条（ENG-1/2/3）是 E0 安全栏。
- baime 的 ADR-010 仍是**历史出处与原始证据**（15 次 fix commit 的归纳）；本 ADR 是其
  **引擎语境的诠释**，二者不冲突：baime 版约束旧 loop-backlog（soak 期仍存活），
  epicd 版约束引擎 core。
- 旧 loop-backlog 在 soak 期（至 E5 退役前）仍受 baime ADR-010 的 15 条约束；
  引擎自驱链路受本 ADR 的 ENG-* 约束。两套并存直到 E5 退役旧机制。

## Alternatives Considered

- **逐字复制 baime ADR-010 到 epicd**：被否。15 条都断言旧 daemon 的 prose/sed/grep
  与 SKILL.md 行，引擎里这些文件不存在，断言全部失效或语义错配。
- **只在引用处标注"见 baime ADR-010"**：作为过渡可接受，但 epicd 自驱 agent 读不到
  原文、且无法表达"哪些消解、哪些保留"的关键判断。被否为最终态。
- **不写 ADR，直接在 E0/E3 plan 内联不变量**：被否。安全栏应有稳定、可引用的契约
  文档，而非散落在 epic plan 里。

## References

- baime ADR-010（出处）：`/home/yale/work/baime/docs/adr/ADR-010-daemon-invariants.md`
- baime 不变量测试：`/home/yale/work/baime/scripts/tests/daemon-invariants.test.sh`
- baime 讨论记录：`/home/yale/work/baime/docs/discussions/2026-06-26-backlog-engine-fork-direction.md`（§D8/§③④/§15）
- 本仓 ADR-011 D-2（pipeline/事件）、D-4（gate-event log）、D-7（E0 安全关键子集）
- 相关 Epic：BACK-600（E0，ENG-1/2/3）、BACK-603（E3，ENG-1…5 全集）
