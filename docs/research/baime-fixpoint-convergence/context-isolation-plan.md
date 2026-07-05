# 上下文隔离方案：三层委托执行 LFDD 迭代

## 背景 / 问题

BACK-602（iteration-1）实际执行完毕、审计收敛之后，实验在同一会话内继续
往 BAIME 回填方向推进时出现了会话中断迹象。根因判断：主会话把**全部**
具体操作都留在了自己的上下文里——读大段源码（`decomposer.ts`/`cli.ts`）、
跑全量 `bun test --parallel` 输出、来回调试 Edit 缩进、两轮 fresh-context
审计报告全文、以及后续 BAIME 回填的三篇长文档撰写——这些本该"用完即弃"
的过程细节，持续占用了本该只做编排决策的主会话上下文。

## 核心原则

**主会话的上下文里只应该出现"决策"和"压缩后的事实"，不应该出现
"过程"。** 所有 BACK-* 的具体实现、调试、测试输出、审计报告全文、
方法论文档撰写，都下放给独立上下文的子 agent 执行；主会话只接收
压缩后的结构化摘要。

## 已发现的硬约束：Agent 调用不支持嵌套（无论前台/后台）

**本节内容是对本文档早先版本的更正**——早先版本假设"后台 agent 不能
嵌套派发子 agent，但前台可以"。这个假设是错的。实测：把 epic-driver
改为**前台**派发后，它仍然**没有创建任何子 agent**（用户直接核实：
"Drive BACK-603 to LFDD fixpoint 并未创建新的 agent"）——driver 自己
的报告也承认它检索不到可用的 Agent 工具，最终把三个 child 的实现和两轮
"审计"都在自己同一个上下文里做完了。

结论：**子 agent 内部不能再调用 Agent 工具派发下一级子 agent，这是与
前台/后台无关的硬约束**——只有主会话本身可以派发 Agent（深度恰好为 1，
不能更深）。因此"主会话 → epic-driver → 若干 child/审计子 agent"这种
三层递归委托架构**在当前平台上不可行**，必须废弃。

## 修正后的架构：两层，主会话自己承担编排调度

不再存在"epic-driver"这一中间层。主会话本身就是唯一能派发 Agent 的
角色，因此主会话必须直接完成整个编排循环——但**编排循环本身的操作应该
保持短小机械**（`task edit`/`engine decompose`/`engine complete`/
`engine evaluate` 这类简短 CLI 调用，不读大段源码、不跑全量测试日志、
不在主会话里调试 Edit），把一切"重活"（读代码、写代码、跑测试、审计、
撰写文档）都放进**主会话直接派发的、彼此独立的单次 Agent 调用**里——
每个这样的 agent 都是叶子节点，自己不再向下派发。

具体分工（主会话直接派发，全部深度为 1）：
1. **每个 child 一个实现 agent**：主会话对每个 child 直接
   `Agent(...)`（同 BACK-602 时的做法），worktree 内独立实现，只能
   `--append-notes`，不得自证 status/dod，不得自己再派发 agent。
   主会话收到完成信号后自己跑 `engine complete --worktree`（短命令，
   不进入大段输出）。
2. **两轮独立 fresh-context 审计**：主会话直接派发两个**先后独立**的
   审计 agent（第二个对第一个的具体发现和修复细节没有记忆，只知道
   "复核刚应用的修复"）——这一点本来就是 BACK-628/602 一直在做的模式，
   不需要经过任何中间层，天然兼容"深度恰好为 1"的约束。
3. **scribe agent**：主会话直接派发,把压缩报告 + 打分 rubric 交给它,
   由它写 `iterations/iteration-N.md` + 更新 `README.md`。

**这与 iteration-0/1 的实际做法几乎相同**——真正的修正不是发明新的
委托层级，而是**放弃"发明一个能再往下派发的中间 agent"这个不可行的
设计**，退回"主会话直接、但每一步都尽量短小、把重活丢给独立单次
子 agent"的朴素模式。上下文隔离的收益来自"重活留在被派发的 agent 里,
不进入主会话",而不是来自"主会话本身完全不出现在编排循环里"。

## 派发颗粒度规则：agent = 原子/Basic task，绝不是 Epic

上面的"具体分工"之所以恰好落在"每个 child 一个 agent、每轮审计一个
agent、scribe 一个 agent"这个粒度，不是随意选择，而是深度恰好为 1
这条约束**直接推出**的结论：

- Epic 天然需要一个"编排者"角色——decompose 出多个 child、排定依赖
  顺序、跑多轮独立审计、判断 HIGH 当场修/范围外归档 follow-up。这些都
  是协调职责。深度恰好为 1 意味着只有主会话能持有协调者角色，因为主
  会话派发出去的任何 agent 都不能再自己 decompose-再派发去完成这些
  协调职责。
- 因此"一个 agent 顶一整个 Epic"这个粒度**做不到诚实的自我实现**——
  epic-driver 的失败就是这个模式的真实案例：它被迫在自己内部假装完成
  了本该属于协调层的 decompose 与多轮独立审计，产出了不可信的"两轮
  独立审计"结论。
- 反之，一个 Basic task（CLAUDE.md 定义为"≈ 一个可评审 PR，
  ≤~2000 行"）恰好是**不需要内部再协调**、一个不能继续嵌套派发的 agent
  能在自己上下文内独立从头做到尾的最大单元。
- 结论：**派发粒度 = 现有任务颗粒度纪律（Basic task）本身，而不是一个
  需要另外设计的"agent 分工"维度**。每次 Agent 调用应对应一次
  Basic-task 量级的、自包含的、无需再派发的工作单元；Epic 级别的编排
  循环本身永远留在主会话，不外包给任何单个 agent 调用。

**对已完成的 BACK-603 这一轮的影响**：由于 driver 无法真正派发子 agent,
它报告的"两轮 fresh-context 审计"实际上是**同一个上下文**做的自我复核,
不具备真正独立审计应有的"看不到自己盲点"防护（虽然它确实做了一个真实
的 AC#3 负控实验——插入违规 diff 观察测试报红、再 revert 观察转绿——
这一具体机械验证本身不依赖"是否独立上下文"，可信）。因此在为这一轮
计算 V_meta 的 validation 分量、或宣布该轮真正收敛之前，应该按修正后的
两层模式，由主会话**直接**再派发至少一轮**真正独立**的 fresh-context
审计，补上这个缺口，而不是照单全收 driver 自报的"零新阻塞项"结论。

## 执行清单（每轮套用，修正版）

1. 主会话：`task edit <epic> -a @claude`，`engine decompose <epic>`
   （短命令，不深入读 decompose 内部逻辑）。**decompose 前置**（BACK-604
   分析中发现的缺口，BACK-603 其实已经隐式做到但从未写成规则）：
   - 先有一份类似 BACK-603 的 file:line survey + 子任务切分草稿——不能
     直接对着裸 Description+AC 跑 decompose。
   - 把每条 AC 的验收判据都具体化到"可机械判断"的程度。若某条 AC 本质
     是过程性/一次性证明（例如"是否由引擎自身自驱交付"、"演示一次真实
     检出"这类，无法用一条 shell 命令重跑判断真假），必须先写清楚"用
     什么具体证据/日志判定它已满足"，否则多轮独立审计会在这类 AC 上
     各自给出不一致的主观判断，无法诚实宣布收敛。
2. 对每个 child：主会话直接派发一个实现 agent（worktree 内独立实现）→
   等完成信号 → 主会话自己跑 `engine complete --worktree`（短命令）。
   若 needs-human，诊断原因（真实门禁 vs 操作失误），必要时直接派发
   一个诊断/修复 agent，而非主会话自己深入读代码调试。
3. 全部落地后 `engine evaluate <epic>`。
4. 主会话直接派发第一轮独立 fresh-context 审计 agent。
5. 处理发现（当场修/归档 follow-up），必要时直接派发修复 agent。
6. 主会话直接派发第二轮独立 fresh-context 审计 agent（与第一轮无实现
   记忆共享）。
7. 零新阻塞项则收敛；否则回到第 5 步。
8. 主会话直接派发 scribe agent，传入压缩报告 + 打分 rubric，产出
   `iterations/iteration-N.md` + 更新 `README.md`。

## 局限与后续观察点

- 主会话在本模式下仍会比"完全委托给中间层"多一些上下文占用（每次
  Agent 调用的 prompt + 返回结果都会进入主会话上下文），但只要每次
  调用的返回结果本身被要求"压缩、结构化、不含完整实现细节"，这部分
  增量是有界的（每个 child/每轮审计一条，而不是随调试步骤线性增长）。
- 若某个 child 的实现本身极其复杂、需要"实现 agent 内部再拆解"，
  由于不支持嵌套派发，该 agent 只能在自己内部用非 Agent 手段拆解
  （例如自己顺序执行多个子步骤），无法真正并行委托——这是当前平台
  约束下的真实上限，不是本方案能绕开的。
- **非同步/生命周期型 DoD 验证尚未被验证过**（BACK-604 分析中发现）：
  现有 `complete-task.sh` 的 pre-merge DoD 重验循环假定每条 DoD 都是
  "一条能直接 `bash -c` 跑完的同步命令"。凡是需要"起后台 server → 等
  端口就绪 → 跑 Playwright e2e → 无论成败都 kill server"这种生命周期型
  验证（BACK-604 的 web UI e2e child 会需要），本项目至今没有任何一个
  Basic task 真正执行过——必须先把整个生命周期包装成单条幂等 shell 命令
  才能兼容现有机制不改脚本，这个包装方式本身没有先例可抄，是真实风险
  点而非已验证路径。
- **`bun run cli` 的 build:css 预步骤会弄脏工作区、阻塞合并**（BACK-604
  执行中反复撞见）：`bun run cli` 包装脚本每次调用都会先跑
  `build:css` 预步骤，重新生成 `src/web/styles/style.css`，即使内容无
  实质变化也会产生字节级 diff、弄脏工作区；这会导致后续 `git merge`
  （`engine complete` 内部）以"local changes would be overwritten by
  merge"中止，与结构化 DoD gate 本身是否通过无关。workaround：对任何
  需要干净工作区完成合并的 `engine complete`/`task edit` 调用，改用
  `bun src/cli.ts <args>` 直接调用（绕开 npm script 的 build:css 预
  步骤），并在每次重试前 `git checkout -- src/web/styles/style.css`
  丢弃该 diff。此问题在触及 `src/web/` 的任务中会反复出现（本轮同一
  child 内即复现 2 次以上），应视为已知操作性陷阱而非每次都当新问题
  诊断。
