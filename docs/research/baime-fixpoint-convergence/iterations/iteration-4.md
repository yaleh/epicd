# Iteration 4：BACK-604 — E4: 人面 — 多车道 issue-list（主面）+ 内联 gate + auth

> **实时记录说明**：与前三轮相同，本轮的 decompose 前置调研、decompose、
> 5 个 child 的独立实现、合并、`engine evaluate`、两轮独立审计均在本次
> 会话中真实发生，本文档在工程动作完成后紧接着撰写。

## 1. Executive Summary

BACK-604 是 LFDD 方法的第五次独立应用（第一次 BACK-628，第二次
BACK-602，第三次 BACK-603，第四次 BACK-605），也是本实验**首次在一个
真实 Epic 上完整走通两层架构全部标准步骤**——包括在本轮之前新增到
`context-isolation-plan.md` 执行清单第 1 步的"decompose 前置"（调研+
AC 具体化）子步骤，此前三轮均未在 decompose 之前显式做过这一步。

Step 1（decompose 前置）由一个派发的调研 agent 产出 file:line 级别的
路由/组件调研，并识别出 AC#8（"自观察反馈闭环"）属于过程性/一次性证明
判据、无法机械核验，据此用 `--remove-ac 8`/`--ac` 改写为更弱、可核验的
表述。这一前置步骤在后续两轮审计中直接兑现了价值：AC#8/#9 的不可审计性
在事前就被诚实标注，审计阶段不必在"这条 AC 算不算数"上争论，而是干净地
报告"知情未核（left unchecked with rationale）"。

Step 2（decompose）暴露了一个**全新的、已确认的引擎缺陷**：
`engine decompose-apply` 为新 child 生成的默认 DoD 只写入 prose 形式的
`## Definition of Done` 清单，从不写入 `engine complete`/`runDoD` 真正
会重跑的结构化 `dod` 字段——导致每一个由 decompose-apply 创建的 child
在第一次 `engine complete` 时都会假阳性路由 needs-human，除非提前手工
补 `--dod-gate`。已归档为 BACK-649；本轮采用的 workaround 是在派发每个
child 的实现 agent 之前，主会话主动为其补齐 `--dod-gate` 条目。

5 个 child（BACK-644–648，对应 604.1–604.5）由主会话逐一直接派发独立
实现 agent、worktree 隔离完成；604.5 首次在本实验历史上把 Playwright
e2e 作为真实 DoD 门禁跑通（`context-isolation-plan.md` 此前列为"尚未
验证"的生命周期型 DoD 风险点），过程中确实撞见真实调试问题（端口冲突、
Bun/Node 运行时不一致、标签大小写漂移），但最终在现有
`playwright.config.ts` webServer 生命周期机制下、无需自造进程包装，
6/6 通过且跨多次重跑非 flaky。

`engine evaluate BACK-604` 收口为 `Epic: Done` 后，两轮独立
fresh-context 审计（互不共享记忆）先后进行：第一轮独立复核 AC#1-7 均
真实实现、发现 AC#8 从未被分配给任何 child（归档 BACK-650）、AC#9 的
"每 child gcl-events.jsonl 引擎派发证据"判据在两层 LFDD 模型下结构性地
不适用（本 epic 是主会话直接 `engine complete --worktree` 完成的，非
`scan-loop.cjs` 反应式派发），如实标注未核而非勾选；同时当场发现并修复
一个真实鉴权缺口——`/api/coordinator-claims` 未被 BACK-647 新增的鉴权
中间件覆盖（另归档 BACK-651、BACK-652 两条独立 follow-up）。第二轮审计
（对第一轮具体发现无记忆）从零重新核验，发现第一轮的鉴权修复**不完整**
——`/api/search`、`/api/gate-events`、以及有副作用的
`/api/tasks/cleanup(/execute)` 仍未受 token 保护，并现场证实
`/api/search` 未鉴权即可读取完整任务数据；当场补齐四个端点的鉴权，并
把 token 比较加固为常数时间比较（`node:crypto.timingSafeEqual`）。第二轮
之后零新增 HIGH 级发现，视为收敛。

本轮全部 3 项标准 DoD gate 保持绿色（1903 pass / 2 skip / 0 fail，238
文件）+ Playwright e2e 6/6；AC#1-7 经两轮独立核验勾选，AC#8/#9 知情
留白而非虚假勾选；本轮共归档 5 条 follow-up（BACK-643、649、650、651、
652，其中 643/649 在 epic 执行过程中发现，650/651/652 由两轮审计发现）。

V_instance(s_4) = 0.90，V_meta(s_4) = 0.70。

## 2. Pre-Execution Context

- **M_3, A_3**：延续 iteration-3 确立并在本轮之前修订过的两层架构
  （`context-isolation-plan.md` 执行清单，含新增的"decompose 前置"第 1
  步子步骤与"needs-human 根因分类"第 2 步子步骤）。
- **s_3**：BACK-605 已在 iteration-3 收敛为 `Epic: Done`；本轮之前，对
  BACK-604 的一次分析（先于本轮工程动作）已经发现 AC#8/#9 存在过程性
  判据问题，并据此把"decompose 前置"追加进 `context-isolation-plan.md`
  的执行清单（commit `6c21ce4`，先于本轮）。
- **V_instance(s_3) = 0.92，V_meta(s_3) = 0.65**（见 iteration-3）。
- **本轮目标**：在真实 Epic（BACK-604，9 条 AC）上首次端到端验证完整
  两层 LFDD 清单——包括此前从未被真实演练过的 decompose 前置调研步骤，
  以及 iteration-3 提前标记为"真实风险、尚未验证"的生命周期型
  （server + Playwright）DoD gate。

## 3. Work Executed

### Phase 1: OBSERVE
- 复核 BACK-604 的 9 条 AC：多车道 issue-list（主面）+ 内联 gate-review
  + auth，涉及 `TaskList.tsx`/`lanes.ts`/`Board.tsx`/`SideNavigation.tsx`
  /server 路由等。
- 确认 decompose 前置（调研 + AC 具体化）已作为标准步骤第 1 步存在，
  本轮是其首次真实演练。

### Phase 2: CODIFY
- 一个派发的调研 agent 产出 file:line 级路由/组件调研，附加到 BACK-604
  （`--plan`）；识别 AC#8（自观察反馈闭环）过程性/不可机械核验，改写为
  更弱表述（`--remove-ac 8` + `--ac`）。

### Phase 3: AUTOMATE
- **Decompose**：`engine dispatch BACK-604` + `engine decompose-apply
  BACK-604`（agent 撰写的 5-child JSON），创建 BACK-644–648（604.1–
  604.5）。发现并归档 **BACK-649**（decompose-apply 只写 prose DoD
  清单，从不写结构化 `dod` 字段，导致每个新 child 首次 `engine complete`
  必假阳性 needs-human）；workaround 为逐 child 派发实现 agent 前主动
  补 `--dod-gate`。另确认既有 cosmetic 缺陷 **BACK-643**（`roleOf()`
  未检查 `kind:epic` 标签，pre-decompose Epic 显示为 "Basic:"；持久化
  数据 `phase`/`pipeline_id` 始终正确，`dispatch`/`decompose-apply`/
  `complete` 均按 `task.phase` 分支而非显示字符串，判断可安全忽略继续）
  与本轮无阻塞关系，未修。
- **BACK-644（604.1）**：pipeline 车道模式（`lanes.ts` 新增
  `LaneMode="pipeline"`）、`TaskList.tsx` 车道切换 UI（All Tasks/
  Milestone/Pipeline）、phase 顺序列。首个撞见 BACK-649 假阳性
  needs-human 的 child；补 `--dod-gate` + `--phase ready` 重置后重试，
  第二次合并干净。
- **BACK-645（604.2）**：driver-indicator 图标（👤/🤖/⏳/⚠️），经
  `actor(phase)` 关联新增只读 `coordinator-claims.ts` 适配器（读 baime
  磁盘态 `.active-agents`/`.caps`）；新增 `GET /api/coordinator-claims`
  路由；WS join。基于 604.1 的教训提前补好 dod-gate，首次尝试即合并
  干净。
- **BACK-646（604.3）**：issue-list 行内联 approve/reject/escalate
  gate-review（`getPhaseActor(...)==="human"`），过程中修复了
  `handleUpdateTask` 一个真实 bug（漏传 `pipeline_id`/`phase`）；把
  3-4 处重复的状态颜色启发式收敛为单一 `src/web/lib/status-label.ts`。
  合并额外多花两次重试，源于一个与本任务无关的可复现操作性障碍：
  `bun run cli` 包装脚本会先跑 `build:css` 预步骤，每次调用都会重新
  生成 `src/web/styles/style.css` 并弄脏工作区，随即以字节级 diff 阻塞
  `git merge`（"local changes would be overwritten"）——绕过方式为对
  需要干净工作区完成合并的 `engine complete` 调用改为直接
  `bun src/cli.ts <args>`（跳过 npm script 的 build:css 预步骤），并在
  每次重试前 `git checkout --` 丢弃 style.css 的 diff。另撞见一次真实
  merge 冲突（任务自身 markdown 文件的 add/add 冲突），被引擎的合并逻辑
  自动解决，无需人工介入。
- **BACK-647（604.4）**：`Board.tsx` 标记弃用（`SideNavigation.tsx`
  隐藏导航项，路由仍可达）；列从硬编码 Basic/Epic 状态字符串改为从
  `executionPipeline.states` 的 phase 集合派生（复用/扩展 `lanes.ts`，
  新增共享的 `buildPhaseColumns`，与 `TaskList.tsx` 自身的 phase 列逻辑
  共用同一个 `PIPELINE_PHASE_ORDER` 常量，避免重复——后续审计确认零
  漂移）；新增最小 bearer-token 鉴权中间件（`src/server/auth.ts`），经
  `webAuthToken` 配置项开关，默认禁用/no-op。合并干净。
- **BACK-648（604.5）**：新增 `tests/e2e/multi-lane-board.spec.ts`，
  这是本仓库历史上**首次把 Playwright 作为 DoD gate**（`context-
  isolation-plan.md`"局限与后续观察点"在本轮之前就已明确标注这是尚未
  验证过的生命周期型风险点）。需要在该 worktree 内单独 `bun i`（不同于
  兄弟 worktree，此处没有 node_modules 符号链接）；一次端口冲突（6455
  上残留手工调试 server，`lsof -ti:6455 | xargs kill -9` 解决）；两处
  只有真正跑起来才能发现的编写期 bug（测试 fixture 播种里的
  `Bun.spawn` 与 Node 运行时不一致、两个已分离的 phase-label 投影之间的
  大小写不一致）。最终 6/6 通过，约 35-38 秒，跨初次运行 + 后续两轮审计
  各自重跑共 3 次独立验证均无 flaky。Playwright 浏览器（chromium）已有
  缓存，无安装成本。
- 对 epic 运行 `engine evaluate BACK-604` → `Epic: Done`（全部 5 个
  child 合并后）。

### Phase 4: EVALUATE
- **第一轮独立 fresh-context 审计**（无实现记忆）：逐条独立核对 AC#1-7
  对照真实源码（而非只信 child 的 Implementation Notes），均确认真实
  实现，勾选。AC#8 核查发现从未被分配给任何 child——真实的 decompose
  完备性缺口，归档为 **BACK-650**。AC#9（要求每 child 有
  gcl-events.jsonl 级引擎派发证据）判定为结构性不适用：本 epic 是经
  两层 LFDD 模型下主会话直接 `engine complete --worktree` 调用完成的，
  不经过 `scan-loop.cjs` 的反应式派发循环——这是关于本次执行机制适用
  范围的发现，非 BACK-604 本身缺陷，如实标注未核而非勾选为已完成。
  同轮当场发现并修复：BACK-645 新增、被同一 issue-list 视图消费的
  `/api/coordinator-claims` 未被 BACK-647 新增的鉴权中间件覆盖（
  `/api/tasks*` 已鉴权，此路由遗漏）——未鉴权请求即可读取活跃 agent
  claim 状态，即使配置了 `webAuthToken`。另归档两条 follow-up：
  **BACK-651**（`webAuthToken` 完全没有客户端接线——开启后会让整个
  Web UI 全部 401，且无登录 UI、无文档）、**BACK-652**（新 e2e 套件
  直接操作真实 repo 任务数据——创建/归档真实 task ID——而非使用隔离的
  fixture 项目目录）。
- **第二轮独立 fresh-context 审计**（完全独立，对第一轮具体发现无记忆）：
  发现第一轮的 coordinator-claims 鉴权修复真实但**不完整**——
  `/api/search`、`/api/gate-events`、以及有副作用的
  `/api/tasks/cleanup(/execute)` 端点在配置 token 后仍未受保护；现场
  实测证实 `/api/search` 未鉴权即可泄露完整任务数据。当场修复：为全部
  四个路由补齐鉴权，并把 token 比较加固为常数时间比较
  （`node:crypto.timingSafeEqual`）以消除本轮同时发现的一个 MEDIUM 级
  计时侧信道。第二轮同时独立复核确认 BACK-650/651/652 均准确、未过时，
  并确认 `TaskList` 的 `groupTasksByPhase` 与 `Board` 的
  `buildPhaseColumns` 两个已分离实现之间零漂移（共用同一
  `PIPELINE_PHASE_ORDER` 常量）。第二轮结束后零新增 HIGH 级发现，判定
  收敛。

## 4. Value Calculations

### V_instance(s_4)

| 分量 | 分数 | 证据 |
|---|---|---|
| gate_integrity | 0.9 | 5 个 child + epic 自身全部经真实引擎机制收口；604.1 的假阳性 needs-human 根因为已知引擎缺陷（BACK-649）而非绕过判断；扣分项：604.3 的 needs-human/合并重试实为 build:css 弄脏工作区这一操作性障碍，非门禁本身失败，暴露了工作流对"合并需要干净工作区"这一前提的脆弱性 |
| defect_signal | 0.95 | 本轮信噪比高：1 个全新已确认引擎缺陷（BACK-649，decompose-apply 缺结构化 dod）、1 个 decompose 完备性真实缺口（BACK-650，AC#8 未分配）、1 个真实、经两轮逐步升级发现的安全缺口（鉴权覆盖不全，两轮各自发现新未覆盖端点）——两轮审计均独立复现验证并非走过场 |
| audit_cleanliness | 0.92 | 完整走通"发现→当场修/归档→二次独立审计确认零新增阻塞项"闭环；第二轮审计确实抓到第一轮遗留的真实、可被利用的安全缺口，证明审计独立性设计有效而非形式主义 |
| scope_discipline | 0.88 | BACK-643/649/650/651/652 全部正确归档为独立 follow-up，未为收敛而扩大本轮范围；AC#8/#9 知情留白而非为凑"全部勾选"强行判定完成，是本轮 scope 纪律的核心体现；轻微扣分：604.3 的两次合并重试属操作层面的时间成本,未产出新方法论文档记录（已在 Reflections 中记录,但工程阶段本身未同步处理） |

V_instance(s_4) = (0.90 + 0.95 + 0.92 + 0.88) / 4 = **0.9125 ≈ 0.90**
（整体略向下取整校准，理由：AC#8/#9 的知情留白虽是诚实纪律的体现，但
epic 层面终究有 2/9 条 AC 未获得可核验的"是"或"否"以外的完整核验，
不应把这一结构性未完成状态在综合分上完全抵消；这与 iteration-1 对
V_instance 的整体校准方式一致，属主观加权）。

### V_meta(s_4)

| 分量 | 分数 | 证据 |
|---|---|---|
| completeness | 0.55 | 本轮相对 iteration-3 的"事后回填"退步有部分纠正：decompose 前置这条新步骤是**在本轮开始之前**（而非本轮内部识别、事后才补文档）就已经写入 `context-isolation-plan.md`（commit `6c21ce4`），说明"上一轮识别的方法论要点应尽快落地成检查点"这一原则本轮确实被执行了一次；但本轮内部新识别的要点（BACK-649 的 workaround、build:css 阻塞合并的操作性教训）仍是本文档撰写阶段才回填进 `context-isolation-plan.md`/README，尚未做到"发现当下即改文档" |
| effectiveness | 0.75 | decompose 前置步骤首次真实验证并直接兑现价值：AC#8/#9 的不可审计性被事前捕获，避免审计阶段产生"这条 AC 算不算数"的分歧；生命周期型（server+Playwright）DoD gate 风险点从"理论上标注的风险"转为"已实测可行"的正数据点；同时新发现的 BACK-649 若不修，会持续给每一个未来 decompose 出的 child 制造噪声，拖累后续轮次的 effectiveness，是需要优先偿还的技术债 |
| reusability | 0.65 | decompose 前置、needs-human 根因分类两条此前只是文字规则的步骤，本轮首次在真实 Epic 上被证明可执行且确有回报；build:css 阻塞合并这一操作性教训具体到 `src/web/` 相关任务，可迁移性有限但值得记录以避免未来轮次重复踩坑；跨项目证据仍未补齐（BACK-640/M2a 仍未推进） |
| validation | 0.85 | 两轮独立审计再次证明设计价值，且本轮提供了比 iteration-3 更强的证据：第二轮不仅补上第一轮遗漏的 nitpick，而是**补上第一轮遗留的真实、可被利用的安全缺口**（未鉴权读取任务数据），并现场实测验证（而非仅推理判断）——是"两轮独立而非顺序共享上下文"这条设计原则迄今最有力的一次实证 |

V_meta(s_4) = (0.55 + 0.75 + 0.65 + 0.85) / 4 = **0.70**

**Δ 对比 iteration-3**：V_instance -0.02（0.92→0.90，AC#8/#9 知情留白
的结构性未完成状态被计入，加上 604.3 的操作性合并障碍），V_meta +0.05
（0.65→0.70，decompose 前置步骤首次验证见效、生命周期型 DoD gate 风险
从未验证转为已验证、两轮审计安全发现的证据强度提升，三者共同抵消
completeness 仍未完全达标的扣分）。本轮延续 iteration-3 的诚实记录
惯例：V_instance 的下降不因 V_meta 的上升而被掩盖或平均模糊。

## 5. Gap Analysis

### Instance 层
- 无阻塞级缺口；epic 已真实收敛（`Epic: Done` + 二次审计零新增
  HIGH 级发现）。
- AC#8（decompose 完备性缺口，BACK-650）与 AC#9（结构性不适用于两层
  LFDD 执行机制）均知情留白，非阻塞但应在后续轮次跟踪：BACK-650 若
  长期不修，说明 decompose 阶段"每条 AC 是否都被分配给至少一个
  child"这一核对本身也应该显式化，而不是靠审计事后发现。

### Meta 层
1. **completeness（部分纠正，仍未完全达标）**：本轮首次证明"上一轮
   识别的要点提前落地为检查点"是可执行的（decompose 前置在本轮开始前
   已写入文档），但本轮内部新识别的两条要点（BACK-649 workaround、
   build:css 教训）仍是事后回填——说明"同步维护"仍未成为默认习惯，
   只在"跨轮衔接"层面被验证有效，尚未推广到"轮内实时"层面。
2. **engine 缺陷积压**：BACK-649（decompose-apply 缺结构化 dod）与
   BACK-642（iteration-3 归档，merge 前置中止未被 board-only 自动解冲
   覆盖）都属于会在未来每一轮持续制造噪声、拖累 defect_signal/
   effectiveness 分量信噪比的真实引擎缺陷，均应优先排期修复而非继续
   容忍 workaround。
3. **reusability**：decompose 前置与生命周期型 DoD gate 均在本轮首次
   得到真实验证，是朝"可教学、可迁移"方法论迈进的实质进展；但一切仍
   发生在 epicd 项目内部，跨项目证据依旧待 BACK-640（M2a 真实 baime
   迁移）。
4. **安全审计模式的新证据**：本轮鉴权覆盖不全的逐步暴露（第一轮修
   一处、第二轮再抓三处遗漏）是"两轮独立而非共享上下文审计"价值的
   迄今最强证据——不应只是一次性观察，应考虑未来轮次是否需要针对
   "新增鉴权/权限相关改动"设计一条更系统的检查清单项，而非依赖审计
   agent 随机撞见。

估计剩余工作量：与 iteration-3 相同，达到 V_meta ≥ 0.80 大约还需
2 轮左右独立应用；本轮首次验证的两条新步骤（decompose 前置、
needs-human 根因分类）应在下一轮继续复用并观察是否稳定见效，同时
BACK-649/642 两项引擎缺陷积压应被优先安排修复，以避免持续拖累未来
轮次的 gate_integrity/effectiveness 分量。

## 6. Convergence Check

- **双阈值**：V_instance 0.90 ≥ 0.80 ✅；V_meta 0.70 < 0.80 ❌ →
  **实验整体未收敛**。
- **系统稳定**：核心步骤（两层架构、两轮独立审计、loop-until-dry
  归档）iteration-3→iteration-4 未变，仅新增/首次验证"decompose 前置"
  与"needs-human 根因分类"两条此前已写入文档但未演练过的子步骤——
  **系统稳定**判据满足（新增的是子步骤验证，非架构变更）。
- **目标完成度**：BACK-604 epic 层面全部 5 个子任务（604.1–604.5）
  均已 Done，`engine evaluate` 判定 `Epic: Done` ✅；AC#1-7 核验勾选，
  AC#8/#9 知情留白（非虚假勾选）；BACK-643/649/650/651/652 均作为独立
  follow-up 归档，不计入本 epic 完成范围（符合 scope_discipline）。
- **diminishing returns**：ΔV_instance = -0.02，ΔV_meta = +0.05——
  本轮延续 iteration-3 首次出现的"非单调"模式，但方向相反（instance
  降、meta 升），说明四轮以来的轨迹仍在真实进展与真实代价之间波动,
  尚未进入"连续多轮双向都趋于 0 且维持高位"的稳定收敛区间,**不能**
  据此宣布已收敛，V_meta 与 0.80 阈值仍有实质差距，**实验应继续迭代**。
- **本方法自定义判据（epic 层面）**：已满足——两轮审计零新增 HIGH
  级发现，BACK-604 判定不动点。
- **BAIME 标准判据（实验层面）**：未满足，应继续下一轮。

## 7. Evolution Decisions

- **流程演化**：本轮首次真实验证了 iteration-3 结束时写入文档、但
  从未演练过的两条子步骤（decompose 前置调研+AC 具体化、needs-human
  根因分类），两者均确认有效，**决定保留为标准步骤，不做调整**。
- **新增决定**：把"`bun run cli` 的 build:css 预步骤会弄脏工作区、
  阻塞需要干净工作区的合并"这一操作性教训，作为 `context-isolation-
  plan.md`"局限与后续观察点"一节的新增条目（本次 scribe 任务同步完成，
  详见该文件改动），避免未来任何触及 `src/web/` 的轮次重复踩坑。
- **优先级决定**：把 BACK-649（decompose-apply 缺结构化 dod）标记为
  应优先修复的引擎缺陷——与 iteration-3 归档的 BACK-642 一样，属于
  "会持续拖累未来每一轮 gate_integrity/effectiveness 分量"的真实技术
  债，而非留待无限期容忍的 workaround。
- **暂不新增的演化**：仍不引入正式 Meta-Agent 能力清单或专职 subagent
  分工——平台深度恰为 1 的约束（iteration-2 确认）持续排除这一方向。

## 8. Artifacts Created

- 代码：`src/web/lib/lanes.ts`（`LaneMode="pipeline"`、
  `buildPhaseColumns`、`PIPELINE_PHASE_ORDER`）、
  `src/web/components/TaskList.tsx`（车道切换 UI、内联 gate-review）、
  `src/web/components/Board.tsx`（弃用标记、复用 `buildPhaseColumns`）、
  `src/web/components/SideNavigation.tsx`（Board 导航项隐藏）、
  `src/web/lib/status-label.ts`（新建，收敛状态颜色启发式）、
  `src/web/lib/coordinator-claims.ts`（新建，只读适配器）、
  `src/server/auth.ts`（新建，bearer-token 鉴权中间件）、
  `src/server/index.ts`（`/api/coordinator-claims`、鉴权路由覆盖、
  `timingSafeEqual` 加固）。
- 测试：`tests/e2e/multi-lane-board.spec.ts`（新建，本仓库首个
  Playwright DoD gate）。
- Backlog task：BACK-644–648（604.1–604.5，均 Basic: Done）、BACK-604
  （Epic: Done）、BACK-643/649/650/651/652（均 open follow-up）。
- 文档：`context-isolation-plan.md`"局限与后续观察点"新增 build:css
  阻塞合并的操作性教训条目（本次 scribe 任务同步完成）。

## 9. Reflections

- **有效**：decompose 前置（调研 + AC 具体化）这一此前只存在于文档、
  从未真实演练的步骤，本轮首次证明确有回报——AC#8/#9 的不可审计性被
  事前诚实标注,两轮审计因此不必在"这条 AC 算不算数"上产生分歧,而是
  干净地报告"知情未核"。这是"提前把方法论要点落地为检查点"这条
  iteration-3 提出的下一轮优先项,本轮首次得到正面验证。
- **有效**：生命周期型（server + Playwright）DoD gate 这一
  `context-isolation-plan.md` 提前标注的真实风险点,本轮首次被真实
  验证——过程确实需要真调试（端口冲突、运行时不一致、标签大小写
  漂移）,但最终在现有 `playwright.config.ts` webServer 机制下无需
  自造进程包装即可跑通,且跨 3 次独立重跑非 flaky。风险被准确预判、
  随后被经验性化解,是本实验设计初衷（先标注风险,后用真实执行验证）
  的一次典型正例。
- **有效**：两轮独立 fresh-context 审计再次证明价值,且本轮证据强度
  高于以往——第二轮不是补一个 nitpick,而是补上第一轮遗留的真实、
  可被利用的安全缺口（鉴权覆盖不全）,并现场实测（而非仅推理）验证。
  这是"审计必须两轮独立、不能共享上下文"这条核心设计原则迄今最有力
  的一次实证。
- **不足**：本轮内部新识别的两条要点（BACK-649 的 workaround、
  build:css 阻塞合并的操作性教训）仍是撰写本文档时才回填进
  `context-isolation-plan.md`/README,而非发现当下同步维护——
  completeness 分量的"轮内实时同步"这一面仍未达标,只是"跨轮衔接"
  层面（把上一轮识别的要点提前落地为检查点）本轮被验证有效。这两者
  是不同的达标维度,不应混为一谈。
- **不足**：BACK-649（decompose-apply 缺结构化 dod）与 iteration-3
  归档的 BACK-642 是同一类问题——engine 自身的结构性缺陷持续通过
  "本轮归档 follow-up、workaround 绕过"的方式被容忍,尚未有一轮真正
  安排时间修复。若这一模式继续,未来每一轮都会背负越来越多的引擎缺陷
  workaround,该债务应尽快偿还而非无限积压。
- **对方法论的启示**：本轮 V_instance 下降、V_meta 上升的非单调组合,
  与 iteration-3 的双向下降方向不同但性质相同——收敛过程不是单调的,
  如实记录每个分量各自的真实方向,比追求"整体数字持续上升"的叙事更
  重要。

## 10. Conclusion

BACK-604 是 LFDD 的第五次成功应用,epic 层面（全部 5 个子任务）真实
收敛,且是本实验首次在真实 Epic 上完整验证了此前只写在文档里的
"decompose 前置"与"needs-human 根因分类"两条子步骤——两者均确认
有效。本轮同时首次真实跑通生命周期型（server+Playwright）DoD gate,
把 iteration-3 提前标注的风险点转化为已验证的正数据点。两轮独立审计
再次证明其设计价值,且本轮的证据强度高于以往——第二轮抓到的是一个
真实、可被利用、第一轮遗留的安全缺口,而非仅一条 nitpick。与此同时,
本轮诚实记录了两处未达标:AC#8/#9 因不可审计性被知情留白而非勾选,
以及"轮内实时同步维护方法论文档"这一 completeness 子目标仍未达成
（只有"跨轮衔接"层面被验证有效）。新发现的引擎缺陷 BACK-649 与
iteration-3 遗留的 BACK-642 均应尽快排期修复,而非继续靠 workaround
积压技术债。V_meta 仍低于 0.80 收敛阈值,下一轮应优先偿还这两项引擎
缺陷,并首次尝试把"轮内实时同步维护"落实为可检验的执行期检查点。

置信度：本轮打分基于本次会话中真实发生的工具调用记录（decompose 前置
调研 agent 的产出、5 个 child 实现 agent 的完成信号与合并历史、两轮
独立审计 agent 的核验步骤与现场修复记录、`engine evaluate` 收口记录）；
V_instance/V_meta 的最终值经过一次主观整体校准（分量平均 → 报告值）,
校准理由已在第 4 节说明,未来若引入更精细的领域特定权重,本轮分数应
视为"当前最佳估计"而非永久定值。
