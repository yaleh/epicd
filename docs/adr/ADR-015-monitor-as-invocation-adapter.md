---
adr: "015"
title: "Monitor 是调用适配器：计费受迫下 `claude -p` 的替身，非调度/执行机制"
status: Proposed
date: 2026-07-05
applies-to:
  - "plugin/scripts/scan-loop.cjs"
  - "src/engine/scan.ts"
  - ".codex/skills/epicd-run/**"
  - "docs/uml/runtime-deployment.puml"
  - "docs/uml/use-case-model.md"
enforcement: semantic
stage: [proposal, plan]
lint: null
depends-on: ["ADR-011", "ADR-013"]
ports: "无直接 baime 对应；厘清 baime Monitor+scan-loop 在 epicd 中的定位（runtime-deployment.puml 的 spawn seam → invocation seam）"
generalizes: "use-case-model.md 漂移表『Monitor worker 歧义（横跨 supervisor+driver+worker）→ 拆分使用』"
---

# ADR-015: Monitor 是调用适配器 —— `claude -p` 的计费替身

**Status**: Proposed（草案，2026-07-05）
**Date**: 2026-07-05
**Deciders**: Yale Huang
**Ports**: 厘清 baime Monitor+scan-loop 在 epicd 的定位
**Generalizes**: `use-case-model.md` 漂移表『"Monitor worker" 歧义 → 拆分使用』
**Realized by**: BACK-625

## Context

从整个 epicd 系统看，Claude Code Monitor 是一种**驱动 Claude Code 执行自然语言文本描述的任务**的机制。在执行段，每个任务应相互独立。

这本可以用 `claude -p "<task prompt>"` 实现——每任务一个 headless 进程，天然独立、并行、无状态。之所以改用 Monitor 机制，纯粹是因为 Anthropic 的计费限制：程序化/API-key 计量的 `claude -p` 规模使用被切断（见 References）。Monitor 是这个约束下的工程替代，**不是**架构上必要的调度或执行层。

`docs/uml/runtime-deployment.puml` 已把 supervisor / driver-per-pipeline / worker 三者拆开，并把 engine→worker 的接缝叫 "SPAWN SEAM"。但 `use-case-model.md` 漂移表同时记了一条未解决的歧义：

> **"Monitor worker" 歧义** —— 横跨 supervisor+driver+worker，自标"假定但未定义" → **拆分使用**

本 ADR 给出这条歧义的确定答案：Monitor 与 supervisor/driver/worker 三者**正交**，它是**调用接缝（invocation seam）的一种实现**。

## Decision

### D1: invocation seam —— 抽象签名

engine（driver）决定 *when / which* 任务运行；实际"运行一个任务"是一次 Claude Code 调用，抽象为：

```
invokeClaudeCode(taskPrompt, worktree) → CompletionResult
```

`runtime-deployment.puml` 的 "SPAWN SEAM" 正名为 **invocation seam**。它有两种实现：

| | 理想态（无计费约束） | 现实态（计费约束，今天） |
|---|---|---|
| 实现 | `claude -p "<自包含 prompt>"` | 一个常驻交互 seat 挂 Monitor 多路复用 |
| 触发 | 调用者主动 spawn 进程 | `item-ready` → stdout 事件 → session 收到 → spawn 背景 Agent |
| 独立性来源 | 进程隔离 + 独立 cwd | Agent 独立上下文 + 独立 worktree |
| 并行 | 天然多进程 | 单 seat 多路复用 |

**Monitor = 让一个交互 seat 冒充 N 个独立 `claude -p` 调用的多路复用适配器。** 它的职责是传输 + 扇出 + seat 存活管理，既非调度（driver/engine），亦非执行（spawned Agent）。

### D2: 四角色归位

scan-loop.cjs 今天把四个正交角色焊成一块。正确归属：

| 角色 | 职责 | 归属 |
|---|---|---|
| **supervisor** | 单例/存活：EPIPE 自愈、reap same-field peer、one-per-(sourceId,pipeline_id) | monitor 适配器 |
| **invocation transport**（真正的 "Monitor"） | 把 item-ready 当调用触发投给一个 seat；`---EVENT---` 分隔 | monitor 适配器 |
| **driver** | scan `(pipeline_id, phase, actor=machine ∧ 无 claim)` → item-ready | engine（已归位 BACK-614） |
| **prompt authoring** | 把任务变成自包含派发指令（prompt） | engine（BACK-625 搬离 scan-loop 的 renderEvent） |

### D3: prompt authoring 归 engine，不归适配器

engine emit 的自包含载荷 = 你要喂给 `claude -p` 的 prompt。把 prompt 渲染（renderEvent + 模板目录）留在 monitor 是**范畴错误**——等于 `claude -p` 自己伸手去模板目录改写你的入参。prompt 的作者是调度者（engine，它拥有 `phase → handler` 映射），调用者（monitor）必须对 prompt 内容 **agnostic**：它只按稳定机器键去重、整块透传，不解析、不重写。

这是 ADR-013『指令结晶』在调用面的落地：指令由每 tick 的磁盘代码生成、随包分发；不落在 LLM 一次性写就、会退化的 Monitor `description` 里，也不落在与引擎和分发包脱节的第三方模板 artifact 里。

### D4: swap-litmus（分层验收锚）

> engine 对一个 actionable 任务的输出（机器键 + 自包含载荷），必须足以驱动**任一**实现——Monitor 多路复用 seat **或**裸 `claude -p <载荷>`——而 engine 一行不改。

满足 swap-litmus ⇒ Monitor 从"焊死的执行机制"变为"可替换的调用适配器"。计费松绑后可换 `claude -p` 进程池、engine 零改动。这是 D1–D3 是否落地正确的唯一判据。

### D5: 适配器专属机械不得上移进 engine

`claude -p` 是 **push**：调用者主动 spawn 并 await，调度环握在调用者手里。Monitor 是**反转控制 / pull-ish**：engine 无法调用 session，只能 emit 事件、由碰巧在线的 session 接收；session 随 `/clear` 生灭，投递不可靠。

因此 Monitor 适配器必须补两样 `claude -p` 不需要的机械：

- **电平再浮现 + 自清除谓词**（ADR-009 血统 / 本仓自清除）——补偿不可靠投递（消息获取层，内存态、可 reset）。
- **磁盘执行守卫 flock + `.caps`**——补偿"同一事件可能被多个/重启后的 seat 收到"（任务执行层，durable）。

这两样是"在反转控制、单 seat、session 易逝信道上模拟一次可靠调用"的**代价**，是 Monitor 适配器的专属属性，**不是**抽象 driver 的属性。它们必须留在 scan-loop，绝不进 engine。engine 只按 `(pipeline_id, phase→machine-actor)` 谓词产 emit——一个 `claude -p` 实现会改用进程池管理取代这两样，而不触碰 engine。

由此推出**消息获取 vs 任务执行**必须解耦（BACK-625 层 1 vs 层 3）：前者内存、随适配器生灭；后者磁盘、durable。二者仅通过看板执行状态喂给 engine 扫描来协调（自清除桥）。

## Consequences

- `use-case-model.md` 漂移表『Monitor worker 歧义』获终解：Monitor ≡ invocation adapter，与 supervisor/driver/worker 正交。漂移表与 runtime-deployment.puml 的 "spawn seam" 应更新为 "invocation seam" 并标注 D1 两种实现。
- BACK-625 的目标从"清理模板路径 bug"升级为"让 monitor 可被 `claude -p` 替换"——swap-litmus（D4）成为其验收锚。
- 未来若做 `claude -p` 驱动（自托管 / API-key 部署 / 计费松绑），只替换 invocation seam 的实现，engine/driver 不改；适配器专属机械（D5）换成进程池管理。
- 明确禁止把存活/单例/自清除逻辑"顺手"挪进 engine（常见的错误抽象方向）。

## Alternatives Considered

- **把 Monitor 当 driver / 调度器**：混淆 when/which（engine 的职责）与 how-to-invoke（适配器的职责）；使 engine 绑死单一调用形态，`claude -p` 无法替换。否决。
- **prompt 留在 Monitor 模板（baime 现状）**：baime 无引擎，模板是其唯一合理载体；epicd 有引擎，模板成为与引擎/分发包脱节的第三 artifact（本会话路径 bug 的根）。否决——见 ADR-013 D3 + BACK-625。
- **指令内嵌 Monitor `description`**：description 由 LLM 在 arm 时写一次、compact 后凭记忆重写→退化（baime ADR-013 记录的实测故障）。否决。

## References

- Anthropic 切断程序化 `claude -p` 规模使用：https://www.reddit.com/r/ClaudeCode/comments/1tccd7c/its_official_anthropic_pulled_the_plug_on_all/
- `docs/uml/runtime-deployment.puml`（spawn seam / supervisor·driver·worker 部署图）
- `docs/uml/use-case-model.md`（漂移表『Monitor worker 歧义』、actor『Claude Code Monitor host』）
- ADR-011（workitem schema / pipeline contract；D-2.1 结构进数据、逻辑进 handler）
- ADR-013（结晶/熔融载体分配律；D3 指令结晶）
- BACK-614（driver/scan 归位 engine，scan 发机器行）、BACK-625（prompt authoring 归位 engine，scan-loop 瘦身为纯传输 + swap-litmus）
