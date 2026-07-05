---
id: BACK-628.2
title: 内化 supervisor：epicd 自有多场 supervisor 取代 baime Monitor+scan-loop（swap-litmus）
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 05:54'
labels:
  - 'kind:feature'
  - 'epicd:bootstrap'
dependencies: []
parent_task_id: BACK-628
ordinal: 43000
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
- [ ] #1 存在 epicd 自有 supervisor（受管进程）起 driver-per-field，满足 ENG-1..6（有针对单例/offset/worktree/merge-lock/cap/场不互 reap 的测试）
- [ ] #2 执行车道在不启动 baime Monitor+scan-loop 的情况下自驱一个 ready 任务至 terminal
- [ ] #3 swap-litmus：同一 engine dispatch 输出既能驱动 epicd supervisor 也能驱动裸 claude -p，engine 代码不变
- [ ] #4 baime scan-loop.cjs 降为可选兼容传输；epicd-run 之外存在纯 epicd 的启动路径
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
