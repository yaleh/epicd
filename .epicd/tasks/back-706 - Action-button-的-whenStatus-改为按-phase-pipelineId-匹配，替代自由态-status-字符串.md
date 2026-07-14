---
id: BACK-706
title: Action button 的 config 字段由 whenStatus 重命名为 whenPhase，直接匹配 pipeline 声明的 phase
assignee: []
created_date: '2026-07-14 02:47'
updated_date: '2026-07-14 02:52'
labels: []
dependencies: []
priority: medium
ordinal: 119000
pipeline_id: authoring
phase: drafting
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TaskAction.whenStatus 目前对比 task.status——对引擎任务而言这是 parser.ts 在解析时由 phase 派生出的 title-case 字符串（src/markdown/parser.ts:112），不是受 pipeline.ts 校验过的封闭词表。结果是配置里任何拼写/格式差异（如 "Draft" vs 实际的 "Drafting"，或 "Ready" 这种在当前 executionPipeline 里已不存在的旧值——见 pipeline.ts:30 ready/in-progress/decomposing 已合并进 implementing）都会静默失效：按钮不出现，且没有任何报错。

讨论结论（见任务评论/对话记录）：不只是改内部匹配逻辑，配置字段本身也应从 whenStatus 重命名为 whenPhase，值直接采用 pipeline.ts 各 Pipeline.states 声明的原始机器名（如 drafting/backlog/needs-human/implementing/done/spiking），不做 title-case 转换。理由：(1) 名称要如实反映匹配对象，继续叫 whenStatus 但语义已变本身就是一种误导；(2) 改名会让现有配置在加载期因未知字段/非法值报错，而不是像现在这样静默把按钮藏起来——这正是本任务要修的问题；(3) 该字段是 BACK-695 刚加不久的年轻功能，目前只有本仓库自己的 .epicd/config.yml 在用，没有需要兼容的外部消费者，可以直接改名、不留 whenStatus 别名。

已知接受的限制：phase 名可能跨 pipeline 重名（如 executionPipeline 和 explorationPipeline 都有 done），whenPhase 仅按 phase 名匹配、不做 pipelineId 区分；除非出现真实的跨 pipeline 混淆场景，本任务不预先添加 whenPipeline 做进一步限定（YAGNI）。
<!-- SECTION:DESCRIPTION:END -->




## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TaskAction 的配置字段从 whenStatus 重命名为 whenPhase，不保留 whenStatus 兼容别名
- [ ] #2 whenPhase 的值是 pipeline.ts 中 Pipeline.states 声明的原始机器名（如 drafting/backlog/needs-human），过滤逻辑直接对比 task.phase，不再经过 status 派生字符串
- [ ] #3 配置加载期用 isLegalPhase（跨 ALL_PIPELINES 校验）检查 whenPhase 中每个值；出现非法值时报出清晰错误，而非静默导致按钮不显示
- [ ] #4 .epicd/config.yml 中的 dispatch-to-worker action 迁移到 whenPhase，值改为该 action 实际要覆盖的 phase 机器名，并验证在对应 phase 的任务上正确显示/隐藏
- [ ] #5 无 phase 的纯 legacy 任务（status-only，无 pipeline_id/phase）在使用 whenPhase 时的行为有测试覆盖（预期：不匹配，按钮不显示）
- [ ] #6 已知限制有文字记录：whenPhase 不区分不同 pipeline 下的同名 phase（如两个 pipeline 都有 done），本任务不新增 whenPipeline 字段
- [ ] #7 bun test --parallel 全绿
<!-- AC:END -->
