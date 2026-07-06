---
id: BACK-634
title: engine decompose-apply 创建的子任务从不携带结构化 dod，engine complete 恒路由 needs-human
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 09:20'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
ordinal: 52000
pipeline_id: execution
phase: done
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test src/test/decomposer.test.ts
    checked: false
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
根因：ProposedChild（src/harness/decomposer.ts）无 dodGates 字段；applyProposedChildren 调用 core.createTaskFromInput 时从不传 dodGates；dod-runner.ts 明确按设计对无 dod 的任务返回 []，engine complete 恒路由 needs-human（"never auto-merges an ungated task"）。结果：任何经 epic-decompose 产生的子任务（包括手动 engine decompose-apply 与自动 makeDecomposer 两条路径）在其首次 engine complete 时必然进入 needs-human，无论真实实现是否通过 DoD——这是与 BACK-622/BACK-631 同类的引擎结构性 bug，在 BACK-632 的真实执行中被发现（agent 全部 DoD 通过后 engine complete 仍判定 needs-human）。修复方向：(1) ProposedChild 增加可选 dodGates?: string[] 字段并在 parseProposedChildren 透传；(2) applyProposedChildren 创建子任务时传入 dodGates（若 proposer 提供）；(3) buildDecomposeBrief 的输出格式提示词中说明 dodGates 可选字段及推荐默认（tsc/check/test 三件套），避免 proposer 遗漏；(4) 若 proposer 未提供 dodGates，不做静默兜底强行注入——保持 dod-runner.ts 现有"无 dod 即 needs-human"的安全设计，只是让 proposer 有能力声明。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed via BACK-632 dogfooding: applyProposedChildren never passed dodGates to createTaskFromInput, so decompose-created children always had empty task.dod, and dod-runner.ts's documented safety fallback (empty dod -> []) made engine complete route to needs-human unconditionally. Fixed: ProposedChild.dodGates threaded through parseProposedChildren/applyProposedChildren into createTaskFromInput; buildDecomposeBrief instructs proposers to include dodGates. Added tests in engine-decompose.test.ts (parseProposedChildren dodGates extraction/tolerance, integration test asserting task.dod is populated when dodGates supplied and empty when omitted). tsc/check/test all green (1800 pass).

Follow-up (found while dispatching BACK-633): task edit had --dod-gate to append structured gates but no removal counterpart, unlike --dod/--remove-dod for the prose checklist. Needed it immediately to fix a wrong dod-gate command backfilled onto BACK-633. Added --remove-dod-gate <index> to task edit (src/cli.ts), composable with --dod-gate in the same call (remove-by-index applied before appends). Tests added in cli-dod-gate.test.ts.
<!-- SECTION:NOTES:END -->
