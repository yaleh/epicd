# ITERATION-PROMPTS：LFDD 实验后续轮次执行计划

本文件是 BAIME 意义上的迭代提示模板,供 iteration-2（BACK-603）及之后
的轮次使用。每轮结束后,把实际执行记录 + 打分写入
`iterations/iteration-N.md`（沿用 iteration-0.md / iteration-1.md 的
10 节结构),并回填本文件顶部的"下一轮目标"。

## 当前状态（iteration-2 完成后回填）

- 完成轮次：iteration-0（BACK-628,V_instance 0.86 / V_meta 0.47）、
  iteration-1（BACK-602,V_instance 0.94 / V_meta 0.59）、
  iteration-2（BACK-603,V_instance 0.93 / V_meta 0.66）。
- 实验整体收敛判据：**未收敛**（V_meta 0.66 < 0.80）。
- iteration-2 的进展：首次建立量化 effectiveness 基线（decompose→全部
  child Done ≈28 分钟）；首次显式区分领域无关步骤与 epicd 特有细节；
  同时暴露一个新的 meta 层缺口——最初尝试的"主会话→epic-driver→子
  agent"三层委托架构被实测证伪（Agent 调用不支持任何深度的嵌套派发，
  无论前台/后台），导致 epic-driver 自证的"两轮独立审计"实际共享同一
  上下文，此失效由用户直接观察捕获，而非流程自身检测到。已修正为
  两层架构（主会话直接派发每一个 child 实现 agent / 独立审计 agent /
  scribe agent，深度恰好为 1），详见 `context-isolation-plan.md` 与
  `iterations/iteration-2.md`。V_instance 因此轻微下降（0.94→0.93），
  如实反映这次真实的流程失效，而非事后淡化。
- 已识别的 meta 层缺口（按优先级，iteration-2 后更新）：
  1. **completeness**——README.md 的"执行方式"章节在三层设计被证伪后
     未同步修正,直到 iteration-2 的 scribe 阶段才补上;"同步维护方法论
     文档"这条改进本身仍未完全落实,需要更强机制而非依赖记性。
  2. **validation / 流程自证能力**——"审计是否真的独立"目前缺乏机制化
     自检,完全依赖外部人工核查（本轮是用户直接观察）;下一轮候选:
     给审计 agent 的报告加入"自证独立性"的显式字段。
  3. **reusability**——样本增至 3 次,但仍全部在 epicd 自身;本轮新增
     的领域无关/epicd 特有分类、以及"Agent 调用不支持嵌套"这一平台级
     发现是目前最具体的可迁移性证据,但跨项目验证仍是空白。
  4. **effectiveness**——已建立第一个量化基线（墙钟时间）,但"每个
     child 触发 needs-human 的次数及原因"这项计划中的数据本轮因
     driver 轮审计独立性问题未能可靠采集,是一次部分未达成,应在
     后续轮次补上。

## Iteration 2：BACK-603（E3: pipeline-as-data 泛化 + exploration pipeline）

### Instance 目标（不变的硬性判据）
BACK-603 达到 `Epic: Done`（经真实 `engine evaluate`),且经至少一轮
fresh-context 审计确认零新增阻塞项。

### 本轮新增的 Meta 层目标（区别于 iteration-1，直接对应上面的 gap）
1. **同步维护方法论文档**：工程执行过程中,一旦发现"这个步骤其实是
   方法论的一部分"（例如某种新的 negative-control 手法、某种新的
   scope_discipline 判断),**当场**追加到本目录的 `README.md`,而不是
   留到轮次结束才回填。iteration-2 的 iteration-2.md 应在 Reflections
   小节明确说明"本轮是否做到了同步维护"。
2. **区分领域无关步骤 vs epicd 特有细节**：BACK-603 的 AC#3
   （"加新 pipeline 只改数据定义,不碰解释器/core"）恰好是一个测试
   "通用模式识别能力"的好场景——decompose 阶段就要想清楚:
   - 哪些验收逻辑是 epicd 引擎特有的（如具体调用 `engine decompose`/
     `engine complete` 这些 CLI 命令)？
   - 哪些是可迁移到任何"大颗粒度任务收敛"场景的通用模式（如"负控审计"
     "loop-until-dry""归档 follow-up 而非扩大范围")？
   在 iteration-2.md 的 Value Calculations 或 Reflections 中显式区分这两类,
   为 reusability 打分提供比"我觉得能迁移"更具体的证据。
3. **建立 effectiveness 的量化基线**：本轮起,记录至少一项可比较的量化
   指标,例如:
   - 从 decompose 提案到 `Epic: Done` 的墙钟时间/迭代次数;
   - 每个 child 触发 needs-human 的次数（区分"真实门禁生效"与"操作失误"
     两类,呼应 iteration-1 的 Reflections 里提到的问题);
   - 审计发现的问题数 × 严重度分布(HIGH/MEDIUM/nitpick 的比例)。
   这些数据本身不需要复杂工具,从 backlog task 的 timestamps + commit
   历史 + 审计报告里提取即可。

### 执行 prompt（decompose → 执行 → 收敛,与 iteration-1 相同骨架,
新增上面 3 条 meta 观测要求）

```
对 BACK-603 运行 `engine decompose`（或人工评审其提案）,拆成 PR 粒度
（≤~2000 行）的 child task。decompose 阶段显式记录:
  (a) 每个 child 声明的 dodGates 是否覆盖 AC#3 的"耦合纪律"断言
      （新增 pipeline 不触碰解释器/core,须有可执行的 diff-scope 检查
      而非仅文档承诺);
  (b) 每个 child 的验收逻辑中,哪部分是 epicd 特有的、哪部分是通用模式
      （为 reusability 打分做准备)。

每个 child：`handle-basic-ready.sh` 认领 → 真实 worktree → 一个
background Agent 独立实现（不得自证 status/dod,只能 --append-notes）→
`engine complete --worktree` 独立复核合并。记录每个 child 是否触发
needs-human,以及触发原因是"真实门禁生效"还是"操作失误"（为
effectiveness 的量化基线积累数据）。

全部 child 落地后,`engine evaluate BACK-603` 收口为 Epic: Done。

派第一个无实现记忆的 fresh-context agent 审计：
  - 独立重跑 tsc/check/bun test --parallel。
  - 针对 AC#3 做真正的负控：挑一个新增的 exploration pipeline 变更,
    grep 解释器/core 代码路径确认未被触碰;反向验证——如果人为在解释器里
    加一个 exploration 专属分支,现有测试套件是否真的会失败（不是靠约定,
    是构造一个真实的违规 diff 去验证断言会拦下它）。
  - 对 ADR-010 全量不变量是否真的进了测试套件逐条核对。
  - HIGH/活风险当场修;范围外归档 follow-up;nitpick 顺手清。

重复审计,直到零新增阻塞项,宣布 BACK-603 达成不动点。

收尾时,把本轮的三项 meta 观测（同步文档维护、通用步骤/特有细节区分、
量化基线数据）连同标准 10 节结构一起写入
docs/research/baime-fixpoint-convergence/iterations/iteration-2.md,
并计算 V_instance(s_2)/V_meta(s_2),更新 README.md 的迭代索引表与
收敛状态判断。
```

## 之后轮次（iteration-3+）的粗略计划

- 若 iteration-2 后 V_meta 仍 < 0.80：优先看是哪个分量卡住——
  - 若仍是 completeness：说明"同步维护文档"这条改进本身没有落实,
    需要更强的机制（例如把"更新 README"做成某个 child 的显式 dodGate）。
  - 若仍是 reusability：说明需要找一个**不在 epicd 自身**的场景验证
    该方法（例如 BACK-630"field-registry 通用部分回馈上游 Backlog.md"
    这类跨仓库任务,是天然的跨项目可迁移性试金石）。
- 一旦某轮 V_instance ≥ 0.80 且 V_meta ≥ 0.80 且连续两轮 ΔV < 0.02：
  按 BAIME 生命周期进入 knowledge-extractor 阶段,把 LFDD 提炼成一个
  正式的 Claude Code skill,供其他项目复用——但在此之前不要提前抽取,
  避免过早固化一个证据不足的方法论。
- 每轮结束后,本文件顶部的"当前状态"小节需要更新（下一轮目标 epic、
  已识别的 meta 层缺口优先级),使其始终反映最新真实状态,而不是
  历史快照。
