---
id: BACK-628.2.1
title: 示例任务：验证 epicd supervisor 自主执行链路（BACK-628.2 AC#2）
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 08:08'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:chore'
dependencies: []
parent_task_id: BACK-628.2
ordinal: 48000
pipeline_id: execution
phase: done
parent_id: BACK-628.2
dod:
  - text: test -f docs/research/back-628-2-smoke-test.md
    checked: false
cap:
  - phase: ready-dispatched
    done: true
    ts: '2026-07-05T08:11:38.003Z'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
验证 engine promote → engine supervisor(--once,非 baime Monitor+scan-loop) → 认领链路的一次性演示任务。实现：创建文件 docs/research/back-628-2-smoke-test.md，内容为一行 "# BACK-628.2 supervisor smoke test — 可安全删除"。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-05T08:11:43Z

Worktree epicd-BACK-628.2.1: created docs/research/back-628-2-smoke-test.md with required one-line content; committed as 1833e5c on task/BACK-628.2.1. No TS/lint/test surfaces touched, DoD checks N/A.
<!-- SECTION:NOTES:END -->
