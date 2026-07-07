---
id: BACK-682
title: >-
  收敛机制:adjudicating phase + gap 守卫 + adjudicate skill + primitive-executor 内循环 +
  三分类回退契约
status: Backlog
assignee: []
created_date: '2026-07-07 14:46'
updated_date: '2026-07-07 17:11'
labels:
  - 'kind:basic'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
priority: high
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态:规格未定,执行前须过 authoring/refining 钉死下方未定 schema。本 task 会被 fixpoint-convergence 直接驱动(单叶 Basic task,无 children)。

## 背景

fixpoint-convergence 是 monitor 缺席时的前台 stand-in driver,其 4 个 stage 应逐个退休到 pipeline phase。本 task 交付两个驱动器(fixpoint-convergence 前台 / monitor 后台 BACK-660)共享的收敛机制层;BACK-660 依赖本 task。

核心洞察:单调性从 phase 层下移到 gap 层——允许 phase 回退,只要「未解决 gap 集」单调收缩。

## 目标:六条约束

1. **内循环增强(primitive-executor)**:DoD 红→根因分类。实现层 gap→内循环增量自修;规格/分解/目标层 gap→外抛。红线:只改实现满足 AC,绝不改 AC 适配实现。
2. **adjudicating 独立 phase + 独立叶子 agent**:fresh-context agent 跑判断性 audit(看 AC/diff,不看实现 agent 自报)。产出=路由决策 + gap 指纹。agent 是叶子,只判断不转 phase。
3. **gap 层单调 + 指纹去重守卫**:同一 gap 指纹第二次触发回退→needs-human。
4. **worktree 跨回退保留**:回退指令三分类(保留已绿 AC / 新增 missing / 修正 wrong,须显式标注旧实现作废块)。
5. **强制过 adjudicating,深度 risk-scaled**:所有 leaf 走 ready→adjudicating→done;audit 深度按风险(复用 fixpoint RiskGated)。
6. 颗粒度第三判据(规格确定性=回退爆炸半径)是 CLAUDE.md 文档改动,不在本 task,单独处理。

## 内部 Phase 结构

- **Phase 1(硬骨头)**:adjudicating phase 定义 + 强制所有 execution leaf 经过它 + 回退边 + gap 指纹守卫。breaking 状态机变更,独立可回滚,用 engine evaluate/complete 直测。
- **Phase 2**:adjudicate skill(独立叶子 agent 判断性 audit + 路由决策 + 三分类 gap 输出)。复用 BACK-657.1 的 skill 合同/lint/registry。
- **Phase 3**:primitive-executor 内循环增强(机械 DoD 重跑 + 根因分类 + 外抛)。
- **Phase 4**:worktree/claim 生命周期延长 + 三分类回退执行。
- **Stage(折进,原 Task 2)**:fixpoint-convergence 改写为消费机制层——dispatchChild invoke primitive-executor,evaluate 走 adjudicating。

若执行中规模确证超 Basic ~2000 行 ceiling,按 CLAUDE.md 中途转 Epic。

## 不变量（invariants）

- 其余 phase(decomposing/evaluating/draft/refining/spike)的 actor 归属与 scan 谓词语义不改;adjudicating 是唯一新增、唯一能写回退边的 phase。
- 隔离机制实现(exec-lock/cap 幂等/.caps/.wt/.signal/单驱动守卫/merge 串行化)不改,只是 claim 持有窗口变长。
- engine complete 的 DoD 独立重跑逻辑不改;adjudicating 是其上新加一层,不替换、不跳过。
- worker 永不自证 done。
- 已发布的 MCP tool 名称、CLI 子命令签名不改。

注:Phase 1 会把 execution 完成路径从 `ready→done` 扩展为 `ready→adjudicating→done`——这与 BACK-660/BACK-665 现有 invariants 文本字面交叉,Phase 1 落地后需回头用 `task edit --append-notes` 同步修订那两个 task 的 invariants 段落。

## ⚠️ 执行前 refining 须钉死的未定 schema

- 回退边在 pipeline-as-data 里的具体数据表达
- gap 指纹的结构(失败 IA 命令 + 根因层 编码去重)
- 三分类回退契约(保留/修正/新增)的 schema
- adjudicating agent 的输出格式
- 深度 risk-scaled 判据(复用 fixpoint RiskGated)

## 非目标

- monitor 自动 dispatch(BACK-660,依赖本 task)。
- authoring 机器 phase 的生产 transport 接线(E7/BACK-608)。
- 颗粒度第三判据的 CLAUDE.md 文档改动(单独处理)。

## 参考

- CLAUDE.md「Task decomposition granularity」「不动点 convention」「Simplicity-first」
- docs/adr/ADR-011(pipeline-as-data)、ADR-019(Integration Acceptance / fixpoint-meter)
- plugin/skills/fixpoint-convergence/SKILL.md(Stage 4 evaluate、triageNeedsHuman、verifyAudit、shouldDispatch)
- plugin/skills/primitive-executor/SKILL.md、plugin/skills/README.md
- src/harness/evaluator.ts(BACK-657.3,evaluateEpic 跑 IA 的先例)
- src/engine/pipeline.ts、src/engine/dispatch.ts、plugin/skills/phase-coverage.json
- BACK-657、BACK-660(invariants 待同步修订)、BACK-665(invariants 待同步修订)、BACK-654
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/engine/pipeline.ts 定义 adjudicating phase,且 execution leaf 完成路径经过它(ready→adjudicating→done);有测试断言该路径
- [ ] #2 回退边 + gap 指纹守卫实现:同一 gap 指纹第二次触发回退→needs-human;有测试覆盖单调收缩与终止
- [ ] #3 plugin/skills/adjudicate/{SKILL.md,contract.json} 存在,注册 phase-coverage.json,skill-lint.sh --all 通过
- [ ] #4 primitive-executor 内循环:DoD 红→根因分类(实现层内修/规格层外抛),SKILL.md 反映;有测试或契约覆盖
- [ ] #5 三分类回退契约(保留/修正/新增)有 schema 定义 + 测试;修正型 gap 显式标注旧实现作废块
- [ ] #6 fixpoint-convergence SKILL.md 改写为消费机制层(dispatchChild invoke primitive-executor、evaluate 走 adjudicating),不再内联方法论
- [ ] #7 全程用 engine evaluate/complete 路径直测,不依赖 monitor/任何 driver
- [ ] #8 不改 execution 前向 scan 谓词/actor 语义;不改 engine complete 的 DoD 独立重跑;不改 claim/worktree 隔离机制(仅延长生命周期)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
