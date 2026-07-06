---
id: BACK-642
title: gitMergeBranch board-only 自动解冲未覆盖 untracked-file-would-be-overwritten 的合并中止路径
status: 'Basic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-05 12:46'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:bug'
dependencies: []
ordinal: 62000
pipeline_id: authoring
phase: backlog
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景
BACK-605（605.9、605.10）连续两轮独立审计中，`engine complete --worktree` 均因合并冲突路由 needs-human，需要主会话手动 `git merge --no-ff` + `checkout --theirs` 才能完成。

## 根因（BACK-605 fresh-context 审计已复现确认）
`src/harness/real-primitives.ts` 的 `gitMergeBranch` 里 BACK-619 引入的 board-only 自动解冲逻辑，只在 `git merge` **进入冲突状态**（存在冲突标记，`git diff --name-only --diff-filter=U` 能列出 `UU`/`AA` 路径）之后才生效。

但当主 repo 工作区里存在**未提交（untracked）**的同名 board 任务文件、同时 worktree 分支又提交了同一路径的新文件时，`git merge` 会在真正进入三方合并前就以 exit 128 中止：
```
error: The following untracked working tree files would be overwritten by merge... Aborting
```
此时 `git status --porcelain` 只显示 `??`（untracked），不是 `AA`/`UU`；`git diff --diff-filter=U` 返回空，`isBoardOnly` 判空为 false，代码直接落到 `git merge --abort`（对当前状态是 no-op）并返回 `{merged:false, conflict:true}`，逃逸到 needs-human——即便冲突本质仍然只是 board 文件。

## 做什么
扩展 `gitMergeBranch`（或其调用方）识别并处理这个 pre-merge abort 失败特征（例如：合并前检测/暂存 `backlog/tasks/` 下的未提交文件，或捕获这条特定 stderr 模式后重试），使其与已有的 post-conflict board-only 自动解冲路径行为一致，不再无谓地把纯 board 文件冲突升级为 needs-human。

## 验收标准
- [ ] 复现"主 repo 存在同名 untracked board 文件 + worktree 分支新增同路径文件"场景，`engine complete --worktree` 不再路由 needs-human（在确实只是 board 文件冲突的前提下）
- [ ] 新增回归测试覆盖这个 pre-merge-abort 场景（区别于现有 both-modified/add-add-committed 场景的测试覆盖）
- [ ] 既有 board-only 自动解冲测试（`src/test/engine-merge.test.ts` 等）保持通过

参考：BACK-605.9/605.10 独立审计报告（本轮 fresh-context 审计发现并复现）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
