---
adr: "016"
title: "分解正交性检查清单：advisory 信号拦截非正交子任务切分"
status: Proposed
date: 2026-07-05
applies-to:
  - "src/harness/decomposer.ts"
  - "docs/adr/**"
enforcement: semantic
stage: [proposal, plan]
lint: null
depends-on: ["ADR-015"]
realized-by: ["BACK-626.1", "BACK-626.2", "BACK-626.3"]
---

# ADR-016: 分解正交性检查清单

**Status**: Proposed（草案，2026-07-05）
**Date**: 2026-07-05
**Deciders**: Yale Huang
**Realized by**: BACK-626.1（本文档）、BACK-626.2（decomposer.ts touches 交集检查）、BACK-626.3（cochange 信号迁移）

## Context

epic 分解成 basic task，本应把一个高维搜索问题分解成 d 个正交坐标：子任务之间不共享可写状态，互相独立可并行执行。但"分解是否正交"目前完全没有可测判据，只能等实现阶段冲突/反复重修发生后才被事后确认——代价是数周、跨仓库的重复劳动。两条已发生的具体链条：

**epicd：Monitor / prompt-authoring 边界反复重划**
- BACK-614 把 `renderEvent` + 模板渲染定为"scan-loop 单一渲染器"，把 prompt-authoring 放进 Monitor/transport 层。
- ADR-015 推翻这一定位：prompt-authoring 属于 engine（拥有 `phase → handler` 映射），Monitor 只应是调用适配器（invocation seam），对 payload 内容 agnostic。
- BACK-625 据此把整个模板渲染层从 `scan-loop.cjs` 删除，改由 `engineDispatch()` 产出自包含载荷。
- 三个任务本应是一次分解决策，实际横跨了两次"发现边界划错了"的返工。

**baime：daemon 生命周期反复局部修复（TASK-206→210）**
- TASK-206：修 Monitor-singleton bug。
- TASK-208：发现 TASK-206 的修复本身是 no-op（bash CLI vs harness 工具混淆）。
- TASK-209：为同类回归专门提议 mock harness 测试框架。
- TASK-210：才最终承认"TASK-206/207/208/209 反复补救同一根因——daemon 是与 Monitor 解耦的独立生命周期"，整体溶解 daemon，写入 ADR-012。

两条链条的共同结构：子任务/组件切分时被当作独立坐标，但实际耦合（Fisher 信息矩阵非对角元非零），只能靠事后反复打补丁才能发现和收敛。本 ADR 的目标是把这类耦合的发现**提前到分解阶段**，用低成本、非阻塞的信号先行暴露，而不是消灭所有非正交切分（那不可能）。

## Decision

### D1: touches 字段与兄弟交集检查

分解产出的每个子任务可声明 `touches: string[]`——预期读写的文件/模块路径列表（由分解 agent 在生成子任务时一并给出，不要求精确，允许过报）。

分解完成后，对所有兄弟子任务两两计算 `touches` 交集：

```
overlap(taskA, taskB) = touches(taskA) ∩ touches(taskB)
```

交集非空即视为一次"声明式重叠"信号，不论重叠文件数量。判定规则本身保持简单（集合交集），不引入路径通配符匹配或语义归一化——过度工程化交集判定本身，成本超过它要防止的问题。

### D2: 三级信号，按成本递增

| 层级 | 信号 | 成本 | 默认是否启用 |
|---|---|---|---|
| 1 | 声明式重叠（D1，touches 交集） | 极低，纯集合运算 | 是 |
| 2 | 历史 cochange 近似（D3） | 中，需扫 git 历史 | 是（分解时查询，非重新计算） |
| 3 | 语义相似度（agent 对子任务描述打分） | 高，需额外 LLM 调用 | 否，仅按需人工触发 |

第 1 层解决"这次分解声明的重叠"；第 2 层解决"这次分解没声明重叠，但历史上这些文件总是一起变"——即 Monitor/daemon 传奇那类"看起来独立、实际强耦合"的情况；第 3 层留给人工怀疑但前两层都没查到的场合，不做成分解流程的默认步骤。

### D3: cochange 信号的输入输出契约

供 BACK-626.3 实现，接口约定如下（不规定内部实现语言/数据结构，只规定边界）：

- **输入**：仓库路径 + 一组 `touches` 文件路径列表（按子任务分组）。
- **输出**：文件对的耦合分值（基于 `git log --name-only` 按 commit 聚合的共同修改频次近似），以及一个阈值判定结果——对每一对声明了 `touches` 的子任务，若其 `touches` 集合中存在跨集合的文件对耦合分值超过阈值，标记为"历史强耦合"，即使这次分解未声明直接交集。
- **阈值**：初始应可配置，不在本 ADR 里固定具体数值——首次实现（BACK-626.3）应以经验值起步并留观察窗口调整。
- **性能边界**：耦合分值计算允许缓存/增量更新，不要求每次分解都全量重扫仓库历史；具体缓存策略由 BACK-626.3 决定。

### D4: 执行强度 = advisory，不设阻塞门禁

D1/D2 产出的重叠信号，写入 epic 的一份非阻塞报告（例如 note/评论，具体载体由 BACK-626.2 实现决定），供人工在 dispatch 前查看。**不阻塞分解流程，不阻塞 dispatch，不计入任何任务的 DoD。**

理由：
- 误报代价 > 漏报代价。声明式重叠和历史耦合都只是"可能耦合"的代理信号，不是耦合的证明——touches 声明可能过度保守，历史共变也可能是巧合（例如两个文件总在同一次全仓格式化中一起变化）。若做成硬门禁，误报会直接卡住分解/dispatch 流程，代价高于它防止的问题。
- 漏报有兜底。residual-observability 已有的 repeated-fix count / crystallization frontier 信号，在本检查清单漏报的情况下依然能在事后抓到问题（正是 baime TASK-210 的发现路径）。本 ADR 的价值是把发现时点提前，而不是替代事后信号。

### D5: swap-litmus 推广为强制小节

ADR-015 D4 给出一个具体的正交性验收范式：

> engine 对一个 actionable 任务的输出，必须足以驱动**任一**实现——Monitor 多路复用 seat **或**裸 `claude -p <载荷>`——而 engine 一行不改。

本 ADR 把这个模式推广为规则：**任何划分组件边界的未来 ADR，正文必须包含一条 swap-litmus 式验收标准**——即"若把边界一侧换成另一实现，边界另一侧应零改动"这一断言的具体化版本，而不是停留在"职责应该分开"的定性描述。

示例（沿用 ADR-015 的实例，供后续 ADR 撰写时参照格式）：

> **swap-litmus**: 把 X 组件换成另一实现后，Y 组件不应改动一行代码；能验证这一点的最小测试是 ______。

若一条 ADR 无法给出这样一条判据，说明它划的边界可能还停留在"直觉上应该独立"，尚未证明正交，应在 Alternatives Considered 中明确记录这一局限。

## Consequences

- BACK-626.2 必须实现 D1（touches 字段 + 交集检查），字段名与判定规则以本 ADR 为准，不得自行发明。
- BACK-626.3 必须实现 D3 定义的 cochange 契约，输入输出边界以本 ADR 为准。
- 未来任何划分组件边界的 ADR（如未来的 driver/handler/adapter 拆分决策）必须包含 D5 要求的 swap-litmus 小节，否则视为文档不完整。
- 本机制不消灭非正交分解，只降低其被隐藏到实现阶段才发现的概率；repeated-fix/crystallization 类事后信号仍需保留，作为本机制的兜底而非被替代。

## Alternatives Considered

- **阻塞式门禁**（交集非空则拒绝分解或 dispatch）：否决。声明式重叠和历史耦合都是代理信号而非耦合的证明，误报会直接卡住流程；代价高于它防止的问题（见 D4）。
- **语义相似度作为默认层**：否决。每次分解都跑一次额外 LLM 打分，成本与分解本身相当，且效果尚未被验证优于更便宜的 D1/D2 组合；保留为按需人工触发的可选层。
- **只依赖事后 repeated-fix / crystallization 检测，不做分解阶段的提前信号**：否决。这正是 BACK-614→ADR-015→BACK-625 和 baime TASK-206→210 两条链条实际发生的路径——问题只有在实现完成、反复打补丁数周后才被发现。本 ADR 的存在理由就是把发现时点提前到分解阶段，即使只能做到 advisory 级别。

## References

- `docs/adr/ADR-015-monitor-as-invocation-adapter.md`（swap-litmus 范式的出处，D4）
- `backlog/tasks/back-625 - engine-产出自包含派发指令，scan-loop-瘦身为纯传输：解耦消息获取与任务执行.md`
- `backlog/tasks/back-622 - decomposer.ts-writes-phase-without-status-causing-epic-status-phase-desync-BACK-601-shaped.md`
- `backlog/tasks/back-626 - 分解正交性检查清单：从方法论到-decomposer-门禁与-cochange-信号.md`（本 ADR 所属 epic）
- baime `backlog/tasks/task-148 - Epic-skill-库本征维度度量原型（cochange-依赖图近似-Fisher-非对角结构）.md`（cochange/Fisher 非对角近似原型出处）
- baime TASK-206 → TASK-210（daemon 生命周期反复局部修复，最终溶解为无状态 scan-loop，见 baime `docs/adr/ADR-012`）
