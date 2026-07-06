# BAIME 子实验：轻量路径不动点收敛（Lightweight-Path Fixpoint Convergence）

本实验从 [../baime-fixpoint-convergence/README.md](../baime-fixpoint-convergence/README.md)
（下称"父实验"）拆分出来，独立收敛，不再等待 epic。拆分动机：父实验的
domain 是 epic 级协调方法（decompose→evaluate→双轮审计），数据点绑定在
epic 数量上，epic 稀缺导致收敛证据积累慢；而"轻量路径"（原子 Basic task
直跑，无需 decompose）才是实际派发颗粒度的主体、且样本便宜频繁（BACK-649/
653/654 分别 ~21/~40/~50 分钟）。把它拆成独立实验后，"继续干活"与"积累
收敛证据"是同一件事，零额外成本。

两个实验共享同一条平台约束 lemma——**Agent 调用不支持嵌套派发（深度恰好
为 1）**，详见父实验 README 的"平台约束"一节，本文档不重复，只引用。

## 领域

一个**原子 Basic task**（无 children，符合 CLAUDE.md 任务颗粒度纪律）从
认领到可信收口（`engine complete` 独立重跑结构化 DoD gate 并合并，而非
人工绕过或 agent 自证）的方法——不涉及 decompose/evaluate 等多 child 协调
机制。

## 双层目标

- **Instance goal（每样本）**：该原子 task 走可信路径（`engine complete`
  独立重跑+合并，或因任务本身合法原因——如未声明 `dodGates`——路由人工，
  且根因被正确分类）收口为 `Basic: Done`，零新增阻塞项。
- **Meta goal（跨样本）**：验证并稳定这套"骨架"（claim→worktree→单一
  独立实现 agent→engine complete→条件审计），使其成为可文档化、可教学、
  未来可迁移到其他项目的独立方法论产物/skill（区别于父实验的 epic 协调
  层）。

## 骨架定义（Codify 产物）

1. `task edit <id> -a @{your-name}`（按需加 `--dod-gate`）——不需要
   `engine decompose`。**新增强制约束（本次拆分时加入）：轻量任务创建
   时应声明结构化 `dodGates`**；不声明则 `engine complete` 恒路由
   needs-human（有意为之的安全默认值，见 BACK-654），会导致该样本无法
   验证"可信自动合并"分支，只能算弱样本（见下方"合格样本判据"）。
2. worktree 隔离 + 主会话直接派发**一个**独立实现 agent（不得自证
   status/dod，只能 `--append-notes`）。
3. `engine complete --worktree`——独立在 worktree 里重跑结构化 DoD
   gate 并加锁合并，从不信任 agent 自证（ENG-8）；若路由 needs-human，
   先做**根因分类**：区分"真实结构化 DoD 门禁生效拦下代码问题/任务本身
   缺 dodGates 的安全默认值"与"操作失误"（如 untracked 文件冲突导致
   `git merge` 中止），后者需独立重跑全部 DoD gate 才可收口，且归档为
   独立引擎缺陷 follow-up，不算方法论信号。
4. 是否加一轮独立 fresh-context 审计按风险条件触发（触碰 engine/core
   逻辑或安全相关改动→应做至少一轮；纯文案/低风险改动→可省略），但
   **这个决定本身必须显式做出并落地记录**：要么真的派发独立审计 agent，
   要么用 `task edit <id> --append-notes "audit skipped: <原因>"` 写
   跳过理由，二者选一，禁止两者都不做就直接标 Done。
5. **不**为此单独撰写完整 `iteration-N.md`——那套重仪式是为验证 epic
   级方法论而加的科研成本，对原子 task 强行套用违背 scope_discipline。
   改为在下方"执行记录"表格登记一行。

## 收敛判据（Meta-Focused Convergence，只喂 V_meta）

轻量路径评的是骨架流程本身能否可靠工作，天然没有"多个可比较 instance"
的量级，因此不用父实验的双阈值收敛，改用**过程能力型**判据：

### 合格样本判据（一个样本要计入"零新增步骤 streak"，须同时满足）

1. 任务**声明了结构化 `dodGates`**（否则无法验证自动合并分支，只能算
   弱样本，需在记录里标注，不计入 streak）。
2. `engine complete` **自动合并跑通到底**，或 needs-human 经根因分类
   证实是"真实门禁/任务缺 dodGates 的安全默认值"而非操作失误绕过。
3. 审计决策（跑一轮 / 显式记录跳过理由）**显式做出并落地**。
4. 该样本**没有给骨架新增 forced step**（即骨架 `M_n == M_{n-1}`）。

### 收敛声明条件

**连续 K=3 个合格样本满足上述 4 条 → 宣布骨架达成不动点**，可移交
`knowledge-extractor` 抽取为 standalone skill。

### V_meta 分量（回顾性打分，非阻塞门槛）

- **Completeness**：骨架步骤 + 审计触发规则 + 根因分类法是否已完整
  文档化。
- **Effectiveness**：相对完整 BAIME 仪式的提速；审计轮是否真抓到过
  实质缺陷（而非只是走过场）。
- **Reusability**：骨架里"项目无关的决策逻辑"（何时开 worktree、何时
  派发不许自证的 agent、needs-human 后如何做根因分类、审计触发条件）
  与"epicd 专属命令"（`handle-basic-ready.sh`/`engine complete
  --worktree` 等具体 CLI）是否已显式分层——只有前者可迁移，抽取 skill
  时必须能剥离后者。
- **Validation**：合格样本数 + 当前连续 streak 长度；跨项目迁移仍是
  独立证据缺口（不能靠同项目样本数替代，需类似父实验 BACK-640 的真实
  迁移验证）。

## 执行记录（历史考古 + 后续样本，登记于此，不产出 iteration-N.md）

历史考古结论（专项 agent 核查全部 git worktree 合并记录 + 任务
frontmatter 后确认）：git 历史里另有一批走过 worktree 机制的任务
（BACK-632/633/637/638/639/644/645/646/647/648），但它们全部带
`parent_id`，是 BACK-602/603/604 三个 epic 用扁平 ID（而非 `.N` 后缀）
分解出的 child，属于父实验的 epic 协调实验，**不计入**轻量路径样本。
BACK-628 之前（610/616-624 等）是 baseline 时代，`engine complete`
独立重跑而非信任自证这一核心机制尚不存在，也不计入。BACK-634/625 虽是
无 parent 的 `Basic: Done`，但直接提交进 main、未走 worktree，同样不算
骨架样本。**真正合格的轻量路径原子样本历史上恰好就是下表 3 条**，历史
考古没有增补样本，只排除了误判。

| # | 目标 task | 日期 | 墙钟耗时 | needs-human 轮次（根因） | 合格样本判据核对 | 骨架版本 | 新增步骤? | 结果 |
|---|---|---|---|---|---|---|---|---|
| 1 | BACK-649（engine decompose-apply 缺结构化 dod-gate） | 2026-07-05 | ~21 分钟 | 2——R1 操作失误（dod-gate 测试路径过滤器写错，`src/engine src/core` 匹配不到文件）；R2 根因当时未查明（结构化 gate 全过仍路由 needs-human），人工核实后手动 `git merge` + 改状态收口，**未**走 `engine complete` 自动合并路径 | ①无 dodGates 声明记录 ②未走可信合并路径（人工绕开） ③审计决策未显式记录（弱点本身） ④催生了"审计决策必须显式记录"这一新 forced step → **不合格，弱样本** | pre-649 | 是——催生审计决策强制步骤 | Basic: Done（人工收口，非全自动） |
| 2 | BACK-653（All Tasks 主页化 + gate-inbox 下线） | 2026-07-06 | ~40 分钟 | 1——操作失误/瞬态：首次 `engine complete --worktree` 判定 needs-human，人工独立重跑全部 3 条结构化 DoD gate 均通过 + 本地试合并无冲突；未改代码原地重跑，第二次判定 done 并生成真实合并提交（`ee6551b`） | ①✓声明 dodGates ②✓走通可信合并路径（原地重跑收口） ③✓审计决策显式执行并留痕（派了独立审计 agent，报告 zero new blockers） ④催生了"needs-human 根因分类"这一新 forced step → **不合格（新增了步骤），但骨架各分项本身全部达标** | +审计决策 | 是——首次执行根因分类，使其成为强制步骤 | Basic: Done（全自动收口，含独立审计轮） |
| 3 | BACK-654（修复 BACK-649/653 共同撞上的 adjudicate/dodResults 不一致缺陷） | 2026-07-06 | ~50 分钟 | 1——**真实门禁生效**：任务本身未声明 dodGates（安全默认值），根因分类确认非缺陷复发 | ①✗未声明 dodGates（任务本身如此，且这正是该样本 needs-human 的原因）②人工收口（因①而非操作失误）③✓审计决策显式执行（独立 fresh-context 审计 agent + 负控验证）④✓**没有新增 forced step**——首个"骨架不变"样本 → **弱样本（判据①②不达标），但④首次为"零新增步骤"** | +根因分类 | **否**——首个零新增步骤样本，但因①②未达标，仍不能计入"合格 streak" | Basic: Done（人工收口——因任务缺 dodGates，非引擎自动化失效） |

**当前 streak 状态：0。** 三个历史样本没有一个同时满足全部 4 条合格
判据——BACK-649/654 都因未声明 dodGates 而未走通自动合并分支，BACK-653
虽然全部达标却在过程中新增了 forced step（判据④要求"不新增"）。这不是
退步，而是判据刻意从"骨架是否好用"（三个样本都验证了）收紧到"骨架是否
已经稳定不变、且合格分支被真实跑通"——更严格的收敛信号。**下一步会是
BACK-655/656 两个已排队的原子 task**，只要给它们声明结构化 `dodGates`
再走轻量路径，就能天然产出下两个候选合格样本。

### 历史复盘（从父实验迁移，原文保留）

#### BACK-649 样本复盘（2026-07-06 补记）

对照骨架流程逐条核对 BACK-649 的实际执行记录（会话
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
   **修正**：骨架步骤4已改为强制二选一（跑审计 / 写跳过理由），本条
   反例是该强制规则的直接来源。
3. **实际出现 2 轮 needs-human，而非最初记录的 1 轮**（已在上表更正）。
   第二轮根因当时未查明：`engine complete` 判定为 needs-human，但人工
   核实后发现结构化 DoD gate 结果（dodResults）实际全部通过——即
   adjudicate 逻辑与真实 gate 结果不一致。此轮最终靠人工 `git merge` +
   手动标记 done 收口，**没有**走通"从不信任 agent 自证、必须由
   `engine complete` 独立重跑并加锁合并"这一本方法反复强调的核心路径。
   应作为独立引擎缺陷排查（跟踪于 BACK-654，已修复），而非算作"操作
   失误已修复、方法论已验证"的正面证据。

**结论**：BACK-649 验证了轻量路径骨架本身可以走通并收口，但同时暴露了
两处未被如实记录的降级（省略设计现场验证的必要性判断、省略已建议的
审计轮）和一处当时尚未定位的引擎缺陷（adjudicate 误判 needs-human，
后确认根因在 complete-task.sh，已于 BACK-654 修复）。

#### BACK-653 样本复盘（2026-07-06）

对比 BACK-649 的两处降级，本次做了针对性修正，并留下新证据：

1. **审计轮未被省略。** BACK-653 涉及真实 web 路由/组件代码（App.tsx
   路由、SideNavigation、TaskList 排序逻辑），依骨架步骤4判为"建议至少
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
   真实存在的间歇性问题，而非一次性巧合；BACK-654 当时仍需被修复，不能
   因为"重试后能收口"就下调优先级或关闭。
3. **根因分类步骤（真实门禁生效 vs 操作失误）本次被显式执行，而非事后
   补记。** 判定为"操作失误/瞬态"的依据是：dodResults 独立复核全过 +
   本地试合并无冲突，排除了合并冲突路径；两条路径都被排除后，唯一剩下
   的解释就是 `adjudicate`/`dodResults` 之间存在不一致，而非本次代码有
   真实问题。

**结论**：BACK-653 是第一个完整走完"轻量路径 + 强制审计轮二选一"修正后
流程的样本，且首次以"独立复核 + 无冲突试合并 + 原地重跑"的方式处理
needs-human 误判，而非人工绕开 `engine complete`。样本量当时仍为 2，
且两次都撞上了同一个未修复的引擎缺陷（BACK-654）。

#### BACK-654 根因与修复（已修复，2026-07-06）

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
   触碰。独立 fresh-context 审计（负控：还原脚本到修复前版本，确认回归
   测试真的会失败）确认零新增阻塞项；两处遗留边缘情况（DoD Gates 小节名
   可被任务 description 冒充、gate 文本内嵌换行可被拆分执行）归档为
   follow-up BACK-656，未混入本次范围。

## 收敛状态

**未收敛。当前合格样本 streak = 0**（3 个历史样本均不满足全部 4 条
合格判据——BACK-649/654 因未声明 `dodGates` 未走通自动合并分支，
BACK-653 虽全部达标但过程中新增了 forced step）。需要 K=3 个连续满足
全部 4 条判据的样本。下一批候选：BACK-655、BACK-656（均需在创建/认领时
声明结构化 `dodGates`，以验证自动合并分支）。

## 局限与后续观察点

- **样本独立性 ≠ 跨项目可迁移**：目前所有样本都在同一项目、同一类
  session 里产生，收敛可能只反映"本项目内熟练化"而非"方法论普适"。
  Reusability 分量必须把"epicd-in-project 稳定"和"跨项目迁移"分开记，
  后者仍需类似父实验 BACK-640 的真实迁移验证，不能用样本数糊过去。
- **避免过拟合到 epicd 专属 harness**：`handle-basic-ready.sh`/
  `engine complete --worktree` 是本项目专属命令。抽取 skill 时必须把
  "可迁移的决策骨架"和"本项目具体命令"两层显式剥开，否则 skill 迁移到
  别的项目就是死的。
- **保持判据本身轻量**：每样本只登记一行 + 4 条判据打勾，不写
  `iteration-N.md`——否则又回到 BACK-649 证明过的"过度仪式对原子任务
  不适用"的老路。
