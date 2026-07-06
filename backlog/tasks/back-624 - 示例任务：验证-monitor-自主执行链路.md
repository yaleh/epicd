---
id: BACK-624
title: 示例任务：验证 monitor 自主执行链路
status: 'Basic: Done'
assignee: []
created_date: '2026-07-05 01:15'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:chore'
dependencies: []
ordinal: 25000
pipeline_id: execution
phase: done
dod:
  - text: test -f docs/research/back-624-smoke-test.md
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
验证 engine promote → basic-ready → monitor 自主认领链路的一次性演示任务。实现：创建文件 docs/research/back-624-smoke-test.md，内容为一行 '# BACK-624 monitor smoke test — 可安全删除'。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-05T01:20:56Z
<!-- SECTION:NOTES:END -->
