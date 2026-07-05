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

## 三层委托架构

### 第一层：主会话（编排者）

每轮迭代只做三件事：
1. 决定下一个目标 epic。
2. 派发**一个** epic-driver agent（**前台**，见下方"已发现的约束"），把
   该轮在 `ITERATION-PROMPTS.md` 里定义的执行 prompt 原样交给它。
3. 收到 driver 返回的压缩报告后，决定是否派发 scribe agent、是否继续
   下一轮、是否需要人工介入。

### 已发现的约束：后台 agent 不能再派发子 agent

首次尝试用 `run_in_background: true` 派发 epic-driver 时，agent 被系统
终止（"后台 agent 内无法再创建子 agent"）——**嵌套 Agent 调用（driver
自己再派发 child-implementation agent / 审计 agent）只在 driver **前台**
运行时才被支持**。因此 epic-driver 必须以前台（阻塞）方式派发，主会话
会在其运行期间同步等待。

这**不影响**本方案的核心目标（隔离上下文，而非隔离并发）：无论前台/
后台，子 agent 内部的工具调用、推理过程、中间产出**都不会**进入主会话
的上下文——只有它最终返回的那条压缩消息会。前台只是意味着主会话在这
期间不能同时做别的事，纯粹是并发损失，不是上下文隔离失效。

主会话本身不再：Read 大段源码、跑测试套件、调试 Edit、撰写审计 prompt
细节、撰写 iteration-N.md 全文。

### 第二层：epic-driver agent（独立上下文，承担本轮几乎全部实现细节）

一个 `general-purpose` agent（完整工具集，含 Agent/Monitor/Bash/Edit），
在自己的上下文里独立跑完标准 LFDD 步骤：
- `engine decompose` 提案评审 → 对每个 child 再派发一个子 agent
  （worktree + 实现，沿用既有 `handle-basic-ready.sh` + Monitor 等待
  完成信号的模式，只是这层嵌套现在在 driver 内部，而非主会话）。
- 每个 child 的 `engine complete --worktree` 独立复核合并。
- 全部落地后 `engine evaluate` 收口 epic。
- 派发第一轮 fresh-context 审计子 agent，处理其发现（当场修/归档
  follow-up）。
- 派发第二轮独立 fresh-context 审计子 agent，确认零新阻塞项。
- **只在最后**，把整轮压缩成一份结构化报告返回给主会话。

所有大段代码读取、测试输出、调试来回，都消耗在 driver 自己的上下文里，
driver 结束后连同其上下文一起被丢弃——主会话不受影响。

**压缩报告 schema**（driver 必须返回的唯一内容，控制在几百字以内）：

```
epic: <id>, 最终状态: Epic: Done / needs-human
children: [{id, commit, merge_commit, needs_human次数, 原因(门禁生效/操作失误)}]
新发现的引擎结构性bug: [{id, 一句话描述}]
审计轮1发现: [{severity, 一句话, 处理方式(当场修/归档为follow-up)}]
审计轮2结论: 零新阻塞项 / 仍有发现(列出)
归档的follow-up: [BACK-xxx, ...]
量化数据(为 effectiveness 打分用): 墙钟耗时、needs_human 总次数、
  审计发现数按 severity 分布
```

### 第三层：scribe agent（独立上下文，专门产出 BAIME 文档）

主会话拿到压缩报告后，**不自己撰写** `iteration-N.md`（这一步正是
iteration-1 回填时把主会话撑爆的动作）。而是派发一个轻量 agent，把
"压缩报告 + 已固定的打分 rubric（与 iteration-0/1 相同的四分量：
gate_integrity/defect_signal/audit_cleanliness/scope_discipline 之于
V_instance；completeness/effectiveness/reusability/validation 之于
V_meta）"喂给它，让它自己：
- 按 10 节结构写 `iterations/iteration-N.md`。
- 更新 `README.md` 的迭代索引表与收敛状态判断。
- 只向主会话返回一行：`iteration-N.md 已写入，V_instance=x.xx，
  V_meta=x.xx，收敛状态：未/已收敛`。

## 与 iteration-0/1 执行方式的差异

| | iteration-0/1（旧） | iteration-2 起（新） |
|---|---|---|
| 决策 | 主会话 | 主会话 |
| 实现 + 合并 + 评估 | 主会话直接跑 | epic-driver agent（独立上下文） |
| fresh-context 审计 | 已经是独立 agent（这部分沿用） | 仍是独立 agent，但由 driver 派发，不由主会话直接派发 |
| BAIME 文档撰写 | 主会话直接撰写全文 | scribe agent（独立上下文） |
| 主会话上下文增长 | 随实现细节线性累积 | 每轮只增加一份压缩报告，理论上近似常数 |

## 执行清单（每轮套用）

1. 主会话读取 `ITERATION-PROMPTS.md` 中对应轮次的执行 prompt，原样
   传给 epic-driver agent（**前台**派发，因其需要自行嵌套派发 child/
   审计 agent——后台模式不支持嵌套，见上）。
2. 前台等待其返回压缩报告（本步骤会阻塞主会话，为已知、接受的代价）。
3. 收到压缩报告后，评审是否有需要人工决策的项（如 driver 建议某发现
   该归档还是当场修，若不确定可在报告里标注留给主会话判断）。
4. 派发 scribe agent，传入压缩报告 + 打分 rubric，产出
   `iterations/iteration-N.md` + 更新 `README.md`。
5. 主会话读 scribe 的一行确认，决定是否发起下一轮。

## 局限与后续观察点

- 本方案假设子 agent（含嵌套的 driver→child-implementation-agent）
  本身工具集足够（`general-purpose` 类型含 `Agent`/`Monitor`），可在
  自己上下文内再次委托，不需要主会话介入嵌套调度。
- 若某一轮 driver 自身上下文也因为 child 数量过多而膨胀（例如一个
  epic 被拆成远超 2-3 个 child），下一步可考虑让 driver 把"逐 child
  等待完成"这部分也压缩为定期轮询摘要，而非在自己上下文里保留每个
  child 的完整实现讨论——但这是否必要，留待观察 BACK-603 这一轮
  driver 自身的上下文增长情况后再决定，不预先设计。
