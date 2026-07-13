---
id: BACK-701
title: >-
  Deduplicate backlog/.backlog/.epicd directory-probe logic across plugin
  scripts
assignee:
  - '@claude'
created_date: '2026-07-13 13:18'
updated_date: '2026-07-13 14:09'
labels:
  - config
  - cli
dependencies: []
priority: low
ordinal: 114000
pipeline_id: execution
phase: adjudicating
dod:
  - text: bun test
    checked: false
  - text: >-
      bash -n plugin/scripts/handle-basic-ready.sh && bash -n
      plugin/scripts/complete-task.sh && bash -n plugin/scripts/skill-lint.sh
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-700 的独立审计发现：backlog/ -> .backlog/ -> .epicd/ 探测优先级逻辑（与 resolveBuiltInBacklogDirectory 语义一致）在以下 4 处被手工重复实现，而非共享一处：
- plugin/scripts/handle-basic-ready.sh（bash if/elif/elif/else）
- plugin/scripts/complete-task.sh（相同结构）
- plugin/scripts/skill-lint.sh（相同结构）
- plugin/scripts/scan-loop.cjs（JS 版 resolveBacklogDirName()）

目前 4 处逻辑完全一致，没有现存 bug，但违反 CLAUDE.md「相似关注点优先单一实现」的原则，且 BACK-700 自身审计过程中已经因目录探测不一致命中过一次真实 bug（skill-lint.sh 对残留 backlog/ 运行时垃圾文件误判）。建议抽取为一个共享的 bash helper（如 plugin/scripts/lib/resolve-backlog-dir.sh，供 3 个 shell 脚本 source），scan-loop.cjs 侧视情况共享常量或调用同一来源，避免未来再次出现探测不一致导致的目录检测 bug。

非目标：不改变 src/utils/backlog-directory.ts 中 TypeScript 侧的权威实现（该实现已经是唯一来源，本任务只处理 plugin/scripts/ 下的 shell/JS 侧重复）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 3 个 shell 脚本共享同一个 resolve-backlog-dir 逻辑（source 一个公共文件，而非各自 if/elif/elif/else）
- [x] #2 scan-loop.cjs 的探测逻辑与 shell 侧保持单一事实来源或至少通过共享常量/测试保证一致
- [x] #3 bun test 全绿，skill-lint.sh/scan-loop.cjs 相关测试无回归
- [x] #4 src/engine/dispatch.ts resolves the actual board directory name (backlog/.backlog/.epicd) instead of hardcoding backlog/.agent-done-<id> and backlog/tasks in the generated dispatch instructions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add plugin/scripts/lib/resolve-backlog-dir.sh exposing a resolve_backlog_dir(repo_root) helper (sets BACKLOG_DIR/BACKLOG_DIR_NAME) implementing the backlog > .backlog > .epicd probe-with-fallback priority, matching resolveBuiltInBacklogDirectory semantics.
2. Update handle-basic-ready.sh, complete-task.sh, skill-lint.sh to source lib/resolve-backlog-dir.sh instead of each having their own if/elif/elif/else block; verify BACKLOG_DIR / BACKLOG_DIR_NAME variable usages downstream are unaffected.
3. In scan-loop.cjs, keep resolveBacklogDirName() as the single JS-side source but add a bun test asserting the shell helper's priority order and resolveBacklogDirName()'s priority order encode the same list, so they cannot silently diverge.
4. Fix src/engine/dispatch.ts: add a backlogDirName parameter to renderBasicReadyDispatch and thread it into the 5 hardcoded 'backlog' lines (git add -A pathspec, board-state comment, agent-done signal path x3). Update callers src/cli.ts:4458 and src/engine/supervisor.ts:61-67 to pass core.filesystem.backlogDirName (supervisor.ts also hardcodes join(repoRoot, 'backlog') for worktreeMarkerPath — fix that too). Update src/test/engine-dispatch.test.ts call site + assertions accordingly. dispatch.ts must stay import-free (engine-spawn-seam.test.ts guard) so the name must be threaded as a parameter, never resolved inside dispatch.ts.
5. Run bun test, bunx tsc --noEmit, bun run check . and fix issues.
6. Update task with notes/final summary and check ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Stage 1 file-line survey (pre-dispatch) found a live bug: src/engine/dispatch.ts hardcodes backlog/.agent-done-<id> and backlog/tasks in the generated payload text, unresolved since BACK-700's .epicd migration — this would break BACK-701's own dispatch handshake. Confirmed with user to fold the dispatch.ts fix into this task's scope rather than filing a separate follow-up.

claimed: 2026-07-13T13:37:25Z

Post-merge verification (mergeAndVerify) found and fixed a bug the implementation agent introduced: src/engine/dispatch.ts's board-state comment line had a stray literal doublequote+comma baked into the generated dispatch text (a botched plain-string→template-literal conversion), confirmed by directly rendering renderBasicReadyDispatch() output. Fixed in place, added a regression test (engine-dispatch.test.ts: 'keeps every line a plain >-prefixed markdown quote line, with no stray quote/comma artifacts'), and re-ran bun test (2113 pass/0 fail), bunx tsc --noEmit, and bun run check . (13 pre-existing warnings, no errors) before committing.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
