---
id: BACK-654
title: 'engine complete: adjudicate 判定与 dodResults 实际结果不一致，结构化 gate 全过仍路由 needs-human'
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-06 02:42'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:bug'
  - 'area:engine'
dependencies: []
priority: medium
ordinal: 74000
pipeline_id: execution
phase: proposal
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景
BACK-649 轻量路径执行中（2026-07-05，会话 9e574105-536d-458c-bda9-15e17d37b299，
17:59-18:08 UTC）第二轮 `engine complete --worktree` 判定为 needs-human，
但人工核实 dodResults 后发现结构化 DoD gate 实际全部通过。最终靠手动
`git merge` + 手动改状态收口，未走通 `engine complete` 的自动合并路径。
这与本方法反复强调的"engine complete 独立重跑 gate 并加锁合并，从不信任
agent 自证"的设计初衷相悖——根因可能在 src/engine/adjudicate.ts 的判定
逻辑与 dodResults 的读取/比较之间存在不一致。

详见 docs/research/baime-fixpoint-convergence/README.md 的
"轻量路径执行记录"/"已知偏差"小节。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 定位 adjudicate.ts 中导致该不一致的具体判定逻辑，写明根因
- [ ] #2 新增回归测试复现该场景：结构化 dod gate 全部通过但 adjudicate 曾错误返回 needs-human
- [ ] #3 修复根因，确保 gate 全部通过时 engine complete 能走自动合并路径而非路由人工
- [ ] #4 更新 docs/research/baime-fixpoint-convergence/README.md 的已知偏差记录，标注该缺陷已修复
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
