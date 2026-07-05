# BAIME 实验：轻量不动点驱动开发（Lightweight Fixpoint-Driven Development, LFDD）

本文档回填（backfill）此前两轮已发生的迭代（BACK-628、BACK-602）为完整 BAIME 结构，
并为后续轮次（BACK-603 起）建立标准 BAIME 执行框架。回填只补文档与打分，
**不重跑任何已经真实执行过的工程动作**。

## 领域

epicd 引擎自身的大颗粒度任务（epic）从 proposal 推进到 `Epic: Done` 的收敛方法——
即"引擎如何自驱、自审、自证地把一个 epic 做完，而不依赖人工逐点核对"。

## 双层目标

- **Instance goal（每轮具体）**：当轮目标 epic 达到 `Epic: Done`（经真实
  `engine evaluate`，非人工改状态），且经至少一轮 fresh-context 审计确认
  **零新增阻塞项**。
- **Meta goal（跨轮）**：提炼并验证一套可在 epicd 项目内反复复现、未来可能
  迁移到其他项目的"大颗粒度任务不动点收敛方法"（LFDD），使其本身成为
  可文档化、可教学、可迁移的方法论产物——而不只是一次性的执行习惯。

## Baseline（迭代 0 之前的状态）

在 BACK-628 之前，epic 级任务的完成缺三样系统性机制：
1. **合并前的独立门禁复核**——`engine complete` 之前，child 完成与否依赖
   agent 自证（status/dod 自己改），无强制重跑。
2. **fresh-context 对抗式审计**——完成声明缺一个"无实现记忆的人/agent
   重新核验"步骤。
3. **loop-until-dry 收敛判据**——"何时算真的做完"没有显式规则。

证据：BACK-622（decomposer 写 phase 不写 status 导致状态脱节）、BACK-631
（phase=ready 误判 Epic 为 basic-ready）、BACK-634（decompose 出的 child
从不带结构化 dod，`engine complete` 恒路由 needs-human）——这三个引擎结构性
bug 都是**历史性地被动发现**（用户撞见/后续任务里踩坑），而非被一个内建于
epic 完成流程中的系统性审计步骤主动挡下。这正是 LFDD 要补的空。

## 方法论（Codify 产物：本方法目前的完整定义）

标准执行步骤（对任意目标 epic 重复）：

1. **Decompose**：`engine decompose`（或人工评审其提案）把 epic 切成
   PR 粒度（≤~2000 行）的 child task，每个 child 声明结构化 `dodGates`
   （BACK-634 修复后，decompose 具备声明能力；不声明则该 child 永远
   路由 needs-human，是有意为之的安全默认值）。
2. **执行**：每个 child 走 `handle-basic-ready.sh` 认领 → 真实 git
   worktree → 一个 background Agent 独立实现（不得自证 status/dod，只能
   `--append-notes`）→ 完成信号 → `engine complete --worktree`——**独立
   在 worktree 里重跑结构化 dod gate**，从不信任 agent 自证（ENG-8）。
3. **Evaluate**：全部 child 落地后，对 epic 运行 `engine evaluate`
   （非人工改状态）收口为 `Epic: Done`。
4. **Fresh-context 审计**：派一个**无实现记忆**的独立 agent，要求：
   - 不信任任何"已完成"声明，自己重跑 tsc/check/test。
   - 做负控（negative control）：构造对抗性输入验证声称的保证是否真的
     成立，而非只读测试名称。
   - grep 死代码/未用导出、TODO/FIXME/HACK 扫描。
   - 报告具体 file:line + 严重度，或明确给出"零新阻塞项"结论。
5. **迭代规则（loop-until-dry）**：
   - 活风险/HIGH → 当轮就修。
   - 范围超出本轮 → 归档 follow-up task（不为收敛而扩大本轮范围——
     呼应 CLAUDE.md 的任务颗粒度纪律）。
   - nitpick → 顺手清或明确标注不处理。
   - 重复第 4 步，直到某一轮审计给出**零新阻塞项** → 宣布该 epic 达成
     不动点。

与完整 BAIME 的差异（有意简化，非遗漏）：
- 不设 Meta-Agent 能力清单/agent 集合演化（`A_n`/`M_n`）——本方法目前
  没有专职 subagent 分工，执行 agent 与审计 agent 都是通用背景 agent，
  区别只在"是否共享实现记忆"。
- 不设置显式 `V_instance`/`V_meta` 双阈值收敛判据作为**阻塞发布**的门槛——
  该判据现在被引入用于**回顾性评估与跨轮比较**，但"零新阻塞项"仍是
  实际推进/收口的唯一硬性判据。

## 执行方式（iteration-2 起）

iteration-0/1 由主会话直接执行全部实现/审计/文档撰写，导致主会话上下文
随实现细节线性累积（BACK-602 完成后即出现会话中断迹象）。iteration-2
起改为三层委托：主会话仅做决策，epic-driver agent（独立上下文）承担
decompose/实现/合并/评估/审计全流程并只返回压缩报告，scribe agent
（独立上下文）负责撰写本目录下的 BAIME 文档。详见
[context-isolation-plan.md](./context-isolation-plan.md)。

## 迭代索引

| # | 目标 | 状态 | V_instance | V_meta |
|---|---|---|---|---|
| 0 | BACK-628（自审计 epic：达成自托管不动点） | 收敛 | 0.86 | 0.47 |
| 1 | BACK-602（E2：结构化 gate-event log） | 收敛 | 0.94 | 0.59 |
| 2 | BACK-603（E3：pipeline-as-data 泛化） | 计划中，见 [ITERATION-PROMPTS.md](./ITERATION-PROMPTS.md) | — | — |

详见 [iterations/iteration-0.md](./iterations/iteration-0.md)、
[iterations/iteration-1.md](./iterations/iteration-1.md)。

## 收敛状态（实验整体，非单个 epic）

**未收敛**（V_meta 0.59 < 0.80 阈值；completeness 分量仍偏低——本文档
是该缺口被指出后的第一次补救，但只有 2 个数据点，可迁移性证据仍薄）。
详见 iteration-1 的 Gap Analysis 与本文档旁的 ITERATION-PROMPTS.md。
