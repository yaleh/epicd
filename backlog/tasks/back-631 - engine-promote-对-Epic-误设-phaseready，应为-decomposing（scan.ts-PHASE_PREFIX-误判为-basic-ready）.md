---
id: BACK-631
title: >-
  engine promote 对 Epic 误设 phase=ready，应为 decomposing（scan.ts PHASE_PREFIX 误判为
  basic-ready）
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 08:59'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
priority: high
ordinal: 49000
pipeline_id: execution
phase: done
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test --parallel
    checked: false
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
engine promote（src/cli.ts:4711-4747）对 status='Epic: Backlog' 与 'Basic: Backlog' 一视同仁地把 phase 设为 'ready'。但 src/engine/scan.ts 的 PHASE_PREFIX 只按 phase 值分派（ready→basic-ready，decomposing→epic-ready），不看 role。结果：任何 Epic 经 engine promote 后都会被 engine scan/dispatch 误判为 basic-ready，而非触发 epic-decompose——同类问题的先例是 BACK-622（decomposer.ts status/phase 脱节）。经复核 BACK-628.4 的 diff（commit 157912c）证实未触碰 cli.ts 的 promote，缺口未被那次工作覆盖。发现路径：为推进 BACK-602（E2）尝试用 engine promote 走真实自举流程时触发。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 engine promote 依据任务 role（compound→decomposing，primitive→ready）设置 phase，而非硬编码 ready
- [x] #2 回归测试：promote 一个 role=compound 的 Epic 后，engine scan 输出 epic-ready:<id> 而非 basic-ready:<id>
- [x] #3 既有 Basic 任务 promote 行为（role=primitive→ready）零回归
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
根因：engine promote（src/cli.ts）硬编码 phase='ready'，未按 status（Epic:/Basic:）分支。修复：status==='Epic: Backlog' 时 phase='decomposing' 且显式设 role='compound'（roleOf() 的 doc comment 早已说明 pre-decompose epic 需要预声明 role，因为此刻树上还没有 children 可供派生）。src/test/engine-promote.test.ts 更新：原测试断言的是 bug 本身（Epic promote 后 phase=ready/status='Epic: Ready'）——已改为断言 decomposing/compound/'Epic: Decomposing'，并新增 negative control（engine scan 输出 epic-ready 而非 basic-ready）+ 无预声明 role/children 场景的回归。bunx tsc --noEmit / bun run check . / bun test --parallel 全绿（1796 pass）。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
