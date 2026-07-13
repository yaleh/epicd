---
id: BACK-685
title: >-
  engine complete: BACK-619 board-only auto-merge-conflict resolution failed
  silently during BACK-682
assignee: []
created_date: '2026-07-07 19:51'
labels:
  - 'kind:basic'
  - 'area:engine'
dependencies: []
ordinal: 95000
pipeline_id: authoring
phase: backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-682 收尾时,`engine complete BACK-682 --worktree ...` 两次遇到 board 文件（仅
board 文件）合并冲突,均直接回退到 needs-human（commit 7df305e4 / b9dc8b5e）,而不是
按 BACK-619 在 `src/harness/real-primitives.ts` `gitMergeBranch()` 里实现的
"仅 board 文件冲突 → git checkout --ours + commit" 自动解决路径处理。

手动复现 `git merge --no-ff task/BACK-682` 确认：冲突确实只发生在 board 文件上（
`git diff --name-only --diff-filter=U` 只列出该文件),BACK-682 的实际代码 diff 能
干净合并。手动用 `git checkout --ours -- <board file>` + commit 解决后即恢复正常。

根因未确诊——怀疑是 husky/lint-staged 钩子在 `Bun.spawn` 管道 stdio 下的交互问题，
但未进一步排查。

## 目标

诊断为什么 `gitMergeBranch()` 的 BACK-619 board-only 自动解决路径在这次通过
`engine complete` 实际调用时没有触发（或触发后失败），修复根因，并补充一个回归测试
复现"仅 board 文件冲突"场景下自动解决必须成功。

## Acceptance Criteria

- [ ] 根因已确认并在 task 记录中写明（例如: hook 交互 / stdio 管道 / 其它）
- [ ] 有回归测试复现"仅 board 文件冲突"场景，断言 `engine complete` 自动解决成功且不落入 needs-human
- [ ] 修复后该测试通过；既有 BACK-619 相关测试套件全绿
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
