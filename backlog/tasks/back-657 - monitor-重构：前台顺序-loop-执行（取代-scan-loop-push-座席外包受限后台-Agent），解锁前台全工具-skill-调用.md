---
id: BACK-657
title: >-
  phase 执行 skill 集：为三条 pipeline 的机器 phase 各建随 epicd 发布的执行 skill（参考
  feature-to-backlog）
status: 'Basic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-06 06:53'
updated_date: '2026-07-06 12:13'
labels:
  - 'kind:epic'
  - 'area:engine'
dependencies: []
references:
  - docs/adr/ADR-015-monitor-as-invocation-adapter.md
  - docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md
  - docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md
  - docs/proposals/2026-07-04-multi-lane-issue-list.md
  - docs/task-lifecycle-model.md
  - BACK-655
  - BACK-608
  - BACK-641
priority: high
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

docs/task-lifecycle-model.md 的模型里有若干「机器 actor」phase，每个 phase 都需要一个「怎么把这个 phase 的活干出来」的方法。现状是：worker 拿到 ready 任务只被告知「读 Description 的 ## Phase plan 照做」（src/engine/dispatch.ts），没有任何 per-phase 的 skill；执行方法要么内联在引擎 authored 的 payload 里，要么全靠任务正文。ADR-011 D-7-bis 要求「操作/执行 skill 随 epicd 仓库发布、对 baime 零依赖」，而 feature-to-backlog 提供了一套成熟的 skill 结构范式（λ-spec + frontmatter contracts 自检 + Phase 化 + 派 agent + finalise 写回 task 字段 + DoD-gate）。

本 epic 的目标：为三条 pipeline 的每个机器 phase 建设一个「执行 skill」，参考 feature-to-backlog 的结构，住在 epicd 仓库内，作为随引擎发布的操作/执行 skill。**monitor 相关代码（前台顺序 loop、dispatch 按 (pipeline_id, phase) 注入并 invoke skill）稍后单独立项实现——本 epic 只交付 skill 本身，使其可独立 invoke 且有测试/contracts 守卫。**

> **本 epic 是不动点 BACK-665 的 child，承接其「要求 3：每个需要机器处理的 phase 都有执行 skill」。** 覆盖门（child 1 的 phase-skill-coverage）就是该要求的可执行证明。

## 候选子交付（按 deliverable 分解：每个机器 phase 一个 skill）

参照 docs/task-lifecycle-model.md §3 的机器 phase：

- **execution/ready → 原语执行 skill（keystone）**：把「读任务 Description 的 Phase plan → 先写测试 → 实现 → 跑结构化 DoD → checkpoint」这套 LFDD 执行固化为 skill。ready 是唯一已接生产 transport 的机器 phase，优先。
- **execution/decomposing → 分解 skill**：epic → children（提 children JSON、engine decompose-apply）。已有引擎 handler，skill 把 Monitor 座席那段指令 skill 化。
- **execution/evaluating → 评估 skill**：**运行 epic 的 Integration Acceptance 并据以 gate**（done 仅当 IA 全绿）+ 聚合子任务终态。**不只是薄包 `engine evaluate`**——今日 `evaluateEpic` 只聚合 children 终态（src/harness/evaluator.ts:54-65），不跑 epic 自身 IA，是 ADR-019 反模式、也是「child 全绿但业务目标未达」的根因（见不动点 #7）。
- **authoring/draft → 起草 skill**：建初始 proposal 草稿。注意与 feature-to-backlog 的 proposal 阶段重叠，需明确复用/收敛关系。
- **authoring/refining → 精修 skill**：草稿 → backlog-ready。与 feature-to-backlog 的 plan 阶段重叠。
- **exploration/spike → spike skill**：timeboxed 探索 + kill/promote 决定。因无已验证探索方法论，拆出 BACK-658 实验先收敛。

分解时：execution 三 phase 已接生产 transport / 有引擎 handler，优先且风险低；authoring/exploration 的 phase 其 driver 尚未接生产 transport（E7/BACK-608、BACK-641），其 skill 可先建成可独立 invoke 的形态，但须在子任务里标注「运行时接线待后续」。

## 非目标（本 epic 显式排除）

- monitor 前台顺序 loop 重构、dispatch payload 改造、(pipeline_id, phase)→skill 注册表的**运行时 invoke** —— 稍后单独立项（BACK-660，本 epic 的下游）。注：registry 的**代码/数据本体**折入 child 1（单一真值），monitor 只是消费它。
- authoring/exploration 机器 phase 的生产 transport 接线（E7/BACK-608、exploration 的 BACK-641）。
- 不重实现引擎机制：skill 只描述并驱动 phase 工作，不改 engine complete/adjudicate/DoD 重跑/merge-lock/worktree/claim。evaluate skill 跑 IA 是在 skill 层读 epic plan 的 IA 段执行 shell 并 gate，**不改 engine 核心**。

## 不动点（贯穿所有子任务，描述期望的系统）

1. **住在 epicd、对 baime 零运行时依赖**：skill 住 `plugin/skills/`，无 `/baime:` invoke、无 baime 脚本路径出现在可执行位置（D-7-bis 可移植性验收：fresh project + epicd plugin ⇒ 可用；允许 `provenance:` 里对源实验/skill 的 documentary 引用）。参考 feature-to-backlog 的结构范式，但成品是 epicd 操作/执行 skill。

2. **不动核心机制**：engine complete/adjudicate/DoD 独立重跑/merge-lock/worktree 隔离/claim 语义、pipeline-as-data 与 interpreter scan 谓词 —— skill 一律不改，只在其之上描述 phase 工作。

3. **每个 skill 可独立 invoke，自带 `contracts:` 守卫 + 测试 + `provenance:` 声明**（child 1 提供强制 skill-lint / contracts / provenance 门；epicd 现状无任何此类机制，只在 baime）。

4. **三分创建路径纪律**：一个 skill 的价值来自它**编码的方法论是否有效**，有效性来自 methodology-bootstrapping 实验，**不来自过结构 lint**。故每个 phase 按其方法论状态选对路径——**extract**（已收敛方法论 → knowledge-extractor 打包）/ **mechanical**（无方法论的薄 CLI 封装）/ **experiment**（无已验证方法论 → 先跑实验收敛再提取）。**禁止**对缺已验证方法论的 phase hand-write skill 再用 contracts-lint 冒充验证。升级条款：任一原定 extract 的 child 若落地时确认源方法论未经验证，升级为 experiment（拆出实验，如 spike/BACK-658）。

5. **覆盖不变量（= BACK-665 要求 3）**：`src/engine/pipeline.ts` 中全部 `actor==="machine"` 的 phase（ready/decomposing/evaluating/draft/refining/spike）**要么**有一个已发布 + 已登记 + contracts 合法 + provenance 溯源 + 零 baime 运行时依赖的执行 skill，**要么**显式标注 `experiment-pending` 并指向其实验——**不 silently 漏任何 machine phase**。这条由 child 1 的 phase-skill-coverage 门可执行断言。

6. **单一 (pipeline_id, phase) → skill registry**：机器侧 registry 与 phase→skill 覆盖 manifest 同一份（折入 child 1，单一真值）；**人手动驱动**（里程碑 A：按 docs/task-lifecycle-model.md §6 的表 invoke）与 **monitor 自动驱动**（里程碑 B：BACK-660 消费同一 registry 做运行时注入）查的是同一张表——manual→auto 连续体，不分叉。

7. **evaluate 语义完整性（装配后端到端，非单测并集）**：evaluate skill 在 evaluating phase **运行 epic 的 Integration Acceptance 并据以 gate**——epic 判 done 当且仅当其 IA 全绿，而非「所有 children 终态=done」。这是 ADR-019 的可执行落地，也是「执行了一堆 child 但业务目标未达成」的防线。evaluate 仍属 mechanical（读 plan IA 段跑 shell、查退出码，无方法论判断），但其职责**超出**今日 `engine evaluate` 的纯聚合。

8. **手动可驱动优先，运行时接线前向兼容**：skill 交付即可独立 invoke（里程碑 A 人手动即可用，不需 monitor）；authoring/exploration 的生产 transport（BACK-608/BACK-641）是其**运行时**前置——skill 先建成、在子任务标注「运行时接线待后续」，不阻塞 skill 交付。

## 参考

- docs/task-lifecycle-model.md（机器 phase 清单 = 本 epic 的子交付来源，§3；phase→skill 表 §6）
- docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md（D-7-bis：操作/执行 skill 随 epicd 发布、对 baime 零依赖）
- docs/adr/ADR-019（epic Integration Acceptance = 装配后端到端，非各 child DoD 之并集 —— 不动点 #7 的依据）
- /home/yale/work/baime/plugin/skills/feature-to-backlog/SKILL.md（结构范式模板）
- plugin/skills/（现有 5 个 epicd 操作 skill：propose/promote/inbox/run/init，新执行 skill 的邻居）
- src/engine/dispatch.ts（现状：worker 只被告知读 Description Phase plan，无 skill）；src/harness/evaluator.ts:54-65（现状 evaluateEpic 只聚合、不跑 IA —— 不动点 #7 要改的对象在 skill 层）
- BACK-665（不动点父 epic；本 epic 承接其要求 3）、BACK-664（数据/UI L3 姊妹 epic）、BACK-608（E7 authoring 引擎，authoring phase driver 前置）、BACK-641（exploration 接线前置）、BACK-658（spike 实验，exploration/spike skill 前置）、BACK-660（monitor 运行时，消费本 epic 的 registry）
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 execution 的 ready/decomposing/evaluating 与 authoring 的 draft/refining 各有一个随 epicd 发布的执行 skill；exploration/spike 因无已验证探索方法论拆出本 epic，交由独立 methodology-bootstrapping 实验收敛后再提取（不在本 epic hand-write）
- [ ] #2 每个 skill 按其 phase 方法论状态用正确创建路径建成——extract（已收敛方法论→knowledge-extractor）/ mechanical（无方法论薄封装→feature-to-backlog）；产出 epicd-native 操作/执行 skill，无 baime 运行时依赖（D-7-bis）
- [ ] #3 每个已发布 skill 自带 contracts 守卫 + 测试，epicd 内有强制 contracts-lint；且每个 skill 声明 provenance，由 provenance 门强制溯源到已收敛实验/已验证方法论（extract）或声明为 mechanical
- [ ] #4 contracts-lint 与各子任务测试只验证结构与机制（L1/L2），不充当方法论有效性门（L3）；有效性由源实验继承（extract）或不适用（mechanical）；缺已验证方法论的 phase 走实验路径而非在本 epic hand-write skill
- [ ] #5 所有子任务不改 engine complete/adjudicate/DoD 重跑/merge-lock/worktree/claim 与 pipeline-as-data；monitor 运行时注入（前台 loop + dispatch skill 注入）不在本 epic 范围（留待后续单独任务）
- [ ] #6 evaluate skill（child 3）在 evaluating phase 运行 epic 的 Integration Acceptance 并据以 gate（epic 判 done 当且仅当其 IA 全绿），非仅聚合 children 终态（今日 evaluateEpic 只聚合是 ADR-019 反模式）；有测试 src/test/evaluate-runs-integration-acceptance.test.ts 断言之——这是 BACK-665 不动点 gauge 的 IA-eval 门
- [ ] #7 phase-skill 覆盖不变量（BACK-665 要求 3）：pipeline.ts 全部 actor==machine 的 phase 要么有已发布+登记+contracts+provenance 的 skill、要么 experiment-pending 指向其实验，不 silently 漏；由 child 1 的 phase-skill-coverage 门断言，且被 BACK-665 gauge 的 IA-6 引用
- [ ] #8 epic-lifecycle 的 evaluate 交付物运行 epic 的 Integration Acceptance 并据此 gate（不止聚合子 terminal phase）；有测试证明：集成验收失败时 epic 路由 needs-human 而非 done（ADR-019 自我强制回路）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Epic Plan: phase 执行 skill 集

## Background

docs/task-lifecycle-model.md §3 的三条 pipeline 里有若干「机器 actor」phase，每个 phase 都需要一套「怎么把这个 phase 的活干出来」的方法。**关键前提（本次修订的核心）**：一个 phase 的执行 skill，其价值来自它所**编码的方法论**是否有效，而方法论的有效性来自 methodology-bootstrapping 实验（Observe→Codify→Automate + V_instance/V_meta 收敛），**不来自它能过一个结构 lint**。LFDD 就是这样由实验收敛出来的。因此本 epic **不是**「hand-write 5 个 skill + contracts-lint 收口」，而是按每个 phase 背后方法论的状态选对创建路径：**extract**（已收敛方法论 → knowledge-extractor 打包成 epicd skill）、**mechanical**（无方法论的薄 CLI 封装）、**experiment**（无已验证方法论 → 先跑 methodology-bootstrapping 实验，收敛后再提取）。contracts-lint 只是结构/可移植性门（L1），不是方法论有效性门。monitor 运行时接线（前台顺序 loop、dispatch 按 `(pipeline_id, phase)` 注入并 invoke skill）显式排除，稍后单独立项。

## Goals

1. execution 的 ready / decomposing / evaluating 与 authoring 的 draft / refining 各有一个随 epicd 发布、住 `plugin/skills/` 的执行 skill；**exploration/spike 因无已验证的探索方法论，拆出本 epic**，交由独立的 methodology-bootstrapping 实验收敛后再提取（见 Sub-Task Decomposition 末的 split-out 说明）。
2. 每个 skill 按其 phase 背后方法论的状态用**正确的创建路径**建成：extract（已收敛方法论 → `/baime:knowledge-extractor`）/ mechanical（无方法论的薄 CLI 封装 → feature-to-backlog）；一律产出 epicd-native 操作/执行 skill，不 wholesale 复制 baime 方法论 skill。
3. 每个 skill 自带 `contracts:` 守卫 + 测试，且 epicd 仓库内有强制 contracts-lint 机制（不动点 #3）；**且每个已发布 skill 声明 `provenance:`，由 provenance 门强制溯源到一个已收敛实验/已验证方法论（extract）或声明为机械封装（mechanical）**——把「已验证方法论」与「hand-write + lint」区分开。
4. 全部新 skill 无 baime **运行时**依赖（D-7-bis 可移植性；允许 documentary 的 provenance 引用）。
5. skill 只描述并驱动 phase 工作，不触动引擎核心机制（complete/adjudicate/DoD 重跑/merge-lock/worktree/claim/pipeline-as-data）。
6. **contracts-lint 与各子任务的测试只验证结构与机制（L1/L2），不充当方法论有效性门（L3）**；有效性由源实验继承（extract）或不适用（mechanical）；任何缺已验证方法论的 phase 一律走实验路径，而非在本 epic 里 hand-write 一个 skill 用 lint 收口。

## Sub-Task Decomposition

> 每个 child 标注**创建路径类型**〔infra｜extract｜mechanical〕与 **provenance**。

1. **〔infra〕skill 脚手架 + contracts-lint + provenance 门** — 在 epicd 仓库内建：一个共享 SKILL 结构范式（λ-spec + `contracts:` frontmatter + finalise 写回约定，参照 feature-to-backlog 收敛为 epicd-native 最小形态）；`plugin/scripts/skill-lint.sh`（contracts 自检）；`src/test/skill-contracts.test.ts`；`src/test/phase-skill-coverage.test.ts`（读 pipeline.ts machine phases 对齐已发布 skill）；**`src/test/skill-provenance.test.ts` + `provenance:` frontmatter 约定**（extract 须 cite 源实验/方法论且可解析；mechanical 须声明「无方法论」）。这是不动点 #3、Goal 3、Goal 6 的强制机制。现状 epicd 插件里**无任何 lint/validate/provenance 脚本**（只存在于 baime），故为真实基建交付而非行政 stub。**创建路径**：feature-to-backlog（这是真代码基建，TDD 合适）。**provenance**：本身是基建，不适用方法论 provenance。**明确边界**：contracts-lint 检查 skill 的形状与可移植性，**不检查方法论有效性**。

2. **〔extract〕primitive-executor skill（execution/ready，keystone）** — 把**已由实验收敛的 LFDD 执行方法论**（读任务 Description 的 `## Phase` 计划 → 先写测试 → 实现 → 跑结构化 DoD → checkpoint）**提取**成可独立 invoke 的 epicd skill，内容对应今日已内联在 `renderBasicReadyDispatch` 的 payload。**创建路径**：`/baime:knowledge-extractor`（从 LFDD 实验产物提取），**不是** feature-to-backlog 的 fresh TDD build。**provenance**：LFDD methodology-bootstrapping 实验（`docs/research/baime-fixpoint-convergence/` 等，落地时填实验 id）。ready 是唯一已接生产 transport 的机器 phase，价值最高。

3. **〔extract + mechanical〕epic-lifecycle skills（execution/decomposing + evaluating）** — 一个 child 含两个薄 skill，**类型不同**：
   - **decompose skill〔extract〕**：epic → children JSON，包 `engine decompose-apply`。其中「**如何切分**」的判断 = ADR-018 分解启发式（从过度分解的真实失败里 codify 出来，并由 epic-to-backlog 实现），须**提取/引用**该已 codify 的启发式。**provenance**：ADR-018 + epic-to-backlog 分解逻辑。（若落地时判定 ADR-018 尚不足以算「已验证方法论」，该 skill 应改走 experiment 路径——见 Constraints 的升级条款。）
   - **evaluate skill〔mechanical〕**：聚合子任务终态，薄包 `engine evaluate`，确定性、无方法论判断。**provenance**：mechanical（声明无方法论）。此处 contracts-lint **确实**就够——因为没有方法论要验证。
   两者各对应已有的 `renderEpicReadyDispatch` / `renderEpicEvalDueDispatch`，引擎 handler 已存在；均薄，折成一个 PR（见颗粒度论证）。

4. **〔extract/reference〕authoring skills（authoring/draft + refining）** — draft/refine 的方法论**已作为 feature-to-backlog / epic-to-backlog 存在并在用**；本 child **提取/引用**该已验证方法论建成 epicd-native 的薄 draft/refine skill，**不 wholesale 复制、不重造方法论逻辑**（复用/抽取其 review-loop 结构）。**创建路径**：`/baime:knowledge-extractor` / 引用。**provenance**：feature-to-backlog / epic-to-backlog（**落地第一步须确认这两者自身的 provenance**：若它们本身就是已收敛实验的产物，则直接 extract；若其方法论未经实验验证，则该 child 降级为「先确认/补验证」，必要时同样升级为 experiment）。driver 尚未接生产 transport（E7/BACK-608），标注「运行时接线待后续」。

**Split-out（不在本 epic）：〔experiment〕spike（exploration/spike）** — **没有已验证的探索方法论**（「怎么 timeboxed 探索 + 怎么做 kill/promote 判断」从未经实验收敛）。因此**不在本 epic hand-write spike skill**——那正是「用结构 lint 冒充方法论验证」的反模式。改为**拆出为一个独立的 `/baime:methodology-bootstrapping` 实验**：Observe 真实 spike 执行 → Codify 探索 + kill/promote 决策方法论 → 达 V_instance/V_meta 阈值收敛 → **再** `/baime:knowledge-extractor` 提取成 epicd skill（那时才回到本类 epic 的形态）。运行时接线另待 BACK-641。落地方式：单独起一个 methodology-bootstrapping 实验条目（不是本 epic 的 Basic child）。

## Sequencing

- **child 1（脚手架 + contracts-lint + provenance 门）先行**：交付共享 SKILL 范式、lint 脚本、contracts/coverage/provenance 测试，是其余 3 个 skill child 的公共依赖（每个 skill 落地都要过 lint、登记覆盖清单、声明 provenance）。先落它，避免各子任务各自发明机制而分叉。
- **child 2（primitive-executor / ready，keystone，extract）紧随**：ready 是唯一已接生产 transport 的机器 phase，且 LFDD 实验已收敛、可直接提取，风险最低；只依赖 child 1。
- **child 3（decomposing extract + evaluating mechanical）**：引擎 handler 已存在，风险低；只依赖 child 1，可与 child 2 **并行**。
- **child 4（authoring extract/reference）**：第一步先确认 feature/epic-to-backlog 的 provenance；driver 未接生产 transport（E7/BACK-608），标注「运行时接线待后续」；只依赖 child 1，可与 child 2/3 **并行**。
- **spike（split-out experiment）与本 epic 解耦**：作为独立 methodology-bootstrapping 实验推进，其收敛节奏（多轮迭代）与本 epic 的 extract/mechanical child（单 PR）不同，不塞进本 epic 的 sequencing。
- 并行安全性：child 2–4 各写自己的 `plugin/skills/<name>/` 目录，冲突面仅限 `plugin/.claude-plugin/plugin.json` 的 commands 数组、phase→skill 覆盖清单与 provenance 登记——都是加法式追加，易于串行收尾合并。

## Integration Acceptance

> **这些门验证的是：结构（contracts）+ 可移植性（zero-baime-runtime）+ 覆盖 + provenance + 一条真实 e2e。它们不验证、也无法验证方法论有效性（L3）**——extract skill 的有效性继承自其源实验；mechanical skill 不适用；任何缺已验证方法论的 phase（spike）不在此发布 skill，改走实验。这正是「contracts 测试不能代替实验」的落地体现。

1. `bun test` — 全量测试套件（含各子任务单测 + 下列集成测试）通过。
2. `bun test src/test/phase-skill-coverage.test.ts` — **覆盖门**：从 `src/engine/pipeline.ts` 读出全部 `actor==="machine"` 的 phase，断言每个**要么**有一个已发布 + 已登记的 skill 目录，**要么**被显式标注为 `experiment-pending` 并指向其 methodology-bootstrapping 实验（spike 走此分支）——不 silently 漏任何 machine phase。
3. `bun test src/test/skill-provenance.test.ts` — **provenance 门（本次修订新增的关键门）**：每个已发布 phase skill 必须声明 `provenance:`，且 extract 类须 cite 一个可解析的源实验/已验证方法论、mechanical 类须显式声明「无方法论」；缺失或不可解析即 fail。此门把「已验证方法论的提取」与「hand-write + lint」区分开，是「lint 不能代替实验」的可执行断言。
4. `bun test src/test/skill-portability.test.ts` — **可移植性门（D-7-bis）**：已发布 skill 无 baime **运行时**依赖（无 `/baime:` invoke、无 `BAIME_SCRIPTS`、无 baime 脚本路径出现在可执行位置）；**允许** `provenance:` frontmatter 里对源实验/skill 的 documentary 引用（故用测试而非裸 `grep -rqi baime`，避免 provenance 引用触发误报）。
5. `bash plugin/scripts/skill-lint.sh --all` — 对每个已发布 skill 跑 `contracts:` 自检（L1 结构门）全部通过。
6. 端到端 smoke（证明 epic-lifecycle skill 所包的生产 dispatch 路径在装配后仍可驱动真实 epic，而非仅单测桩）：

   ```sh
   EID=$(bun run cli task create "coverage-smoke-epic" --labels kind:epic --plain | grep -oiP 'back-\d+' | head -1) \
     && bun run cli task edit "$EID" --phase decomposing \
     && bun run cli engine dispatch "$EID" | grep -q '^epic-ready:' \
     && bun run cli task archive "$EID"
   ```

   注：`engine dispatch` 按 `task.phase` 分支（`decomposing`→`epic-ready`），故须先 `task edit --phase decomposing`（`task create` 无 `--phase`）；task_prefix 为 `back`，`--plain` 内 id 多次出现，故 `grep -oiP 'back-\d+' | head -1`；末尾 `task archive` 清理，避免污染看板。

（第 2+3+5 项联合证成里程碑「每个 machine phase 要么有一个已发布、contracts 合法、有 provenance 溯源、无 baime 运行时依赖的执行 skill，要么显式 experiment-pending」；第 6 项驱动一条真实端到端引擎路径。全部为可执行 shell 命令。）

## Constraints

- **三分创建路径（本 epic 的核心纪律）**：每个 phase skill 按其背后方法论状态用正确路径建成——**extract**（已收敛方法论 → knowledge-extractor）/ **mechanical**（无方法论薄封装 → feature-to-backlog）/ **experiment**（无已验证方法论 → 先 methodology-bootstrapping 收敛再提取）。**禁止**对一个缺已验证方法论的 phase 直接 hand-write skill 并用 contracts-lint 冒充验证。
- **升级条款**：任一原定 extract 的 child，若落地时确认其源方法论**未经实验验证**（例如 authoring 的 feature/epic-to-backlog provenance 存疑、或 decompose 的 ADR-018 被判不足），该 phase **升级为 experiment 路径**（拆出为 methodology-bootstrapping 实验，如 spike），不得在本 epic 内 hand-write 收口。
- **skill 住在 epicd 仓库内**（`plugin/skills/`），无 baime 运行时依赖（D-7-bis）；参考 feature-to-backlog 的结构范式，但成品是 epicd 操作/执行 skill；authoring 子任务尤须遵守「复用/引用而非 wholesale 复制」。
- **不动核心机制**：engine complete/adjudicate/DoD 独立重跑/merge-lock/worktree 隔离/claim 语义、pipeline-as-data 与 interpreter scan 谓词——skill 一律不改。
- **每个已发布 skill 可独立 invoke、自带 `contracts:` 守卫 + 测试 + `provenance:` 声明**（child 1 提供强制机制）。
- **contracts-lint / 单测只验证结构与机制（L1/L2），不充当方法论有效性门（L3）**；有效性由源实验继承或不适用。
- **monitor 运行时注入显式出 scope**：前台顺序 loop、dispatch payload 改造、`(pipeline_id, phase)→skill` 注册表与运行时 invoke——留给下游单独任务。
- **exploration/spike 出 scope**（拆为独立实验）；authoring 的生产 transport 接线出 scope（E7/BACK-608）；相关 skill 只交付可独立 invoke 形态并标注「运行时接线待后续」。
- 每个 Basic 子任务 = 一个可独立评审的 PR（ADR-018，~2000 行上限）；子概念用 Phase→Stage 内部组织。

## 颗粒度论证（ADR-018）

6 个机器 phase → **本 epic 4 个 child（1 infra + 3 skill）+ spike 拆出为独立实验**：

- **decomposing + evaluating 折成一个 child（child 3）**：二者各自都是薄「读 epic → 一条引擎 CLI 调用」（引擎 handler 已存在），单独任一不具 PR 级分量；虽类型不同（decompose=extract、evaluate=mechanical），但同属 epic-lifecycle、同一 PR 交付更省协调固定成本，故折。
- **draft + refining 折成一个 child（child 4）**：镜像 feature-to-backlog 的两阶段、共享同一 review-loop、同批「运行时接线待后续」，作为一对 authoring skill 一起提取更合理。
- **primitive-executor（ready）独立成 child（child 2）**：keystone、唯一已接生产 transport、LFDD 提取分量足、验收独立。
- **spike 拆出本 epic（不再是 child）**：它缺已验证方法论，本质是一个 methodology-bootstrapping **实验**（多轮迭代、以 V 阈值收敛），与本 epic 的 extract/mechanical（单 PR）异质；塞进来会污染 epic 的验收模型。拆出后本 epic 保持同质（全 extract/mechanical/infra）。
- **脚手架 + contracts-lint + provenance 门独立成 child 1**：epicd 现状无任何 lint/validate/provenance 机制（只在 baime），而不动点 #3、Goal 3/6 要求 epicd 内有强制机制；是被全部 skill child 复用的真实基建，须先落且独立可验收，非行政 stub。

epic 判据（两条均成立）：(a) ≥2 个独立可评审/可合并交付（lint 基建、keystone extract skill、epic-lifecycle skills、authoring skills，互不为彼此的步骤）；(b) 合计规模——lint 基建 + provenance 门数百行、3 个 skill child 各含 SKILL.md（~150–400 行）+ 测试，落在 3000–5000 行量级，对 ~2000 行上限有实质余量。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal approved (task description authored as detailed proposal with explicit 不动点). Starting plan draft.

Epic proposal approved (description authored as detailed epic proposal). Starting epic plan draft.

cap:propose=approved. 计划已按 extract/mechanical/experiment 三分重写：4 个 child（infra lint 基建 + primitive-executor[extract LFDD] + epic-lifecycle[decompose extract / evaluate mechanical] + authoring[extract/reference]）；spike 拆出为独立 methodology-bootstrapping 实验（无已验证探索方法论）；集成验收新增 provenance 门，显式声明 contracts-lint 不充当方法论有效性门。

决策（phase→skill registry 归属）：(pipeline_id,phase)→skill 的代码 registry 折入本 epic child 1，与其 phase→skill 覆盖 manifest 同一份（单一真值），不另立任务；CLI/web surfacing 作为 child 1 的可选追加或后续小任务。手动驱动第一版用 docs/task-lifecycle-model.md §6 的文档表即可，不阻塞。monitor（DRAFT-16）消费同一 registry。

child 3（epic-lifecycle）scope 追加（BACK-665 自我强制回路）：evaluate 交付物不能只聚合子任务 terminal phase。现状 engine evaluateEpic（src/harness/evaluator.ts:54-65）仅做 any child needs-human→needs-human / all done→done——epic 会在其 Integration Acceptance 从未运行的情况下 go done（ADR-019 gap，正是「子任务全绿但业务目标未达成」的根因）。故 evaluate skill 与/或 evaluateEpic 必须**运行 epic 的 Integration Acceptance 并据此 gate**。BACK-665 的 evaluate 判据 = bun scripts/fixpoint-back665.ts --with-suite exit 0。
<!-- SECTION:NOTES:END -->
