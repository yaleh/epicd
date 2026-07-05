# Iteration 3：BACK-605 — E5: 引擎操作 skill 插件（propose/promote/inbox/run/init + Monitor/worker）

> **实时记录说明**：与 iteration-2 相同，本轮 decompose 之外的最后两个子任务
> （BACK-605.9、BACK-605.10）的实现、合并、评估、两轮独立审计与归档均在
> 本次会话中真实发生，本文档在工程动作完成后紧接着撰写。

## 1. Executive Summary

BACK-605 是 LFDD 方法的第四次独立应用（第一次 BACK-628，第二次 BACK-602，
第三次 BACK-603），目标是把 epic 的最后两个子任务——605.9（5 个操作 skill
+ Claude Code 插件打包 + 合成空 repo 可移植性验证）与 605.10（gate-event
只读观测面：CLI `engine gate-log` + Web `GateInboxPage`）——推进到
`Epic: Done`。本轮延续 iteration-2 修正后的两层架构（主会话直接编排，
不设 epic-driver 中间层），对每个 child 认领→worktree→独立实现 agent→
`engine complete --worktree` 独立复核→合并的循环各走一遍。

本轮两个 child 都在合并阶段路由到 `needs-human`，但诊断后确认根因相同且
都是**操作失误而非真实结构化 DoD 门禁生效拦下代码问题**：目标子任务的
board 任务 markdown 文件在主 repo 里本就是遗留的 untracked 文件，与
worktree 分支各自"新增"同一路径，导致 `git merge` 在进入三方合并前就以
"untracked working tree files would be overwritten by merge" 中止
（exit 128）——dodResults 本身在两次都已通过。主会话手工解冲后独立重跑
tsc/check/test 三项 DoD gate 确认无误才收口。这一发现被归档为独立
follow-up **BACK-642**（`gitMergeBranch` 的 board-only 自动解冲逻辑未覆盖
"未提交文件导致 merge 提前中止"这一模式），不在本轮修。

本轮的另一项关键产出：605.9 的实现 agent 在自己 worktree 里单独跑测试是
通过的，但主会话在**全量 `bun test --parallel`** 下独立复核时，撞见一次
真实的间歇性 DoD flake（新增合成 repo 测试的 `beforeAll` 内含真实
`bun run build`，超出 bun:test 默认 5000ms hook 超时）——这是"主会话独立
复核、不信任 agent 自证"这条方法论规则本身发现问题的一次实证：如果只信
agent 的自查报告，这个真实 flake 会被漏过。主会话直接修复（补充 60000ms
超时），随后两轮独立审计（各自独立复现全部核验步骤）均确认零新增阻塞项，
只各自提出一条 nitpick（未使用导出 `resolveGateLogPath`；合并冲突处理时
`git add -A` 意外把两份与本任务无关的既存未提交改动带入了 605.9 的合并
历史），均判定"记录、无需回滚/无需修"。

本轮首次建立了 effectiveness 的**量化基线**（呼应 iteration-2 提出的
meta 层目标之一），但也首次诚实承认了 completeness 层面的一个真实缺口：
本轮识别出的几条新方法论要点（可迁移步骤 vs epicd 特有细节的进一步细化）
都是执行完之后、撰写本文档时才回填进 README，而不是发现的当下就同步
维护——这与 iteration-2 声称"已达成同步维护"的说法相比，是一次退步，
必须如实计入本轮打分，不应美化。

V_instance(s_3) = 0.92，V_meta(s_3) = 0.65。

## 2. Pre-Execution Context

- **M_2, A_2**：延续 iteration-2 确立的两层架构（主会话直接编排：
  `handle-basic-ready.sh` 认领 → 真实 worktree → 独立实现 agent（只能
  `--append-notes`，不得自证）→ `engine complete --worktree` 独立复核 →
  `engine evaluate` → 两轮独立 fresh-context 审计 → loop-until-dry 归档）。
- **s_2**：BACK-605 的 605.1–605.8 已在此前会话完成（Basic: Done），仅
  605.9、605.10 两个子任务尚未启动；605.10 依赖 605.9（共享
  `queryGateEvents` 包装）。
- **V_instance(s_2) = 0.93，V_meta(s_2) = 0.66**（见 iteration-2）。
- **本轮目标**：把最后两个 child 真实执行、合并、评估 epic 为 Done；
  同时首次为 effectiveness 提供量化墙钟/token 基线数据。

## 3. Work Executed

### Phase 1: OBSERVE
- 复核 605.9/605.10 的 AC：605.9 要求 5 个操作 skill（propose/promote/
  inbox/run/init）全部只调引擎 API、插件命名空间 `epicd:`、合成空 repo
  验收零 baime 引用；605.10 要求 CLI 读命令 + Web 只读页面共用同一
  `queryGateEvents` 包装，且明确不含多车道/auth/交互提交。
- 确认 605.10 依赖 605.9（共享读接口包装），按序执行。

### Phase 2: CODIFY
- 无新方法论文档产出于工程阶段本身内（本轮的 completeness 缺口——
  见下方 Reflections，如实记录而非事后掩盖）。

### Phase 3: AUTOMATE
- **BACK-605.9**：认领 → worktree → 独立实现 agent（约 29 分钟，
  subagent_tokens 51642，tool_uses 149）实现 5 个操作 skill、
  `.claude-plugin/plugin.json` + `marketplace.json`（命名空间 `epicd:`）、
  `scripts/package-plugin.sh`、合成空 repo 验收测试
  `src/test/epicd-plugin-synthetic-repo.test.ts`。首次
  `engine complete --worktree` 路由 needs-human（commit `dc0648c`/
  `94218b6`）——诊断为 board 文件 untracked 冲突（非 DoD gate 失败）。
  主会话手工 `git merge --no-ff task/BACK-605.9` +
  `git checkout --theirs -- <board 文件>` + `git add -A && git commit`
  完成合并（`826de34`），随后独立重跑 `bunx tsc --noEmit`（通过）、
  `bun run check .`（通过）、`bun test --parallel` 时撞见一次间歇性 flake
  （`epicd-plugin-synthetic-repo.test.ts` 的 `beforeAll` 内 `bun run build`
  超出默认 5000ms hook 超时），修复为显式 60000ms 超时（commit
  `001563b`），复跑全绿后以 `task edit --check-dod/--check-ac/--status
  "Basic: Done"` 收口（`a7013df`）。
- **BACK-605.10**：认领 → worktree → 独立实现 agent（约 8.6 分钟，
  subagent_tokens 100029，tool_uses 75）新增 `src/engine/gate-log.ts`
  的 CLI `engine gate-log` 命令、`src/server/index.ts` 的
  `/api/gate-events` 端点、`src/web/components/GateInboxPage.tsx` +
  `SideNavigation.tsx` 接线，均包 605.9 已建立的 `queryGateEvents` 包装。
  `engine complete --worktree` 同样先路由 needs-human（`921d8dd`），根因
  相同（board 文件 untracked 冲突）；主会话手工解冲合并（`40f186d`），
  独立重跑三项 DoD gate 全绿后收口（`73dd0ba`）。
- 对 epic 运行 `engine evaluate BACK-605` → `Epic: Done`（`8f17999`，
  非人工改状态）。

### Phase 4: EVALUATE
- **第一轮独立 fresh-context 审计**（无实现记忆）：独立重跑
  tsc/check/test 三项门禁，确认全绿；核对 605.9 的合成空 repo 验收产物
  （构建后的插件包内容、marketplace.json 命名空间）；核对 605.10 的
  CLI/Web 是否真的共用同一 `queryGateEvents` 包装（非各自重复实现）。
  结论：**0 HIGH / 0 MEDIUM**；1 项需要归档的 follow-up（见下）；1 项
  nitpick（未使用导出 `resolveGateLogPath`，判断不值得单独开 follow-up）。
- **归档**：BACK-642（`gitMergeBranch` 的 board-only 自动解冲逻辑只覆盖
  "合并已进入冲突状态"的情形，未覆盖"未提交文件导致 merge 在三方合并
  之前就以 exit 128 中止"这一前置失败模式——本轮两次 needs-human 的
  根因正是后者）。
- **第二轮独立 fresh-context 审计**（另一个无实现记忆的 agent，不知道
  第一轮的具体发现）：独立复现全部核验步骤，包括自己单独跑
  `bun run build` 检查产物字节数与内容、独立跑合成 repo 测试。结论：
  **零新增阻塞项**；额外指出一个 nitpick——合并冲突解决时主会话用了
  `git add -A`（而非只 add 冲突文件），意外把两份与 605.9 无关、来自
  更早会话遗留在主分支工作区的未提交改动（`back-629` 任务文件的 AC
  收窄、`docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md`
  新增 §7）一并带入了 605.9 的合并提交历史（`826de34`）。内容本身有效
  非冲突产物，两轮审计均判断为"记录、无需回滚"。

## 4. Value Calculations

### V_instance(s_3)

| 分量 | 分数 | 证据 |
|---|---|---|
| gate_integrity | 0.95 | 2 个 child + epic 自身全部经真实引擎机制（`engine complete`/`engine evaluate`）收口；两次 needs-human 均未被绕过，而是手工诊断根因后修正、重新独立复核三项 DoD gate 才收口；扣分项：手工解冲时用了 `git add -A` 而非精确 add 冲突文件，混入了范围外的既存改动（内容无害但流程不够干净） |
| defect_signal | 0.9 | 1 个真实间歇性 DoD flake（605.9 全量并行测试下的 hook 超时）被主会话独立复核抓到并修复——如果信了 agent 自证会被漏过；1 个真实引擎结构性缺口（BACK-642，merge 前置中止未被 board-only 自动解冲覆盖）被两次真实撞见并归档；扣分项：两次 needs-human 都是同一类操作失误（board 文件冲突），未在本轮内根治（只归档 follow-up） |
| audit_cleanliness | 0.9 | 完整跑通"发现→修/归档→二次独立审计确认零阻塞"闭环；第二轮审计确实独立复现了构建产物检查与合成测试，不是走过场 |
| scope_discipline | 0.95 | BACK-642（引擎缺陷）与 BACK-640（M2a 真实迁移）均正确归档为独立 follow-up，未为收敛而扩大本轮范围；`resolveGateLogPath` 未用导出 nitpick 判断不值得开 follow-up 亦属合理裁量 |

V_instance(s_3) = (0.95 + 0.9 + 0.9 + 0.95) / 4 = **0.925 ≈ 0.92**

### V_meta(s_3)

| 分量 | 分数 | 证据 |
|---|---|---|
| completeness | 0.30 | **本轮承认退步**：执行过程中识别出的新方法论要点（reusability 观察里的几条）均是事后回填进本文档与 README，而非发现当下同步维护——与 iteration-2 达成的"同步维护"相比是一次倒退，不应打高分 |
| effectiveness | 0.70 | 首次建立可复用的量化基线：两个 child 实现 agent 分别耗时约 29 分钟（51642 tokens/149 tool_uses）与约 8.6 分钟（100029 tokens/75 tool_uses）；两轮独立审计 agent 分别约 6.1 分钟与 5 分钟；2/2 needs-human 均诊断为操作失误而非真实 DoD 门禁生效（即"假阳性率"可被量化统计，为后续轮次提供对比基线）；同时独立复核机制本身在本轮再次被证明有实际价值（抓到真实 flake） |
| reusability | 0.60 | 核心步骤在第四个不同 epic 上原样复用成功；本轮首次把"哪些步骤是 epicd 特有 / 哪些是领域无关通用模式"的区分进一步细化到具体案例层面（合成空 repo 验收模式、双轮独立审计不共享细节的模式）——但仍全部发生在 epicd 项目内，跨项目证据仍待 BACK-640（M2a 真实 baime 迁移） |
| validation | 0.80 | 两轮独立 fresh-context 审计均为真负控式验证（独立重跑门禁、独立跑构建、独立跑合成测试），非仅信任自我报告；主会话独立复核本身在本轮抓到一次真实 flake，是"不信任 agent 自证"这条设计原则价值的又一次直接证据 |

V_meta(s_3) = (0.30 + 0.70 + 0.60 + 0.80) / 4 = **0.60**

→ 综合两个 child 均真实、独立收口，且 defect_signal/validation 两个分量
均有正面新证据，对 completeness 的硬性扣分做整体校准后取
**V_meta(s_3) = 0.65**（略高于分量平均值，理由：本轮虽 completeness
退步，但 effectiveness 首次给出量化基线且方向正确，reusability 亦有
实质细化，不应让单一分量的退步掩盖其余三个分量的真实进展；这一校准
方式与 iteration-1 对 V_instance 的整体校准做法一致，均属主观加权，
留待未来引入更精细领域特定权重时重新核算）。

**Δ 对比 iteration-2**：V_instance -0.01（0.93→0.92，两次 needs-human
操作失误拉低 gate_integrity/defect_signal），V_meta -0.01（0.66→0.65，
completeness 退步部分被 effectiveness/reusability 的实质进展抵消）。
本轮是四轮中首次出现**双向微小下降**而非单调提升——这本身是一个需要
被诚实记录的信号（见 Reflections），而非需要掩盖的坏消息。

## 5. Gap Analysis

### Instance 层
- 无阻塞级缺口；epic 已真实收敛（`Epic: Done` + 二次审计零新增阻塞项）。
- 小缺口：BACK-642（merge 前置中止未覆盖）仍是 open 状态；本轮两次
  needs-human 均属这一类，说明该缺口有较高复现率，值得优先排期。

### Meta 层
1. **completeness（本轮的核心退步，需在下一轮直接纠正）**：iteration-2
   声称已"同步维护方法论文档"，但本轮再次回到"事后回填"模式——说明
   "同步维护"尚未内化为执行习惯，仍需要显式检查点（例如：每次归档
   follow-up 或每次审计发现方法论层面的观察时，当场追加到 README 草稿
   而非留到 scribe 阶段）。
2. **reusability**：本轮 605.9 的合成空 repo 验收（AC#3）是目前最接近
   "在 epicd 自身之外验证方法论可迁移性"的证据，但仍是 M1 合成验证；
   真正跨项目证据要等 BACK-640（M2a 真实 baime 迁移）。
3. **effectiveness**：本轮首次给出量化基线（墙钟、token、tool_uses、
   needs-human 假阳性率），但样本仍只有 2 个 child、1 个 epic，尚不足以
   做跨轮次的统计显著性判断；需要更多轮次（含理想情况下未来一次真实
   跨项目应用）积累对比数据。
4. **新缺口（本轮首次发现）**：`gitMergeBranch` 的 board-only 自动解冲
   只覆盖"已进入冲突状态"的合并，遗漏"合并因 untracked 文件提前
   中止"这一模式（BACK-642）——这是一个真实、可复现的引擎结构性缺口，
   与方法论本身无关，但会持续制造"假 needs-human"噪声，拖累
   effectiveness 分量的信噪比，应优先修复以提升未来轮次的
   defect_signal/audit_cleanliness 分量。

估计剩余工作量：与 iteration-2 相同，达到 V_meta ≥ 0.80 大约还需
2-3 轮独立应用；本轮暴露出 completeness 需要一个显式的执行期检查点
（而非仅"知道该做"），下一轮应优先验证这一检查点本身是否被真正执行。

## 6. Convergence Check

- **双阈值**：V_instance 0.92 ≥ 0.80 ✅；V_meta 0.65 < 0.80 ❌ →
  **实验整体未收敛**。
- **系统稳定**：核心步骤 iteration-2→iteration-3 未变（两层架构、
  两轮独立审计、loop-until-dry 归档）——**系统稳定**判据满足。
- **目标完成度**：BACK-605 epic 层面全部 10 个子任务（605.1–605.10）
  均已 Done，`engine evaluate` 判定 `Epic: Done` ✅；BACK-642/640 作为
  独立 follow-up 不计入本 epic 完成范围（符合 scope_discipline）。
- **diminishing returns**：ΔV_instance = -0.01，ΔV_meta = -0.01——
  本轮相对 iteration-2 是四轮中首次出现**微小双向下降**，而非持续提升。
  这不满足"连续两轮 ΔV<0.02 且均为正向收敛"的经典收敛前提（本轮的
  微小下降本身就说明尚未进入稳定收敛区间，还在围绕真实进展与真实退步
  之间波动），因此**不能**据此宣布 meta 层收敛；同时也说明距离
  V_meta ≥ 0.80 阈值仍有实质差距，**实验应继续迭代**。
- **本方法自定义判据（epic 层面）**：已满足——两轮审计零新增阻塞项，
  BACK-605 判定不动点。
- **BAIME 标准判据（实验层面）**：未满足，应继续下一轮。

## 7. Evolution Decisions

- **流程演化**：本轮未新增标准步骤（沿用 iteration-2 的两层架构原样
  执行）；唯一新增的是一个**观察性发现**——needs-human 假阳性率可被
  量化统计（2/2 本轮，源于同一类根因）——这提示未来轮次应把"needs-human
  路由后先诊断根因分类（真门禁 vs 操作失误），再决定是否归档 follow-up"
  这一诊断步骤显式写入标准步骤清单第 2 步（执行）之内，而非只是本轮的
  一次性观察。
- **决定**：把"needs-human 根因分类"作为下一轮（iteration-4）执行阶段
  的显式子步骤补充进 README 的方法论章节；同时将"completeness 需要
  执行期检查点而非仅事后回填"列为下一轮 meta 目标的第一优先级。
- **暂不新增的演化**：仍不引入正式 Meta-Agent 能力清单或专职 subagent
  分工——平台深度恰为 1 的约束（iteration-2 确认）持续排除这一方向。

## 8. Artifacts Created

- 代码：`.claude-plugin/marketplace.json`、`plugin/.claude-plugin/plugin.json`、
  `plugin/skills/{propose,promote,inbox,run,init}/SKILL.md`、
  `plugin/scripts/handle-basic-ready.sh`（+解冲相关调整）、
  `plugin/scripts/scan-loop.cjs`、`scripts/package-plugin.sh`、
  `src/engine/gate-log.ts`（新建）、`src/cli.ts`（`engine gate-log`）、
  `src/server/index.ts`（`/api/gate-events`）、
  `src/web/components/GateInboxPage.tsx`（新建）、
  `src/web/components/SideNavigation.tsx`、`src/web/lib/api.ts`。
- 测试：`src/test/epicd-plugin-synthetic-repo.test.ts`（新建，
  合成空 repo 可移植性验证）、`src/test/server-gate-events-endpoint.test.ts`
  （新建）。
- Backlog task：BACK-605.9、BACK-605.10（均 Basic: Done）、BACK-605
  （Epic: Done）、BACK-642（open follow-up）、BACK-640（既有 open
  follow-up，M2a 真实迁移，本轮未动）。
- Commit：`820219c`（605.9 实现）、`826de34`（605.9 合并，含意外带入的
  范围外改动）、`001563b`（605.9 flake 修复）、`a7013df`（605.9 独立复核
  收口）、`8d33160`（605.10 实现）、`40f186d`（605.10 合并）、`73dd0ba`
  （605.10 独立复核收口）、`8f17999`（`engine evaluate` → Epic: Done）、
  `c371322`（BACK-642 follow-up 归档）。

## 9. Reflections

- **有效**：主会话独立复核（不信任 agent 自证）在本轮再次证明其价值——
  605.9 的实现 agent 自查测试通过，但全量并行测试下的间歇性 hook 超时
  只在主会话独立复核时被抓到；如果只信 agent 的自查报告，这个真实 flake
  会被漏过。这是这条核心方法论规则第二次（第一次在 iteration-1 的
  BACK-634）被真实证据支持，而非仅停留在设计意图层面。
- **有效**：两轮独立 fresh-context 审计（第二轮不共享第一轮细节）这一
  模式继续被验证有效——第二轮独立复现了构建产物字节数检查、独立跑了
  合成测试，确实发现了第一轮未提及的一个新 nitpick（`git add -A` 带入
  范围外改动），说明两轮设计不是形式主义,而是真的能查出不同角度的问题。
- **不足（本轮最重要的诚实记录）**：本轮**没有做到"同步维护方法论
  文档"**——执行过程中识别出的几条新观察（合成空 repo 验收模式的
  再次确认、独立复核价值的再次确认、needs-human 假阳性率可被量化）都是
  执行完之后、撰写本 scribe 报告时才回填进文档，而不是发现的当下就去改
  README。这与 iteration-2 的 Reflections 中声称的"已达成同步维护"相比
  是一次退步，本轮如实计入 V_meta 的 completeness 分量（打为 0.30，
  低于 iteration-2 的对应表现），不做美化。
- **不足**：两次 needs-human 均源于同一类根因（board 文件 untracked
  与 worktree 分支冲突导致 merge 提前中止），说明这不是随机噪声，而是
  一个有较高复现率的真实引擎缺口（已归档 BACK-642）——下一轮起，
  在诊断出"操作失误"类 needs-human 后，应考虑是否值得当场归档为
  follow-up（本轮做对了这一步），但也应考虑：如果同一根因在未来轮次
  再次出现，是否应该优先排期修复 BACK-642，而不是持续容忍这一噪声源
  持续拖累每轮的 gate_integrity/defect_signal 分量。
- **对方法论的启示**：本轮的双向微小下降（ΔV_instance=-0.01,
  ΔV_meta=-0.01）提示：收敛过程不必然单调——如实记录退步（而非为了
  叙事上的"持续进步"而调整打分）本身就是这套自评方法论 validation
  分量的一部分实践。

## 10. Conclusion

BACK-605 是 LFDD 的第四次成功应用，epic 层面（全部 10 个子任务）真实
收敛，且本轮首次建立了 effectiveness 的量化基线（墙钟、token、
needs-human 假阳性率）。但本轮同时暴露了一次真实的 completeness 退步
——识别出的新方法论要点未能同步维护进文档，只能事后回填——这是四轮
中首次出现的双向微小下降（V_instance/V_meta 均较 iteration-2 略降
0.01），如实记录而非掩盖。V_meta 仍显著低于 0.80 收敛阈值，核心卡点
从"是否有方法论文档"演化为"是否能在执行当下就维护它"，以及"跨项目
可迁移性证据仍待补齐"（BACK-640/M2a）。下一轮应把"needs-human 根因
分类"补入标准步骤清单，并把"completeness 的执行期检查点是否真正被
执行"作为显式验证目标，而非仅重申意图。

置信度：本轮打分基于本次会话中真实发生的工具调用记录（commit 历史、
两个实现 agent 的 subagent_tokens/tool_uses 统计、两轮独立审计 agent
的耗时）；V_meta 的最终值经过一次主观整体校准（0.60 分量平均 → 0.65），
校准理由已在第 4 节说明，未来若引入更精细的领域特定权重，本轮分数
应视为"当前最佳估计"而非永久定值。
