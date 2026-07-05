---
id: BACK-649
title: >-
  engine decompose-apply's default DoD is prose-only, missing structured
  --dod-gate, causing false needs-human on every child
status: 'Basic: Needs Human'
assignee:
  - '@claude'
created_date: '2026-07-05 15:19'
updated_date: '2026-07-05 18:02'
labels: []
dependencies: []
ordinal: 69000
pipeline_id: execution
phase: needs-human
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test --parallel
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
发现于 BACK-604 派发流程的第一个 child (BACK-644)：engine decompose-apply 给每个新 child 写的是 prose ## Definition of Done 三条(tsc/check/test)，但从未写入结构化 task.dod 字段。src/harness/dod-runner.ts 的 runDoD 只执行 task.dod（结构化字段），prose 检查表从不被执行(BACK-613 的既定设计——prose 是人读的，从不 shell 出)。task.dod 为空时 runDoD 返回 []，src/engine/complete.ts:113-119 把空结果当成失败,直接判 needs-human——无论worker实际工作是否正确。这会在每一个经 decompose-apply 创建的 child 上复现,不是 BACK-644 实现本身的问题。修复方向：decompose-apply(或其调用的 decomposer.ts)在写默认 prose DoD 的同时应该用等价内容写 --dod-gate 结构化字段，两者应保持同步，否则'看起来有 DoD 清单'但引擎实际上从不校验任何东西。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
