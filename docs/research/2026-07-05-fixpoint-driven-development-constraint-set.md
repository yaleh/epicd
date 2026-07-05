# 迭代不动点驱动的开发过程与约束集管理

> 日期：2026-07-05 · 载体：设计讨论记录（research，非 ADR/proposal）
> 关联：BACK-628（自审计 epic）· BACK-629（约束注册表接线）· ADR-013（载体律）· ADR-010（ENG-*）
> memory：e1-engine-executable-milestone · bootstrap-ignition-epic

本文记录一次关于"把自举软件开发过程形式化为不动点系统"的讨论，并把结论落到 epicd 当前状态的实测分析上。

---

## 1. 开发过程即迭代不动点系统

把 epicd 剥到骨头，整个系统是一个作用在"带标签的 board 状态"上的算子：

```
S_{t+1} = advance(S_t)
advance = scan → dispatch → execute → complete
不动点 S* : advance(S*) = S*
```

- **scan**（纯函数）：board → item-ready 事件；谓词 = 某 work-item 当前 phase 的 actor=machine 且无有效 claim。
- **dispatch**：为事件产出自包含派发指令（BACK-625 已把这步搬进 engine）。
- **execute**（唯一 molten 步）：隔离 worktree 里的 LLM agent 变换 work-item。
- **complete**：crystal 重新裁决（ENG-8 在 worktree 重跑 DoD，worker 不得自证）→ 推进 phase。

与经典不动点算子的对应：

| 抽象 | 对应 |
|---|---|
| 算子 F | advance(board) = engine 一轮 |
| 格 | (done-count, blocker-count) 单调减 |
| 不动点 | eval 干净：blocker-count = 0 |
| Kleene 链 | E0 → E1 → E2 → … milestone 序列 |
| 近似元素 | 每个 milestone commit = 一个 S_n |

**人类交互作为算子**：人不是外部控制系统，而是 pipeline 里 actor=human 那些 phase 的执行体。

```
advance(S) = Σ_i phase_handler_i(task_i)
  phase_handler: actor=machine → engine worker (LLM)
                 actor=human   → human（任意 channel）
```

markdown gate / backlog.md / issue-list 都只是 channel 实现（可插拔渲染），不是内核。人类 handler 与机器 handler 共享同一接口：读文件 → 产出 → updateTask。

---

## 2. 不动点的调整：语法收敛 vs 语义收敛

原始定义有隐藏漏洞：

```
advance(S*) = S*  iff  eval() 产出零新增 blocker      # 语法收敛
```

若 eval 本身有盲区（stub gate、无负例控制），S* 是假不动点——这正是 E1 memory 那条 recurring pattern 的根因（每个 DoD-green 都藏过 stub，门禁从没抓到）。

**调整为带约束集的不动点**：

```
fixed_point(S, C) 成立 iff:
  (a) eval() 产出零新增 blocker                                   # 语法（已有）
  (b) ∀ c ∈ C, enforcement=executable: c.has_negative_control    # 覆盖率（缺）
  (c) ∀ c ∈ C, enforcement=semantic:   c.reviewed_by_independent_ctx  # 独立评审（缺）
```

关键度量：**一个从未被违例输入运行过的 gate 与 return true 不可区分。故 negative-control 覆盖率 = 机器门控条款形式化充分性的度量。**

**Milestone = (状态, 约束集) 对**，而非单纯状态：

```
E_n = (S_n, C_n),  C_n ⊇ C_{n-1}（约束集单调增），且 fixed_point(S_n, C_n) 成立
E_n → E_{n+1}：先扩展约束集 ΔC，再在新约束下找新不动点
```

"里程碑推进"不是"多做了功能"，而是"在更强约束下仍收敛"——Kleene 链在约束维度上的提升。

**人类带宽进入代价函数**：

```
cost(advance) = machine_steps + λ · human_gate_count
```

推论：(1) gate 晶体化优先（executable 越多，λ 贡献越小）；(2) human gate 集中到 milestone 边界，子任务粒度内全机器链路。markdown gate 降低的是 λ（每次交互成本），不是 gate 数量。

---

## 3. 约束集的先验结构与管理

"从零开始建约束集"是错误预设。约束集有层次，单调增长的格：

```
L0 Universal invariants   永久有效     type safety, idempotency, no data loss, machine-gate always crystal
L1 Architectural priors   项目启动确定  crystal/molten 边界, ENG-1..8, pipeline-as-data schema
L2 Milestone constraints  E_n→E_{n+1}  每个 milestone 新增能力边界
L3 Task-level constraints 任务创建注入  acceptance criteria, DoD（从 L0/L1/L2 派生）
```

先验知识（工程方法、架构方法、SDK 文档、需求）的问题不是"是否有用"，而是**激活成本过高**——散文形式每次使用都要重新读懂并应用，引擎无法直接消费。

**解法：约束注册表（constraint registry）**——把 ADR/proposal/SDK docs 中的条款结构化为条目：

```yaml
constraint {
  id:          "ENG-8/no-self-certify"
  source:      "ADR-010"            # 保引用，不复制内容，单一真相源
  enforcement: executable           # structural | executable | semantic (ADR-013)
  oracle:      "bun test engine-adjudicate-eng8"
  coverage:    has-negative-control  # 可证伪性条件
  phase:       [complete, adjudicate]
  lifetime:    invariant             # L0..L3
  priority:    P0                    # 破坏性 → 功能 → 可观测 → 自举 → 优化
}
```

接线后：
- epic-decompose 创建子任务时，从注册表**注入相关约束**到 DoD（而非 LLM 凭直觉猜检查什么）。
- eval 轮 = 遍历 C_n 中 coverage 未满足的条目（**有界搜索**，而非开放联想）。
- 人类只做两件事：批准新约束 ΔC（milestone 跃迁）、评审 semantic 条目。

**价值交付**：约束集带 priority，每个 milestone 对应一个 priority 层级上移。早期可用版本 = 满足 P0..P_n 约束集的不动点。人类可观测性 = 看**约束覆盖率**（比 Kanban 更信息密集，直接对应收敛判据）。

---

## 4. 实测：epicd 当前状态（2026-07-05）

用注册表透镜勘查 6 个 ADR frontmatter、engine 源、测试套件、DoD defaults、bootstrap 板：

| 框架要素 | epicd 实际状态 | 诊断 |
|---|---|---|
| 约束条目 | ENG-1..8、ADR-013 载体律等已在 ADR frontmatter（enforcement/oracle/lint/applies-to/stage 齐全） | ✅ 骨架已存在 |
| oracle | ENG-1/2/3/8 已有可执行测试，含负例控制（engine-adjudicate-eng8、engine-autonomous-e2e:133） | ✅ oracle 已存在 |
| 约束→oracle 接线 | 无 harness 消费这些字段（"死数据"） | ❌ 断线 |
| 约束分类 | **全部 6 个 ADR 一律 enforcement: semantic** | ❌ 系统性误分类 |
| 覆盖率维度 | DoD defaults 无 negative-control 条款 | ❌ 缺 |

**最尖锐的发现**：所有 ADR 标 semantic（=需人判断），但 ENG-1/2/3/8 明明已有可执行测试甚至负例控制。假不动点风险不是抽象担忧——是经验形态：约束集在标签上宣称"靠人判断"，引擎每轮 eval 无法机器验证任何一条，只能靠 LLM 自由联想。

**结论：epicd 不需要"建约束集"，需要三个动作——重新分类、接线、补覆盖率维度。比新建便宜一个数量级。** 已落为 BACK-629 的三阶段 checklist（重分类 / meta-lint 接线 / negative-control 入 DoD defaults）。

注：628.1（点火）已 Done；审计已跑出并关闭两个真 blocker（628.3 TaskUpdateInput 字段不对称、628.4 compound 相位缺派发）——自愈环已在转。629 的作用是让**下一轮 eval 从自由联想升级为约束表遍历**，决定 628 能否达到真不动点。

---

## 5. 遗留问题（见 §6 续讨论）

- 约束验证成本随约束数持续上升，需与单元/e2e 测试成本对比量化（估计上限：比典型测试高一个数量级）。
- 人类在实际开发中并未持续形式化应用约束集。
- 外部反馈成本过高时无法端到端验证，需 meta 思考建替代验证机制。
- 自指/自举的小项目上可行，外化到更广项目的困难（BACK-628 大量时间花在 backlog.md 适配上即一例）。

---

## 6. 边界条件续讨论（方法的极限与代价）

实测锚点（2026-07-05，自 05:39 起会话工具分布）：1812 次 Bash 中 1362 次触及 backlog/CLI、1284 次触及引擎源码、312 次专做 field-registry/schema 适配——载体适配吃掉可观比例时间。

### 6.1 约束成本是双峰的，不是均匀的

成本按 enforcement 层级分裂成两个数量级完全不同的池：

| 维度 | executable | semantic |
|---|---|---|
| authoring | ≈ 单测 ×1 + 一次性分类元数据 | 判据 + 独立上下文 reviewer prompt，≈ 单测 ×3–5 |
| **run（每次验证）** | **= 单测本身，≈1×** | **LLM reviewer spawn：token+延迟+多票，≈ 单测 ×10²–10³** |
| maintenance | 比代码稳定（crystal 不变） | 随语义漂移，需重评审 |

结论：executable 层与单测成本**相同**（oracle 就是那条 `bun test`），注册表只加一次性分类元数据。成本爆炸完全在 semantic 层。

```
per-iteration 验证成本 ≈ N_exec · c_test  +  N_sem · c_review
                          ~1×每条            ~10²–10³×每条
```

**成本驱动因子 = 每轮检查的 semantic 约束数 N_sem。** 用户"高一个数量级上限"能守住，当且仅当：(1) 可证条款尽量压到 executable；(2) semantic 约束不每轮跑，批到 milestone 边界摊销（与"human gate 集中到 milestone 边界"同律）。可测门：重分类后统计 N_exec / N_sem 比值——BACK-629 的重分类同时是成本控制手段。

### 6.2 人类未持续应用约束集 = 方法的理由，不是 bug

若人能可靠自觉应用约束，就不需要注册表。baime TASK-183/190 违反 ADR-001/007 却通过多轮 review，证明人和 LLM 都不可靠自我应用。注册表价值 = 把约束外化成无论谁在动都跑的 oracle。

```
crystal/molten 边界 = "谁能被信任自觉应用" 的边界
  executable → 没人需要记得，gate 自己跑（对人对机一视同仁）
  semantic   → 必须有人记得，而人不会可靠记得 → 结构性泄漏
```

推论：semantic 层结构性泄漏，不因"更努力"改善；唯一防御是数量最小化 + 独立上下文评审。正确做法不是要求人守纪律，而是让人的产出（promote 的任务、写的 DoD）流经同一个 executable gate（如 meta-lint）。

### 6.3 外部反馈昂贵 → 退化到"验证验证器"

ground-truth oracle（是否给真实用户交付价值）在自举环里昂贵/慢/不可得。用 proxy oracle 替代有 Goodhart 风险。meta 层替代不是造更多 proxy，而是**验证 proxy 能区分好坏**——这正是 negative-control：不证明软件正确，证明门能区分正确与违例（否则门 = `return true`）。

替代三件套：(1) 每门带 negative-control（验证验证器）；(2) milestone 边界周期性对真实反馈校准；(3) oracle 多样性（多独立检查更难被同时骗）。

硬边界：没有 proxy 验证能替代 ground truth 在未覆盖维度上的判断。形式化约束保证"想到要约束的东西上不回归"，不保证"交付价值"。环收敛到**内部自洽的不动点，非外部有价值的不动点**——两者不同。价值交付必须周期性触碰现实；"尽早提供可用版本让人观测"是唯一的 ground-truth 采样通道，每个可用版本 = 一次 proxy 校准。

### 6.4 外化到更广项目：瓶颈从"找不动点"转移到"建载体"

方法预设一个载体：(a) 状态单一真相 + 派生视图，(b) 约束可作机器可读字段挂到 work-item，(c) 引擎能编程读写。epicd 的自指优势 = 它就是引擎，约束的是自己的行为、自己可测。外化时四个预设逐个失效：

| 困难 | 小的自指项目 | 真实更广项目 |
|---|---|---|
| 载体碎片化 | 单 board，(pipeline_id,phase) 真相 | 状态散在 Jira+CI+docs+review，无共享 schema；epicd 打过的 desync 战是跨工具版小号 |
| 约束载体缺失 | ADR frontmatter 可挂 oracle | 真实 ADR 是散文，无人建 registry+harness——死 frontmatter 的组织级放大 |
| semantic 层规模 | 约束少、多可晶体化 | 领域知识海量且不可约 semantic，昂贵层主导，成本越界（§6.1） |
| 自指优势不可转移 | 约束=引擎自身行为，自测免费 | CRM/游戏领域约束不关乎工具，需领域 oracle，不免费 |

backlog.md 摩擦是微观样本：即便理想自指情形，改造通用工具承载形式化也花真实时间；组织尺度异构工具林立，载体适配成本可能完全主导。

净收益判据：

```
形式化净收益 > 0  ⟺  N_iterations · (每轮省下的假绿修复成本) > 载体建设成本 + Σ 约束维护成本
```

自举小项目满足（N_iterations 大、载体小、约束多为 crystal）；跑三个月即交付的普通项目可能不满足，其理性选择仍是单测+e2e+人工 review。存在**最小可行规模**，低于它形式化开销超过价值。

反推 epicd 外化方向：不是"教别的项目用约束集"，而是**把载体本身做成产品**——"单一真相 board + 约束注册表 + 消费 harness"作为可复用基底交付，才消除外化第一大困难（载体碎片化 + 缺失）。backlog.md 适配的痛在提示：**载体不是免费假设，它是这个方法要交付的第一个真实产品。**
