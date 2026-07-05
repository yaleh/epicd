---
id: BACK-634
title: engine decompose-apply 创建的子任务从不携带结构化 dod，engine complete 恒路由 needs-human
status: 'Basic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-05 09:20'
labels: []
dependencies: []
ordinal: 52000
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test src/test/decomposer.test.ts
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
根因：ProposedChild（src/harness/decomposer.ts）无 dodGates 字段；applyProposedChildren 调用 core.createTaskFromInput 时从不传 dodGates；dod-runner.ts 明确按设计对无 dod 的任务返回 []，engine complete 恒路由 needs-human（"never auto-merges an ungated task"）。结果：任何经 epic-decompose 产生的子任务（包括手动 engine decompose-apply 与自动 makeDecomposer 两条路径）在其首次 engine complete 时必然进入 needs-human，无论真实实现是否通过 DoD——这是与 BACK-622/BACK-631 同类的引擎结构性 bug，在 BACK-632 的真实执行中被发现（agent 全部 DoD 通过后 engine complete 仍判定 needs-human）。修复方向：(1) ProposedChild 增加可选 dodGates?: string[] 字段并在 parseProposedChildren 透传；(2) applyProposedChildren 创建子任务时传入 dodGates（若 proposer 提供）；(3) buildDecomposeBrief 的输出格式提示词中说明 dodGates 可选字段及推荐默认（tsc/check/test 三件套），避免 proposer 遗漏；(4) 若 proposer 未提供 dodGates，不做静默兜底强行注入——保持 dod-runner.ts 现有"无 dod 即 needs-human"的安全设计，只是让 proposer 有能力声明。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
