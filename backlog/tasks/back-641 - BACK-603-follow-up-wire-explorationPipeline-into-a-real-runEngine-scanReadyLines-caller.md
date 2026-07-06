---
id: BACK-641
title: >-
  BACK-603 follow-up: wire explorationPipeline into a real
  runEngine/scanReadyLines caller
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 11:21'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
ordinal: 61000
pipeline_id: execution
phase: proposal
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
独立审计发现 explorationPipeline 在 src/engine/pipeline.ts 定义后从未被任何真实（非测试）调用方传入 runEngine/scanReadyLines——生产路径（src/cli.ts:4571、src/engine/supervisor.ts:50）仍只用默认的 [executionPipeline]。当前 exploration pipeline 只在测试里可达，engine 实际运行时无法调度/处理任何 exploration 任务。若要让 BACK-603 声称的"第三条 pipeline 实例"在生产中真正可用，需要在合适的调用方（如 supervisor 的 tick 循环或 cli 的 engine run 命令）把 pipelines 列表改为 [executionPipeline, explorationPipeline]，并评估对既有 scan 行为的影响（如是否需要按来源过滤/是否有 UI 侧关联改动）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 bunx tsc --noEmit
- [ ] #5 bun run check .
- [ ] #6 bun test --parallel
<!-- DOD:END -->
