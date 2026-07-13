---
id: BACK-682
title: >-
  收敛机制:adjudicating phase + gap 守卫 + adjudicate skill + primitive-executor 内循环 +
  三分类回退契约
assignee: []
created_date: '2026-07-07 14:46'
updated_date: '2026-07-07 19:49'
labels:
  - 'kind:basic'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
priority: high
ordinal: 92000
pipeline_id: execution
phase: done
dod:
  - text: bun test --parallel
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bash plugin/scripts/skill-lint.sh --all
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态:规格未定,执行前须过 authoring/refining 钉死下方未定 schema。本 task 会被 fixpoint-convergence 直接驱动(单叶 Basic task,无 children)。

## 背景

fixpoint-convergence 是 monitor 缺席时的前台 stand-in driver,其 4 个 stage 应逐个退休到 pipeline phase。本 task 交付两个驱动器(fixpoint-convergence 前台 / monitor 后台 BACK-660)共享的收敛机制层;BACK-660 依赖本 task。

核心洞察:单调性从 phase 层下移到 gap 层——允许 phase 回退,只要「未解决 gap 集」单调收缩。这条单调性实为两条同向叠加:①未解决 gap 集单调收缩,②worktree 里已满足的 AC 集合单调积累(不因 retreat 被撤销)。

最小回退原则:能内循环(primitive-executor)修复的 gap 绝不外抛;仅当 gap 判定为规格/分解/目标层才外抛,且一次只退一步(紧邻的前一 phase),不允许跨级回退——避免 ready⇄refining 反复震荡破坏单调性。

## 目标:六条约束

1. **内循环增强(primitive-executor)**:DoD 红→根因分类。实现层 gap→内循环增量自修;规格/分解/目标层 gap→外抛,且外抛只回退一步(紧邻的前一 phase),不跨级回退。红线:只改实现满足 AC,绝不改 AC 适配实现。
2. **adjudicating 独立 phase + 独立叶子 agent**:fresh-context agent 跑判断性 audit(看 AC/diff,不看实现 agent 自报)。产出=路由决策 + gap 指纹。agent 是叶子,只判断不转 phase。adjudicating 是唯一能写回退边的 phase,其它 phase 不可发起回退。
3. **gap 层单调 + 指纹去重守卫**:同一 gap 指纹第二次触发回退→needs-human;同时保证①未解决 gap 集收缩、②已满足 AC 集合积累这两条单调性均成立。
4. **worktree 跨回退保留**:回退指令三分类(保留已绿 AC / 新增 missing / 修正 wrong,须显式标注旧实现作废块)。
5. **强制过 adjudicating,深度 risk-scaled**:所有 leaf 走 ready→adjudicating→done;纯机械 leaf(DoD 全绿即够)的 audit 退化为轻量确认,高风险/有 IA 的 leaf 跑完整判断性 audit(判据复用 fixpoint-convergence 的 RiskGated)。
6. 颗粒度第三判据(规格确定性=回退爆炸半径)是 CLAUDE.md 文档改动,不在本 task,单独处理。

## 内部 Phase 结构

- **Phase 1(硬骨头)**:adjudicating phase 定义 + 强制所有 execution leaf 经过它 + 回退边 + gap 指纹守卫。breaking 状态机变更,独立可回滚,用 engine evaluate/complete 直测。
- **Phase 2**:adjudicate skill(独立叶子 agent 判断性 audit + 路由决策 + 三分类 gap 输出)。复用 BACK-657.1 的 skill 合同/lint/registry。
- **Phase 3**:primitive-executor 内循环增强(机械 DoD 重跑 + 根因分类 + 外抛)。
- **Phase 4**:worktree/claim 生命周期延长 + 三分类回退执行。
- **Stage(折进,原 Task 2)**:fixpoint-convergence 改写为消费机制层——dispatchChild invoke primitive-executor,evaluate 走 adjudicating。

若执行中规模确证超 Basic ~2000 行 ceiling,按 CLAUDE.md 中途转 Epic。

## ⚠️ 执行前 refining 须钉死的未定 schema

- 回退边在 pipeline-as-data 里的具体数据表达(需满足"一次一步,不跨级"的约束)
- gap 指纹的结构(失败 IA 命令 + 根因层 编码去重)
- 三分类回退契约(保留/修正/新增)的 schema
- adjudicating agent 的输出格式
- 深度 risk-scaled 判据(复用 fixpoint RiskGated)

## 非目标

- monitor 自动 dispatch(BACK-660,依赖本 task)。
- authoring 机器 phase 的生产 transport 接线(E7/BACK-608)。
- 颗粒度第三判据的 CLAUDE.md 文档改动(单独处理)。

注:Phase 1 会把 execution 完成路径从 `ready→done` 扩展为 `ready→adjudicating→done`——这与 BACK-660/BACK-665 现有 invariants 文本字面交叉,Phase 1 落地后需回头用 `task edit --append-notes` 同步修订那两个 task 的 invariants 段落。

## 参考

- CLAUDE.md「Task decomposition granularity」「Acceptance Criteria conventions when authoring a task」「Simplicity-first」
- docs/adr/ADR-011(pipeline-as-data)、ADR-019(Integration Acceptance / fixpoint-meter)
- plugin/skills/fixpoint-convergence/SKILL.md(Stage 4 evaluate、triageNeedsHuman、verifyAudit、shouldDispatch)
- plugin/skills/primitive-executor/SKILL.md、plugin/skills/README.md
- src/harness/evaluator.ts(BACK-657.3,evaluateEpic 跑 IA 的先例)
- src/engine/pipeline.ts、src/engine/dispatch.ts、plugin/skills/phase-coverage.json
- BACK-657、BACK-660(invariants 待同步修订)、BACK-665(invariants 待同步修订)、BACK-654
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/engine/pipeline.ts 定义 adjudicating phase,且 execution leaf 完成路径经过它(ready→adjudicating→done);有测试断言该路径;adjudicating 是唯一新增、唯一能写回退边的 phase——从非 adjudicating phase 发起回退在测试中被拒绝
- [ ] #2 gap 指纹去重守卫:同一 gap 指纹第二次触发回退→needs-human;有测试覆盖该终止路径
- [ ] #3 双重单调性有专门测试覆盖(模拟 ≥2 轮 retreat):①未解决 gap 数逐轮不增,②worktree 中已满足的 AC 集合逐轮只增不减、不因 retreat 被撤销
- [ ] #4 最小回退规则落地:primitive-executor 优先内循环修复;仅规格/分解/目标层 gap 判定为需外抛,且外抛目标限定为紧邻的前一 phase(不允许跨级回退);有测试或契约断言此约束
- [ ] #5 plugin/skills/adjudicate/{SKILL.md,contract.json} 存在,注册 phase-coverage.json,skill-lint.sh --all 通过
- [ ] #6 primitive-executor 内循环:DoD 红→根因分类(实现层内修/规格层外抛),SKILL.md 反映;有测试或契约覆盖;"只改实现满足 AC,不改 AC 适配实现"的红线在契约/测试中可断言
- [ ] #7 audit 深度 risk-scaled:所有 leaf 强制经过 adjudicating,但纯机械 leaf(DoD 全绿即够)退化为轻量确认,高风险/有 IA 的 leaf 跑完整判断性 audit;有测试覆盖两条路径深度不同,判据复用 fixpoint-convergence 的 RiskGated
- [ ] #8 三分类回退契约(保留已绿 AC/新增 missing/修正 wrong)有 schema 定义 + 测试;修正型 gap 显式标注旧实现作废块
- [ ] #9 fixpoint-convergence SKILL.md 改写为消费机制层(dispatchChild invoke primitive-executor、evaluate 走 adjudicating),不再内联方法论
- [ ] #10 全程用 engine evaluate/complete 路径直测,不依赖 monitor/任何 driver
- [ ] #11 不改 execution 前向 scan 谓词/actor 语义(decomposing/evaluating/draft/refining/spike 的 actor 归属不变);既有 scan 谓词测试套件全绿
- [ ] #12 不改 engine complete 的 DoD 独立重跑逻辑,adjudicating 只加一层、不替换不跳过;既有 DoD 独立重跑测试套件全绿
- [ ] #13 不改隔离机制实现(exec-lock/cap 幂等/.caps/.wt/.signal/单驱动守卫/merge 串行化),仅延长 claim 持有窗口;既有隔离机制测试套件全绿,diff 未改这些文件的核心逻辑
- [ ] #14 worker 永不自证 done:完成判定只能来自 mainSession 触发的独立复核(engine complete 的 DoD 独立重跑 + adjudicate 独立叶子 agent 的输出),不存在实现 agent 自报"done"被直接采信的路径
- [ ] #15 已发布的 MCP tool 名称、CLI 子命令签名不改:`grep -r "mcp__backlog__" plugin/.claude-plugin/` 与 `bun run cli --help` 输出中的命令签名相较改动前一致
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 收敛机制 adjudicating phase + gap 守卫 + adjudicate skill + primitive-executor 内循环 + 三分类回退契约

## 钉死的 5 个未定 schema（refining 输出，供 Phase A 起点）

1. **回退边数据表达**（一步一级，不跨级）：
   - `Task.entry_phase?: string` — 任务进入当前 pipeline 时，记录它来自的上一个 `pipeline_id/phase`（例如 `authoring/refining`）。仅在 promote/spawn 时写一次。
   - `Task.retreat_log?: RetreatEntry[]`（append-only,永不删除历史项）：
     ```ts
     interface RetreatEntry {
       ts: string;                 // ISO8601
       from: string;               // 恒为 "execution/adjudicating"
       toPhase: string;            // 必须等于当前 task.entry_phase，否则拒绝（一步一级守卫)
       gapFingerprint: string;
       classification: "spec" | "decomposition" | "goal";  // "implementation" 层 gap 不允许外抛，走内循环
       contract: RetreatContract;  // schema 见 #3
     }
     ```
   - 校验函数 `assertSingleStepRetreat(task, toPhase)`（新文件 `src/engine/retreat.ts`）：`toPhase !== task.entry_phase` → throw；只有 `execution/adjudicating` 阶段允许调用写入 `retreat_log`（其它 phase 调用 → throw）。

2. **gap 指纹结构**：`gapFingerprint = sha256(`${classification}|${normalizedFailingCheck}`).slice(0,16)`；`normalizedFailingCheck` = 失败 IA/DoD 命令原文（trim + 折叠空白）,或(spec/goal 层)adjudicating agent 给出的 AC 编号标识（如 `AC#3`）。去重历史存 `Task.gap_history?: string[]`（append-only）。守卫：`gapFingerprint ∈ task.gap_history` 时第二次触发 → 直接 `needs-human`,不得再次 retreat。

3. **三分类回退契约 schema**（`RetreatContract`,定义于 `src/types/index.ts`）：
   ```ts
   interface RetreatContract {
     keep: string[];   // 已满足的 AC 标识列表，禁止被后续实现改动
     missing: { ac: string; description: string }[];
     wrong: { ac: string; description: string; obsoleteBlock: { file: string; lines: string; reason: string } }[];
   }
   ```
   `wrong` 类必须显式给出 `obsoleteBlock`,否则契约校验失败。

4. **adjudicating agent 输出格式**（StructuredOutput schema，供 `Agent`/Workflow 的 `schema` 参数）：
   ```ts
   interface AdjudicationVerdict {
     verdict: "done" | "retreat" | "needs-human";
     auditDepth: "light" | "full";
     gapFingerprint?: string;        // verdict != "done" 时必填
     classification?: "spec" | "decomposition" | "goal"; // verdict == "retreat" 时必填
     contract?: RetreatContract;     // verdict == "retreat" 时必填
     rationale: string;
   }
   ```

5. **深度 risk-scaled 判据**（复用 fixpoint-convergence `RiskGated`）：
   `auditDepth = "full"` iff（任务含 `## Integration Acceptance` 区块，复用 `evaluator.ts` 的 `extractIntegrationAcceptanceCommands()`）∨（diff 触碰 `src/engine/**` 或 `src/security/**`）∨（task labels 含 `area:engine` 或 `area:security`）；否则 `"light"`（只confirm DoD 全绿 + AC checkbox 无遗留，不做独立 diff 判读）。

## 命名冲突说明（非新增 schema，执行约束）

`src/engine/adjudicate.ts` 现有的 `adjudicate()` 是 ENG-8 机械 DoD 判定函数（`done|needs-human`），AC#12 要求不改。新的独立判断性审计逻辑必须使用不同函数名（如 `runAdjudicatingAudit`），只新增文件/导出，不修改 `adjudicate.ts` 现有签名与行为。

---

## Phase A: adjudicating phase 定义 + 回退边 + gap 指纹守卫（任务内部 Phase 1，硬骨头）

### Tests (write first)
- `src/test/engine-pipeline-adjudicating.test.ts` — `executionPipeline.states` 含 `{name:"adjudicating", actor:"machine"}`；primitive 完成路径断言为 `ready → adjudicating → done`（非 `ready → done`）。
- `src/test/engine-retreat-guard.test.ts` — 从非 `execution/adjudicating` 阶段调用 `assertSingleStepRetreat`/写 `retreat_log` → throw；从 `adjudicating` 且 `toPhase !== task.entry_phase` → throw；合法单步回退 → 通过。
- `src/test/engine-gap-fingerprint-dedup.test.ts` — 同一 `gapFingerprint` 第二次出现 → 强制 `needs-human`,不得再次进入 retreat 分支。
- `src/test/engine-retreat-monotonicity.test.ts` — 模拟 ≥2 轮 retreat：①`unresolvedGapCount` 逐轮不增；②`retreat_log[].contract.keep` 表示的已满足 AC 集合逐轮只增不减（新一轮 contract 的 `keep` ⊇ 上一轮 `keep`）。
- `src/test/engine-retreat-contract-schema.test.ts` — `RetreatContract` 的 `wrong` 类条目缺失 `obsoleteBlock` → 校验拒绝；`keep`/`missing`/`wrong` 三分类合法组合 → 通过。
- `src/test/engine-audit-depth.test.ts` — `auditDepthFor(task, changedPaths)`：含 `## Integration Acceptance` 区块的 task → `"full"`；`changedPaths` 命中 `src/engine/**`或`src/security/**` → `"full"`；labels 含 `area:engine`/`area:security` → `"full"`；否则 → `"light"`。

### Implementation
- `src/types/index.ts` — 新增 `RetreatEntry`、`RetreatContract`、`Task.entry_phase?`、`Task.retreat_log?`、`Task.gap_history?`。
- `src/core/field-registry.ts` — 为上述字段各加一条 `FieldDescriptor`（`type: "log"`/`"object"`，presence-gated，参照 `refine_log`/`provenance` 现有条目风格，第 284-342 行附近）。
- `src/engine/pipeline.ts` — `executionPipeline.states` 在 `evaluating`/`needs-human` 之前插入 `{ name: "adjudicating", actor: "machine" }`（primitive 路径：DoD 绿后进入此态，而非直接 `done`）。
- `src/engine/retreat.ts`（新文件）— `assertSingleStepRetreat`、`gapFingerprint(classification, normalizedCheck)`、`isDuplicateGap(task, fingerprint)`、`recordRetreat(task, entry: RetreatEntry)`、`validateRetreatContract(contract: RetreatContract)`（`wrong` 缺 `obsoleteBlock` → throw）、`auditDepthFor(task, changedPaths: string[])`（schema #5 判据实现）。
- `src/engine/complete.ts` — primitive 任务 DoD 全绿后，路由目标从 `done` 改为 `adjudicating`（不改 `adjudicate()` 本身逻辑，只改路由目标）。

### DoD
- [ ] `bun test src/test/engine-pipeline-adjudicating.test.ts src/test/engine-retreat-guard.test.ts src/test/engine-gap-fingerprint-dedup.test.ts src/test/engine-retreat-monotonicity.test.ts src/test/engine-retreat-contract-schema.test.ts src/test/engine-audit-depth.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: adjudicate skill（任务内部 Phase 2）

### Tests (write first)
- 复用既有 `src/test/skill-contracts.test.ts`、`src/test/skill-provenance.test.ts`、`src/test/phase-skill-coverage.test.ts`（无需新测试文件，新增 skill 目录后这三个套件会自动覆盖它——若发现遗漏，补一条断言 `phase-coverage.json` 含 `execution/adjudicating → adjudicate`）。

### Implementation
- `plugin/skills/adjudicate/SKILL.md` — 描述独立叶子 agent 判断性 audit 方法：读 AC/diff（不读实现 agent 自报）、输出 `AdjudicationVerdict`（schema 见上）、`auditDepth` risk-scaled 判据（Phase A schema #5）。
- `plugin/skills/adjudicate/contract.json` — `{ "skill": "adjudicate", "phase": "execution/adjudicating", "creation_path": "extract", "provenance": "plugin/skills/fixpoint-convergence/SKILL.md" }`（判断性 audit 方法论继承自 fixpoint-convergence Stage 3/4，标注 provenance）。
- `plugin/skills/phase-coverage.json` — 追加 `{ "phase": "execution/adjudicating", "status": "skill", "skill": "adjudicate" }`。

### DoD
- [ ] `bash plugin/scripts/skill-lint.sh --all`
- [ ] `bun test src/test/skill-contracts.test.ts src/test/skill-provenance.test.ts src/test/phase-skill-coverage.test.ts`

## Phase C: primitive-executor 内循环增强（任务内部 Phase 3）

### Tests (write first)
- `src/test/primitive-executor-classification.test.ts` — 断言 `plugin/skills/primitive-executor/SKILL.md` 文本包含：根因分类规则（实现层→内修 / 规格·分解·目标层→外抛）、"只改实现满足 AC,绝不改 AC 适配实现" 红线原文、且外抛动作引用 `execution/adjudicating` 而非直接改 phase。

### Implementation
- `plugin/skills/primitive-executor/SKILL.md` — 增补 "DoD 红→根因分类" 小节：机械重跑 DoD → 红时先判断 gap 层（实现/规格/分解/目标），实现层继续内循环修复，其余层调用 Phase A 的 gap 指纹 + `entry_phase` 机制交由 `adjudicating` 阶段处理外抛（primitive-executor 本身不直接写 `retreat_log`——写入权限仍只属于 adjudicating phase,与 Phase A 的 guard 一致）。
- `plugin/skills/primitive-executor/contract.json` — 不变（沿用既有 extract/provenance）。

### DoD
- [ ] `bun test src/test/primitive-executor-classification.test.ts`
- [ ] `bash plugin/scripts/skill-lint.sh --all`

## Phase D: worktree/claim 生命周期延长 + 三分类回退执行（任务内部 Phase 4）

### Tests (write first)
- `src/test/engine-adjudicating-dispatch.test.ts` — `dispatch.ts` 新增 `renderAdjudicatingDispatch()`，渲染独立叶子 audit agent 的派发块；断言其 spawn 描述不读取实现 agent 自报文本，只读 AC/diff。
- `src/test/engine-worktree-retreat-preserve.test.ts` — 回退时 worktree 不被删除/不重新创建（相同路径复用），且 exec-lock/claim 持有窗口延长至 `adjudicating` resolve（done/needs-human）为止；断言隔离机制核心函数（`withMergeLock`/`withWorktree`/`withCapGuard`,`src/engine/safety.ts`）未被修改（diff 中这些函数体不变，可用签名/行数快照断言）。

### Implementation
- `src/engine/dispatch.ts` — 新增 `renderAdjudicatingDispatch()`（对齐现有 `renderEpicEvalDueDispatch` 风格）,产出独立 agent 派发指令,调用 `plugin/skills/adjudicate` 方法论。
- `src/engine/driver.ts` / `src/engine/complete.ts` — retreat 分支：不释放 worktree/exec-lock,只把 `task.phase` 改回 `task.entry_phase` 所在 pipeline,并把三分类契约（`keep`/`missing`/`wrong`）写入下一轮 primitive-executor 可读的位置（如 `implementation notes` 追加,或新字段——不新增额外持久化机制,复用 Phase A 的 `retreat_log`,由下一轮 primitive-executor 读取最新一条 `retreat_log` 条目）。
- `plugin/scripts/handle-basic-ready.sh` — claim 持有窗口注释/逻辑延长说明（若脚本本身需要改动,仅延长等待条件,不改 `.caps`/`.wt`/`.signal` 文件命名与语义)。

### DoD
- [ ] `bun test src/test/engine-adjudicating-dispatch.test.ts src/test/engine-worktree-retreat-preserve.test.ts`
- [ ] `bun test src/test/engine-safety-worktree.test.ts src/test/engine-safety-merge.test.ts src/test/engine-safety-cap.test.ts src/test/adr-010-invariants.test.ts` (隔离机制回归全绿)

## Stage（折进,原 Task 2）: fixpoint-convergence 消费机制层

### Tests (write first)
- 无新增自动化测试（SKILL.md 是方法论文档,非可执行代码）；验收改为人工可读性 diff review，写入本 Phase 的 Acceptance Gate 用 grep 断言机制层引用存在。

### Implementation
- `plugin/skills/fixpoint-convergence/SKILL.md` — `dispatchChild` 改为显式 invoke `primitive-executor` skill；`evaluate`/Stage 4 改为 invoke `adjudicate` skill 消费 `AdjudicationVerdict`，不再内联 Stage 3/4 的判断方法论文字（保留 spec 类型签名，删除重复的 audit 方法论段落，改为引用 `plugin/skills/adjudicate/SKILL.md`）。

### DoD
- [ ] `grep -q "plugin/skills/adjudicate/SKILL.md" plugin/skills/fixpoint-convergence/SKILL.md`
- [ ] `grep -q "primitive-executor" plugin/skills/fixpoint-convergence/SKILL.md`

## Constraints

- 只改实现满足 AC,绝不改 AC 适配实现（红线，适用于本任务自身实现过程，也是 primitive-executor 新规则）。
- 不改 `src/engine/adjudicate.ts` 现有 `adjudicate()` 签名/行为（ENG-8 机械判定与新独立判断性审计是两个不同机制，命名冲突已在上文说明）。
- 不改 execution 前向 scan 谓词/actor 语义（`decomposing/evaluating/draft/refining/spike` 不变）；不改隔离机制实现（exec-lock/cap 幂等/.caps/.wt/.signal/merge 串行化）核心逻辑，仅延长 claim 持有窗口。
- 不改已发布 MCP tool 名称、CLI 子命令签名。
- 若执行中确证规模超 Basic ~2000 行 ceiling（例如 Phase A+B+C+D 的实际 diff 累积超过约 3600 行且能明确切出 ≥2 个独立可合并的交付物），按 CLAUDE.md 中途转 Epic；否则保持单叶 Basic。
- Phase 1（本 Phase A）落地后，需用 `epicd task edit BACK-660 --append-notes` 与 `epicd task edit BACK-665 --append-notes` 同步修订两处与 `ready→done` 相关的 invariants 文本，改为 `ready→adjudicating→done`。

## Acceptance Gate

- [ ] `bun test --parallel`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `bash plugin/scripts/skill-lint.sh --all`
- [ ] `grep -r "mcp__backlog__" plugin/.claude-plugin/ > /tmp/back682-mcp-after.txt && diff /tmp/back682-mcp-before.txt /tmp/back682-mcp-after.txt` (先在实现开始前跑一次 `grep -r "mcp__backlog__" plugin/.claude-plugin/ > /tmp/back682-mcp-before.txt` 留快照，AC#15 用)
- [ ] `bun run cli -- --help > /tmp/back682-cli-after.txt && diff /tmp/back682-cli-before.txt /tmp/back682-cli-after.txt` (同上，实现前先跑一次留 `/tmp/back682-cli-before.txt` 快照)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/refining review: APPROVED after 1 iteration(s). Pinned all 5 undefined schemas (entry_phase/retreat_log retreat edge, gapFingerprint dedup, RetreatContract 3-way, AdjudicationVerdict output, auditDepthFor risk-scaled depth). Plan structured as Phase A(pipeline+retreat guard)->B(adjudicate skill)->C(primitive-executor classification)->D(dispatch/worktree retention)->Stage(fixpoint-convergence rewrite), each with tests-first + executable DoD; noted naming-collision guard vs existing src/engine/adjudicate.ts (ENG-8, unchanged); Acceptance Gate covers full test suite + skill-lint + AC#15 MCP/CLI signature snapshot diff.

claimed: 2026-07-07T18:28:41Z

Phase A done: added adjudicating pipeline state (execution pipeline, between evaluating and needs-human), entry_phase/retreat_log/gap_history Task fields + FieldDescriptor entries, src/engine/retreat.ts (assertSingleStepRetreat, gapFingerprint, isDuplicateGap, validateRetreatContract, recordRetreat, auditDepthFor), completeTask routing to adjudicating instead of done for pipelines that declare it (AC#1), new completeAdjudication() for the independent-audit->terminal-phase step, Driver extended with injectable AdjudicateHandler (defaults to done pass-through) handling the adjudicating phase incl. retreat/dedup-guard wiring. Fixed pre-existing regression tests (engine-merge-wire, engine-adjudicate-eng8, engine-adjudicate, engine-driver, engine-driver-board, engine-spawn-complete, engine-complete-cli, epicd-run-integration, field-registry, lanes.test.ts buildPhaseColumns) that hardcoded done as the immediate post-DoD phase. All Phase A's own 6 new test files pass (29 tests); bun test --parallel is green except 3 phase-skill-coverage failures expected to resolve in Phase B (adjudicate skill not yet registered) and 1 pre-existing unrelated failure (epicd-plugin-synthetic-repo.test.ts's dist/backlog BIN_PATH check, stale from BACK-683's binary rename to dist/epicd, reproducible on main too via a leftover dist/backlog artifact). bunx tsc --noEmit clean.

Phase B done: added plugin/skills/adjudicate/{SKILL.md,contract.json} (creation_path: extract, provenance: fixpoint-convergence Stage 3/4 audit method), registered execution/adjudicating -> adjudicate in phase-coverage.json, updated docs/task-lifecycle-model.md sec3 diagram + sec6 table to include adjudicating, updated phase-skill-coverage.test.ts's EXPECTED_MACHINE_PHASES to 7 phases + added a registration test for execution/adjudicating. skill-lint.sh --all passes (adjudicate: execution/adjudicating, extract); skill-contracts/skill-provenance/phase-skill-coverage test suites all green (34 pass).

Phase C done: added root-cause classification section to primitive-executor/SKILL.md (implementation-layer gaps stay in inner loop; spec/decomposition/goal-layer gaps thrown outward to execution/adjudicating, never patched around; red-line sentence 只改实现满足AC,绝不改AC适配实现 included); updated Finalise step to reflect completeTask routing success into adjudicating rather than done; added src/test/primitive-executor-classification.test.ts (5 tests, all pass); skill-lint.sh --all still green.

Phase D done: added renderAdjudicatingDispatch() to src/engine/dispatch.ts (adjudicating-due machine key, spawns fresh-context independent audit leaf per adjudicate skill, never the implementer's own context) + wired into engine dispatch CLI branch (phase===adjudicating); added src/test/engine-adjudicating-dispatch.test.ts (7 tests) and src/test/engine-worktree-retreat-preserve.test.ts (5 tests) proving retreat does not re-call worktree.spawn/merge (confirmed driver.ts's existing retreat branch already skips worktree ops entirely) and that src/engine/safety.ts is byte-for-byte untouched (git diff main empty) with withMergeLock/withWorktree/withCapGuard signatures/bodies unchanged. Safety regression suite (engine-safety-worktree/merge/cap, adr-010-invariants) all green (37 pass total across 6 files). bunx tsc --noEmit clean; bun run check . clean (exit 0, only 1 pre-existing unrelated warning in test-helpers.ts).

Stage (fixpoint-convergence consumption) done: rewrote plugin/skills/fixpoint-convergence/SKILL.md's Stage 2 dispatchChild to explicitly invoke plugin/skills/primitive-executor/SKILL.md, and Stage 3/4 (loopUntilDry/auditRound/verifyAudit/evaluate's auditsSettled) to consume plugin/skills/adjudicate/SKILL.md's AdjudicationVerdict instead of re-explaining the same audit methodology inline; kept the Spec's type signatures/control-flow, removed duplicated prose. DoD greps both pass. skill-lint.sh --all still all-green.
<!-- SECTION:NOTES:END -->
