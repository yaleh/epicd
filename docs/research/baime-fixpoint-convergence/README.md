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
   若合并阶段路由 needs-human，先做**根因分类**再决定下一步（iteration-3
   新增子步骤）：区分"真实结构化 DoD 门禁生效拦下代码问题"与"操作失误"
   （例如 board 任务 markdown 是主 repo 里的 untracked 遗留文件，与
   worktree 分支各自新增同一路径，导致 `git merge` 在三方合并前就以
   untracked-file-would-be-overwritten 中止——dodResults 本身可能早已
   通过）；后者手工诊断修正后仍需独立重跑全部 DoD gate 才可收口，且
   应归档为独立引擎缺陷 follow-up（而非视作方法论信号），不要把操作
   失误误计为"门禁抓到真问题"。
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

### 轻量路径（Basic task 直跑，无需 decompose）

LFDD 真正的派发颗粒度单位从来不是 Epic，而是 **Basic task**（见下方
"派发颗粒度规则"一节）。Epic 只是"多个 Basic task 需要协调时"的编排
外壳——decompose、`engine evaluate`、强制双轮审计、scribe 撰写
`iteration-N.md`，这些都是**因为有多个 child 需要协调才需要**的额外
机制。当目标本身就是一个原子 Basic task（无 children，符合 CLAUDE.md
的任务颗粒度纪律）时，可以砍掉整个 Epic 层脚手架，只保留核心骨架：

1. `task edit <id> -a @{your-name}`（按需加 `--dod-gate`）——不需要
   `engine decompose`。
2. worktree 隔离 + 主会话直接派发**一个**独立实现 agent（不得自证
   status/dod，只能 `--append-notes`）。
3. `engine complete --worktree`——独立在 worktree 里重跑结构化 DoD
   gate 并加锁合并，从不信任 agent 自证（ENG-8）；若路由 needs-human，
   仍要做标准步骤 2 的根因分类（真实门禁生效 vs 操作失误），这一子
   步骤不因轻量而省略。
4. 是否加一轮独立 fresh-context 审计按风险条件触发（触碰 engine/core
   逻辑或安全相关改动→应做至少一轮；纯文案/低风险改动→可省略），但
   **这个决定本身必须显式做出并落地记录，不能只是心里想想**：`engine
   complete` 前，要么真的派发那一轮独立审计 agent，要么用
   `task edit <id> --append-notes "audit skipped: <原因>"` 写一条
   跳过理由。二者选一，禁止两者都不做就直接标 Done——BACK-649 正是
   反例：文档判定"应做"，实际既没跑审计也没记录跳过原因，降级因此完全
   不可见（见下方"已知偏差"）。这一条不因轻量而例外，是从该反例直接
   反推出的强制步骤，而非可选的仪式。
5. **不**为此单独撰写完整 `iteration-N.md`（含 V_instance/V_meta 十节
   打分）——那套重仪式是为验证方法论本身而加的科研成本，对单个 Basic
   task 强行套用会违背方法自己反复强调的 scope_discipline。改为在下方
   "轻量路径执行记录"表格登记一行即可。

首个真实样本：BACK-649（2026-07-05，墙钟约 21 分钟，详见下方执行记录表
及"已知偏差"小节）。这条路径此前只存在于一次对话回答中、未落回本文档——
本身就是 iteration-4 已指出的"同步维护方法论文档"缺口的一个更大号实例
（不是漏了一行字，是漏了一整条已经真实跑通的执行路径），此次补回。

与完整 BAIME 的差异（有意简化，非遗漏）：
- 不设 Meta-Agent 能力清单/agent 集合演化（`A_n`/`M_n`）——本方法目前
  没有专职 subagent 分工，执行 agent 与审计 agent 都是通用背景 agent，
  区别只在"是否共享实现记忆"。这不只是风格选择：见下方"平台约束"——
  本平台上 Agent 调用的深度上限本身就排除了"由一个 Meta-Agent 动态
  组建/演化一支可再向下派发的 agent 团队"这类架构，`A_n`/`M_n` 演化
  这层无论如何都无法在此平台上实现，因此索性不建模。
- 不设置显式 `V_instance`/`V_meta` 双阈值收敛判据作为**阻塞发布**的门槛——
  该判据现在被引入用于**回顾性评估与跨轮比较**，但"零新阻塞项"仍是
  实际推进/收口的唯一硬性判据。

## 平台约束：Agent 调用不支持嵌套派发（深度恰好为 1）

这是 iteration-2（BACK-603）实测发现的一条**平台级、非本项目/非本方法
特有**的硬约束，会持续影响本方法论今后每一轮的执行设计，因此在此单列
一节，而不只是作为 iteration-2 的历史叙述：

- **约束本身**：只有主会话能调用 Agent 工具派发子 agent；任何被主会话
  派发出去的 agent（无论以前台/同步方式还是后台/异步方式派发）自身都
  **不能**再调用 Agent 工具去派发下一级子 agent。派发深度恰好为 1，
  不能更深。
- **如何被发现**：iteration-2 最初尝试"主会话 → epic-driver agent →
  该 driver 自己再派发每个 child 的实现 agent + 两轮独立审计 agent"这一
  三层委托架构，意图让主会话只处理压缩后的编排决策、把实现细节的上下文
  开销转嫁给 driver。第一次以 `run_in_background: true` 派发 driver，
  该 agent 被平台直接终止（"killed"）。第二次改为前台/同步派发同一
  driver，这次没有被终止，但**仍然没有创建任何子 agent**——driver 自己
  的最终报告承认它用 ToolSearch 反复检索也找不到可用的 Agent 派发工具，
  于是把三个 child 的实现和"两轮独立审计"全部在自己同一个上下文里做完。
  这一情况被用户直接观察并指出（"并未创建新的 agent"），核实后确认：
  真正的约束是深度上限为 1，而不是此前误判的"前台可以嵌套、后台不行"。
- **对本方法论的直接影响**：
  1. **审计独立性保证的一个真实失效模式**：任何"独立审计"如果是由一个
     本身不能再派发 agent 的子 agent 自己模拟出的"第二轮"，都不具备
     LFDD 要求的"无实现记忆"独立性，即使它的报告写着"两轮独立审计"。
     这类自报结论在被主会话直接验证之前，不应被当作可信证据（iteration-2
     正是先发现这一失效、再由主会话直接派发真正独立的审计补救）。
  2. **委托架构的天花板**：任何"Meta-Agent 动态编排一组可再向下派发的
     子 agent"式设计在本平台上都不可行，必须退回**扁平两层模型**——
     主会话本身直接、以短小机械的编排调用，逐一派发每一个深度恰好为 1
     的独立子 agent（每个 child 一个实现 agent、每轮独立审计一个 agent、
     一个 scribe agent）。这就是下面"执行方式"一节描述的架构，也是
     [context-isolation-plan.md](./context-isolation-plan.md) 的核心结论。
  3. **可迁移性证据**：这条约束与 epicd 项目、与 LFDD 方法本身都无关——
     它对任何在本平台上运行的多 agent 编排实验都成立，因此被计入
     iteration-2 的 V_meta reusability 分量证据（见
     [iterations/iteration-2.md](./iterations/iteration-2.md)）。
  4. **派发颗粒度规则（由该约束直接推出，而非独立设计选择）**：
     一次 Agent 派发的正确颗粒度是**原子/Basic task**，绝不是 **Epic**。
     Epic 天然需要"编排者"角色——decompose 出多个 child、排定依赖顺序、
     跑多轮独立审计、判断 HIGH 当场修/范围外归档 follow-up——这些都是
     协调职责；在深度恰好为 1 的约束下，只有主会话能持有协调者角色，
     因为主会话派发出去的任何 agent 都不能再自己 decompose-再派发。
     "一个 agent 顶一整个 Epic"因此**做不到诚实的自我实现**（epic-driver
     的失败正是这个模式的真实案例：它被迫在自己内部假装完成了本该属于
     协调层的 decompose + 多轮独立审计）。反之，一个 Basic task（CLAUDE.md
     定义为"≈ 一个可评审 PR，≤~2000 行"）恰好是不需要内部再协调、
     一个不能继续嵌套派发的 agent 能在自己上下文内独立从头做到尾的
     最大单元。因此：**派发粒度 = 现有任务颗粒度纪律（Basic task）本身，
     而不是一个独立的、需要另外设计的"agent 分工"维度**——每个 child 一个
     实现 agent、每一轮独立审计一个 agent、一个 scribe agent，均对应一次
     Basic-task 量级的、自包含的、无需再派发的工作单元。代价：主会话
     仍需親自持有整个编排循环（decompose/complete/evaluate 这些短命令），
     无法把"协调本身"也下放出去——这是该约束下无法绕开的真实上限，
     已记在下方"局限与后续观察点"中。

## 执行方式（iteration-2 修正版：两层，非三层）

iteration-0/1 由主会话直接执行全部实现/审计/文档撰写，导致主会话上下文
随实现细节线性累积（BACK-602 完成后即出现会话中断迹象）。iteration-2
最初尝试引入三层委托（主会话→epic-driver agent→实现/审计子 agent）以
节省主会话上下文，但实测证明**不可行**：Agent 调用不支持任何深度的
嵌套派发——无论前台/后台派发，被派发的 agent 都不能再向下派发 Agent。
epic-driver 因此把本该独立的两轮审计做成了同一上下文里的自我复核，
不满足 LFDD 审计独立性的核心前提；该失效由用户直接观察捕获并纠正
（用户指出 driver 执行"并未创建新的 agent"，核实后 driver 自身报告
承认检索不到可用的 Agent 生成/子代理工具）。

修正后的架构为**两层**：不再设 epic-driver 中间层，主会话本身直接、
但只用短小机械的调用（`task edit`/`engine decompose`/
`engine complete`/`engine evaluate`）编排整个循环，把一切"重活"（读写
代码、跑测试、审计、撰写文档）分别下放给主会话**直接派发**的独立单次
子 agent——每个 child 一个实现 agent、每一轮独立审计一个 agent、以及
一个 scribe agent，全部深度恰好为 1，不再嵌套。详见
[context-isolation-plan.md](./context-isolation-plan.md)。

## 迭代索引

| # | 目标 | 状态 | V_instance | V_meta |
|---|---|---|---|---|
| 0 | BACK-628（自审计 epic：达成自托管不动点） | 收敛 | 0.86 | 0.47 |
| 1 | BACK-602（E2：结构化 gate-event log） | 收敛 | 0.94 | 0.59 |
| 2 | BACK-603（E3：pipeline-as-data 泛化 + exploration pipeline） | 收敛 | 0.93 | 0.66 |
| 3 | BACK-605（E5：引擎操作 skill 插件 propose/promote/inbox/run/init + Monitor/worker） | 收敛 | 0.92 | 0.65 |
| 4 | BACK-604（E4：人面 — 多车道 issue-list（主面）+ 内联 gate + auth） | 收敛 | 0.90 | 0.70 |

详见 [iterations/iteration-0.md](./iterations/iteration-0.md)、
[iterations/iteration-1.md](./iterations/iteration-1.md)、
[iterations/iteration-2.md](./iterations/iteration-2.md)、
[iterations/iteration-3.md](./iterations/iteration-3.md)、
[iterations/iteration-4.md](./iterations/iteration-4.md)。

## 轻量路径执行记录（非正式迭代，不计入 V_instance/V_meta）

上方"轻量路径"一节适用的原子 Basic task 样本。这里只登记结果，不产出
`iteration-N.md`，避免为小任务强行套用完整 BAIME 仪式。

| # | 目标 task | 日期 | 墙钟耗时 | needs-human 轮次（根因） | 结果 |
|---|---|---|---|---|---|
| 1 | BACK-649（engine decompose-apply 缺结构化 dod-gate） | 2026-07-05 | ~21 分钟 | 2——第1轮：操作失误，dod-gate 测试路径过滤器写错，`src/engine src/core` 匹配不到文件；第2轮：根因未查明，adjudicate 判定与 dodResults 实际结果不一致（结构化 gate 已全部通过，仍路由 needs-human），人工核实后手动 `git merge` + 手动改状态收口，未经 `engine complete` 自动合并路径 | Basic: Done（人工收口，非全自动） |
| 2 | BACK-653（All Tasks 主页化 + gate-inbox 下线） | 2026-07-06 | ~40 分钟 | 1——根因为操作失误/瞬态：`engine complete --worktree` 首次运行判定 needs-human，人工独立重跑全部 3 条结构化 DoD gate 均通过，且本地 `git merge --no-ff` 试合并无冲突；未改动任何代码直接重跑 `engine complete`，第二次即判定 done 并生成真实合并提交（`ee6551b`）——复现了 BACK-654 记录的 adjudicate/dodResults 不一致缺陷，但本次通过"重跑"而非人工绕过收口，走通了 `engine complete` 的可信路径 | Basic: Done（全自动收口，含独立审计轮，见下） |

### 已知偏差（BACK-649 样本复盘，2026-07-06 补记）

对照上方"轻量路径"流程逐条核对 BACK-649 的实际执行记录（会话
9e574105-536d-458c-bda9-15e17d37b299，2026-07-05T17:46-18:09 UTC），
发现以下与文档描述不完全一致之处，如实记录而非事后抹平：

1. **步骤1"设计"实为复用既有分析，而非本次现场产出。** 轻量路径流程
   本身并未要求一个显式的设计/plan 环节；BACK-649 之所以能安全略过这一
   步，是因为其任务描述在更早的会话里就已经写好了完整的根因分析（含
   `src/harness/dod-runner.ts`、`src/engine/complete.ts:113-119` 的
   文件/行号级定位）。这不能被推广为"轻量任务不需要设计"——只说明
   "若设计已经存在于任务描述中，可以复用而非重做"。若未来某个轻量任务
   的 description 只是一句话（没有预先分析），仍应视为需要现场设计的
   信号，而非默认直接派发实现 agent。
2. **步骤4"独立审计轮"被本文档标注为"触碰 engine 核心逻辑→建议至少
   一轮"，但 BACK-649 实际未跑，且未记录跳过原因。** 派发给实现 agent
   的 prompt 里也写了"推荐做一轮独立审计"，但最终仍直接标记
   `Basic: Done`，既没有真的派发审计 agent，也没有用
   `--append-notes` 写下跳过理由——降级因此完全不可见，只能靠事后翻
   会话记录才发现。这正是"轻量任务用了更弱的收敛保证但没有明确标注
   这一降级"的具体表现，不应被读作"轻量任务经验证明审计轮可以省略"。
   **修正**：上方步骤4已改为强制二选一（跑审计 / 写跳过理由），本条
   反例是该强制规则的直接来源。
3. **实际出现 2 轮 needs-human，而非最初记录的 1 轮**（已在上表更正）。
   第二轮根因至今未查明：`engine complete` 判定为 needs-human，但人工
   核实后发现结构化 DoD gate 结果（dodResults）实际全部通过——即
   adjudicate 逻辑与真实 gate 结果不一致。此轮最终靠人工 `git merge` +
   手动标记 done 收口，**没有**走通"从不信任 agent 自证、必须由
   `engine complete` 独立重跑并加锁合并"这一本方法反复强调的核心路径。
   应作为独立引擎缺陷排查（adjudicate 逻辑 vs dodResults 的不一致，
   跟踪于 BACK-654），而非算作"操作失误已修复、方法论已验证"的正面
   证据。

**结论**：BACK-649 验证了轻量路径骨架本身可以走通并收口，但同时暴露了
两处未被如实记录的降级（省略设计现场验证的必要性判断、省略已建议的
审计轮）和一处尚未定位的引擎缺陷（adjudicate 误判 needs-human）。在
积累更多样本之前，不应把"轻量路径已验证收敛"当作确定结论；上表的
V_instance/V_meta 也因此不计分（与轻量路径设计一致），仅作执行记录。

### BACK-653 样本复盘（2026-07-06）

对比 BACK-649 的两处降级，本次做了针对性修正，并留下新证据：

1. **审计轮未被省略。** BACK-653 涉及真实 web 路由/组件代码（App.tsx
   路由、SideNavigation、TaskList 排序逻辑），依上方步骤4判为"建议至少
   一轮"，并且确实派发了一个无实现记忆的 fresh-context 审计 agent：
   独立重跑 tsc/check/test、逐条核对全部 7 条 AC、对排序优先级做了真实
   负控（交换两个优先级常量、确认对应测试真的会失败、再复原）、检查了
   GateInboxPage 删除后的死代码引用、核对非目标未被违反。审计结论为
   "zero new blockers"。这是本方法第一次在轻量路径下把审计轮真正跑完
   并留痕，而非仅在 prompt 里"建议"。
2. **复现了 BACK-654 的 adjudicate/dodResults 不一致缺陷，但走通了
   `engine complete` 的可信路径而非人工绕过。** 第一次 `engine complete
   --worktree` 判定 needs-human；人工独立重跑 3 条结构化 DoD gate 全部
   通过，且本地试合并（`git merge --no-ff` 后 `git merge --abort`）确认
   无冲突。**未修改任何代码**，原地重跑同一条 `engine complete` 命令，
   第二次即返回 done 并生成真实合并提交（`ee6551b`）。这比 BACK-649 的
   处理方式（人工 `git merge` + 手动改状态，完全绕开 `engine complete`）
   更贴近方法论要求——但"重跑就好了"本身恰恰印证 BACK-654 描述的缺陷是
   真实存在的间歇性问题，而非一次性巧合；BACK-654 仍需被修复，不能因为
   "重试后能收口"就下调优先级或关闭。
3. **根因分类步骤（真实门禁生效 vs 操作失误）本次被显式执行，而非事后
   补记。** 判定为"操作失误/瞬态"的依据是：dodResults 独立复核全过 +
   本地试合并无冲突，排除了合并冲突路径；两条路径都被排除后，唯一剩下
   的解释就是 `adjudicate`/`dodResults` 之间存在 BACK-654 所述的不一致，
   而非本次代码有真实问题。

**结论**：BACK-653 是第一个完整走完"轻量路径 + 强制审计轮二选一"修正后
流程的样本，且首次以"独立复核 + 无冲突试合并 + 原地重跑"的方式处理
needs-human 误判，而非人工绕开 `engine complete`。仍然不构成"轻量路径
已收敛"的结论——样本量仍为 2，且两次都撞上了同一个未修复的引擎缺陷
（BACK-654），下一个样本应在 BACK-654 修复后进行，以检验"重跑即可"是否
仍然成立，或缺陷有更严重的复现条件。

### BACK-654 根因与修复（已修复，2026-07-06）

对 BACK-649/BACK-653 两次撞上的"adjudicate 判定与 dodResults 实际结果
不一致"缺陷做了根因定位，结论与上面两条复盘记录的猜测方向不同：

1. **`adjudicate()`/`completeTask()`/`runDoD()`（TS 路径）经确认逻辑正确。**
   `src/harness/dod-runner.ts` 只执行结构化 `task.dod[].text` 门禁；
   `src/engine/adjudicate.ts`/`src/engine/complete.ts` 对 `dodResults` 的
   判定与读取之间不存在不一致。分歧从未出现在 `adjudicate.ts` 里。
2. **真正的根因在 `plugin/scripts/complete-task.sh`：它独立重新实现了一遍
   DoD 判定逻辑，但读取的是渲染后给人看的 "Definition of Done:" 散文小节
   （`buildDefinitionOfDoneItems()` 生成，只反映 `task.definitionOfDoneItems`
   里人类可读的句子，从未反映过结构化的 `task.dod` 门禁），并把这段散文
   文本当作字面 shell 命令用 `bash -c` 执行。结构化 gate 全部通过、但
   散文句子不是合法 shell 时，脚本就会把任务误判为 needs-human；反过来，
   没有任何结构化 gate 时，只要散文句子恰好是合法且成功的 shell（例如
   碰巧包含 "true"），脚本也会误判为可以自动合并。
3. **修复方式**：在 `src/formatters/task-plain-text.ts` 新增只反映
   `task.dod[].text` 的机器可解析 "DoD Gates:" 小节（`buildDodGateLines()`，
   `- #N <cmd>` 格式，不带复选框，与散文小节的 `- [ ] #N` 格式在视觉上
   显式区分），并把 `complete-task.sh` 的 awk 锚点/抽取正则从散文小节
   改为指向这个新小节；同时补上"零结构化 gate → 必须路由 needs-human"
   的显式守卫，与 `dod-runner.ts` 的既有语义对齐。
4. **状态：已修复（fixed），跟踪于 BACK-654。** 新增两组回归测试
   （`src/test/task-plain-text-dod-gates.test.ts`、
   `src/test/complete-task-dod-gates-regression.test.ts`，后者用真实
   `bash plugin/scripts/complete-task.sh` 跑通完整合成仓库场景）在修复前
   均为红，修复后转绿；`adjudicate.ts`/`complete.ts`/`dod-runner.ts` 未被
   触碰。

## 收敛状态（实验整体，非单个 epic）

**未收敛**（V_meta 0.70 < 0.80 阈值）。5 个数据点
（0.47→0.59→0.66→0.65→0.70），轨迹非单调：iteration-3 出现
**双向微小下降**（ΔV_instance=-0.01，ΔV_meta=-0.01），iteration-4 则
出现**反向的双向变化**（ΔV_instance=-0.02，ΔV_meta=+0.05）——instance
层因 BACK-604 的 AC#8/#9 知情留白（不可机械核验、诚实标注未核而非虚假
勾选）与一次操作性合并障碍而略降；meta 层则因本轮首次真实验证了两条
此前只写在文档里、从未演练过的子步骤——"decompose 前置调研 + AC
具体化"与"needs-human 根因分类"——且均确认有效而回升。iteration-4
同时把 iteration-3 提前标注为"真实风险、尚未验证"的生命周期型
（server + Playwright）DoD gate 首次真实跑通（6/6 通过，跨 3 次独立
重跑非 flaky），把该风险点从"理论标注"转为"已验证"的正数据点；两轮
独立 fresh-context 审计再次证明价值，且证据强度高于以往——第二轮抓到
的是第一轮遗留的真实、可被利用的安全缺口（鉴权覆盖不全），而非仅一条
nitpick。与此同时，iteration-4 也如实记录了 completeness 分量的部分
未达标：本轮内部新识别的要点（BACK-649 workaround、build:css 阻塞合并
的操作性教训）仍是事后回填进文档，只有"把上一轮识别的要点提前落地为
检查点"这一"跨轮衔接"层面被验证有效，"轮内实时同步维护"仍未达成。
5 个数据点仍不足以判断是否进入稳定收敛区间，且跨项目可迁移性证据仍待
BACK-640（M2a 真实 baime 迁移）补齐；新增的引擎缺陷积压
（BACK-649，连同 iteration-3 的 BACK-642）应优先排期修复，而非继续
容忍 workaround 拖累未来轮次的 gate_integrity/effectiveness 分量。
详见 iteration-3、iteration-4 的 Gap Analysis 与本文档旁的
ITERATION-PROMPTS.md。
