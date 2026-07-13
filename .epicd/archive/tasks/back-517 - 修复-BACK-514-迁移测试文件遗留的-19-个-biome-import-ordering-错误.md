---
id: BACK-517
title: 修复 BACK-514 迁移测试文件遗留的 19 个 biome import-ordering 错误
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-06-25 23:21'
updated_date: '2026-06-25 23:33'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 110000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 修复 BACK-514 迁移测试文件遗留的 19 个 biome import-ordering 错误

## Context

BACK-514 迁移 ~70 个子进程调用到进程内 API 时，新增/调整了多个测试文件的 import，但未通过 `bun run check .` 的 organizeImports 规则——`bun run check .` 在 base commit 上即报 19 个 FIXABLE 的 import 排序错误（`assist/source/organizeImports`），分布在 13 个测试文件。这些是纯机械的安全可修复项（biome 标注 "Safe fix: Organize Imports"），不影响测试通过但污染 lint 门禁。CI 用 `bun run lint`（通过），但 `bun run check .` 红，需清理以恢复全绿。

受影响文件（13 个，均在 `src/test/`）：acceptance-criteria、append-implementation-notes、cli-final-summary、cli-parent-filter、cli-plain-create-edit、cli-plain-output、cli-refs-docs、cli-task-milestone、cli-zero-padded-ids、comments、definition-of-done-cli、desc-alias、description-newlines。

## Phase 1: 自动修复 import 排序并验证

1. 运行 biome 的安全自动修复：`bun run check --write .`（biome 的 `check --write` 应用 organizeImports 等 safe fixes）
2. 确认仅 import 顺序变化、无逻辑改动：`git diff --stat` 应只涉及上述 test 文件，且 diff 内容仅为 import 行重排
3. 运行受影响测试确认无破坏：`bun test src/test/cli-plain-output.test.ts src/test/desc-alias.test.ts src/test/comments.test.ts --timeout=30000`
4. 全量类型检查：`bunx tsc --noEmit`

### DoD
- [ ] `bun run check .`
- [ ] `bunx tsc --noEmit`
- [ ] `bun test src/test/cli-plain-output.test.ts src/test/desc-alias.test.ts src/test/comments.test.ts --timeout=30000`

## Phase 2: 全量测试回归确认

确认机械的 import 重排未引入任何回归。

1. 运行完整测试套件（并行）：`bun test --parallel --timeout=30000`
2. 若有失败，逐一核实是否为已知 flaky（symlink-backlog-root、reorder-utils、editor）或本地 config.yml 污染（cli-help-schemas，见 BACK-518），而非本任务引入

### DoD
- [ ] `bun test --parallel --timeout=30000`

## Constraints
- 仅做 import 顺序的机械修复，不改任何测试逻辑、断言或业务代码
- 不手动重排——使用 biome `check --write` 的安全修复，保证与 lint 规则一致
- 不触碰非测试文件
- 若 `check --write` 之外仍残留非 import 类 biome 错误，停止并升级 Basic: Needs Human 说明（本任务范围仅 import 排序）

## Acceptance Gate
- [ ] `bun run check .`
- [ ] `bunx tsc --noEmit`
- [ ] `bun test --parallel --timeout=30000`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iteration 1: APPROVED

claimed: 2026-06-25T23:28:10Z

Done ✓ - biome organizeImports auto-fixed; bun run check . clean (0 errors, 5 pre-existing unsafe-fix warnings out of scope); bunx tsc --noEmit clean; bun test --parallel 1348 pass 0 fail. Note: check --write also applied biome format safe-fixes (line-wrap collapse, comment repositioning) on 16 files — all mechanical, no logic/assertion changes. 3 files beyond the listed 13 (implementation-notes-append, task-edit-preservation, test-helpers) had the same import-ordering issue and were fixed too.

Completed: 2026-06-25T23:33:14Z
Pre-merge: bun run check . exit 0 (16 files organizeImports+format safe-fixes), tsc clean, parallel suite 1348 pass 0 fail.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 bun run check .
- [ ] #5 bunx tsc --noEmit
- [ ] #6 bun test src/test/cli-plain-output.test.ts src/test/desc-alias.test.ts src/test/comments.test.ts --timeout=30000
- [ ] #7 bun test --parallel --timeout=30000
- [ ] #8 bun run check .
- [ ] #9 bunx tsc --noEmit
- [ ] #10 bun test --parallel --timeout=30000
<!-- DOD:END -->
