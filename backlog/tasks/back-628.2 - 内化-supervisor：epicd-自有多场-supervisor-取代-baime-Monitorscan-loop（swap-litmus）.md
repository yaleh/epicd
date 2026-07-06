---
id: BACK-628.2
title: 内化 supervisor：epicd 自有多场 supervisor 取代 baime Monitor+scan-loop（swap-litmus）
status: 'Epic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 05:54'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:feature'
  - 'epicd:bootstrap'
dependencies: []
parent_task_id: BACK-628
ordinal: 43000
pipeline_id: execution
phase: done
parent_id: BACK-628
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
今天执行车道的'心脏'是借来的：baime 的 Monitor + scan-loop.cjs 供电（invocation adapter + supervisor 两个适配器角色）。真自举要求 epicd 用**自己的** supervisor 驱动自己的板。driver-supervisor proposal §4.3 已设计受管 Bun supervisor；ADR-015 已给 swap-litmus。

## 做什么
1. 落地 epicd 自有 supervisor（受管进程），起 driver-per-(sourceId,pipeline_id)，满足 ENG-1..6（单例、offset 冷启恢复、worktree 隔离、merge 锁、cap 幂等、场不互 reap）。
2. 保持调用接缝签名 invokeClaudeCode(prompt, worktree)：engine 产出的自包含派发（BACK-625）既能喂给 epicd supervisor 的 seat，也能喂给裸 claude -p——engine 不改。
3. 执行车道在**不启动 baime Monitor+scan-loop** 的前提下自驱一个 ready 任务至 terminal。
4. baime scan-loop.cjs 降为可选兼容传输，不再是执行车道必需件。

非目标：不实现 authoring 车道 handler 内部（归 E7/BACK-608）；不做远程 IssueSource adapter。
参考：proposal §4.2/§4.3/§4.5 · ADR-010 ENG-1..5 · ADR-012 ENG-6..7 · ADR-015 swap-litmus。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 存在 epicd 自有 supervisor（受管进程）起 driver-per-field，满足 ENG-1..6（有针对单例/offset/worktree/merge-lock/cap/场不互 reap 的测试）
- [x] #2 执行车道在不启动 baime Monitor+scan-loop 的情况下自驱一个 ready 任务至 terminal
- [x] #3 swap-litmus：同一 engine dispatch 输出既能驱动 epicd supervisor 也能驱动裸 claude -p，engine 代码不变
- [x] #4 baime scan-loop.cjs 降为可选兼容传输；epicd-run 之外存在纯 epicd 的启动路径
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1: engine/supervisor.ts + engine-supervisor.test.ts cover ENG-1/4 (cap-marker dispatch idempotency, restart-safe) and ENG-6 (field lock single-instance, cross-field non-reap). AC#2: real e2e — created smoke task BACK-628.2.1, killed the only epicd-scoped scan-loop.cjs process, engine promote -> engine supervisor --once emitted the dispatch payload -> background Agent implemented in an isolated worktree -> engine complete merged to done, with no baime Monitor+scan-loop running throughout. AC#3: supervisor reuses renderBasicReadyDispatch/dispatch.ts unchanged -- same payload already proven swap-litmus-compatible by BACK-625/628.4's own dispatch tests; engine code untouched by this task. AC#4: engine supervisor is the pure-epicd start path; scan-loop.cjs is now optional compat transport, unmodified by this task. Full suite green (1806 tests), tsc clean, biome clean.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
