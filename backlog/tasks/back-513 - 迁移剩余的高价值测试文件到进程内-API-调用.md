---
id: BACK-513
title: 迁移剩余的高价值测试文件到进程内 API 调用
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-06-25 11:42'
updated_date: '2026-06-25 12:25'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 1000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 迁移剩余的高价值测试文件到进程内 API 调用

## Context

BACK-512 建立了进程内 API 调用的 helper 基础设施，迁移了 3 个文件，但仍有 294 次子进程调用分布在 28 个文件中。按子进程数排列的前 5 个文件（cli.test.ts 77、cli-milestone-management.test.ts 30、acceptance-criteria.test.ts 26、task-edit-preservation.test.ts 24、cli-refs-docs.test.ts 21）合计 178 次，理论可节省约 95s。本任务聚焦这 5 个文件，使用已有 Core API（`createTaskFromInput`、`updateTaskFromInput`、`queryTasks`）和 `test-helpers.ts` helpers。

## Phase A: 扩展 test-helpers.ts 以覆盖缺失操作

`editTaskPlatformAware` / `editTaskViaCore` 目前不支持 `--check-ac`、`--remove-ac`、`--uncheck-ac` 以及 `--ref`、`--doc`、`--modified-file` create 选项。Core API（`updateTaskFromInput`）已有 `checkAcceptanceCriteria`、`removeAcceptanceCriteria`、`references`、`documentation`、`modifiedFiles` 字段支持。

1. 读取 `src/test/test-helpers.ts` 和 `src/core/backlog.ts`，确认字段名
2. 在 `TaskEditOptions` 中添加 `checkAc?: number[]`、`removeAc?: number[]`、`uncheckAc?: number[]`
3. 在 `TaskCreateOptions` 中添加 `ref?: string[]`、`doc?: string[]`、`modifiedFile?: string[]`
4. 在 `editTaskViaCore` 中映射这些字段到 `updateTaskFromInput` 的对应输入
5. 在 `createTaskViaCore` 中映射到 `createTaskFromInput` 的对应输入
6. 运行 `bun test src/test/test-helpers.test.ts` 确认已有测试通过，必要时更新测试覆盖新 options

### DoD
- [ ] `bun test src/test/test-helpers.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q 'checkAc' src/test/test-helpers.ts`
- [ ] `grep -q 'ref.*string' src/test/test-helpers.ts`

## Phase B: 迁移 task-edit-preservation.test.ts 和 cli-refs-docs.test.ts

两个文件的操作（create / edit / view + ref / doc / modifiedFile）均已由 Phase A 扩展的 helpers 覆盖，无需新增 Core 能力。

**task-edit-preservation.test.ts**（24 次子进程调用）：
- 所有 6 个测试均为业务逻辑（preservation of sections when editing labels / description / AC / plan / notes）
- 替换 `bun ${cliPath} task create/edit/view` 为 `createTaskPlatformAware` / `editTaskPlatformAware` / `viewTaskPlatformAware`
- 移除 `cliPath` 常量和 `$` import（若无其他用处）

**cli-refs-docs.test.ts**（21 次子进程调用）：
- describe 块：task create with --ref / --doc / both / --modified-file；task edit with --ref / --doc
- 业务逻辑测试（field persisted in file）→ in-process；不测试 CLI 错误消息格式
- 替换为 `createTaskPlatformAware` / `editTaskPlatformAware` 使用 Phase A 扩展的 ref / doc / modifiedFile 选项

### DoD
- [ ] `bun test src/test/task-edit-preservation.test.ts`
- [ ] `bun test src/test/cli-refs-docs.test.ts`
- [ ] `! grep -q 'bun ${cliPath}' src/test/task-edit-preservation.test.ts`
- [ ] `! grep -q 'bun ${cliPath}' src/test/cli-refs-docs.test.ts`

## Phase C: 迁移 acceptance-criteria.test.ts

26 次子进程调用，覆盖 create with --ac / edit with --ac / --check-ac / --remove-ac / --uncheck-ac。

- `task create ... --ac` → `createTaskPlatformAware({ ac: "..." })`
- `task edit ... --check-ac N` → `editTaskPlatformAware({ checkAc: [N] })`
- `task edit ... --remove-ac N` → `editTaskPlatformAware({ removeAc: [N] })`
- `task edit ... --uncheck-ac N` → `editTaskPlatformAware({ uncheckAc: [N] })`
- error-path tests（`--remove-ac -1`、`--remove-ac abc`、`--check-ac 10` out of range）验证 CLI 错误消息格式 → 保留为子进程调用
- 保留 `view` 调用读取任务文件内容后用 `expect(...).toContain(...)` 断言 — 改用 `viewTaskPlatformAware`

### DoD
- [ ] `bun test src/test/acceptance-criteria.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q 'checkAc' src/test/acceptance-criteria.test.ts`
- [ ] `grep -q 'editTaskPlatformAware' src/test/acceptance-criteria.test.ts`

## Phase D: 迁移 cli-milestone-management.test.ts 的业务逻辑测试

30 次子进程调用，但 milestone 的 add / rename / remove 操作没有直接对应的 Core 方法，需确认是否通过 `updateTaskFromInput` 或专用 Core 方法操作。

1. 读取 `src/core/backlog.ts`，搜索 `milestone` 相关方法（`addMilestone`、`renameMilestone`、`removeMilestone`）
2. 若存在 Core 方法：在 `test-helpers.ts` 中增加 `addMilestoneViaCore`、`renameMilestoneViaCore`、`removeMilestoneViaCore` helpers，迁移可迁移的测试（adds / renames / removes milestone, updates task references）；在文件顶部添加注释 `// MIGRATED: milestone core helpers`
3. 若 Core 方法不存在（milestone 操作只通过 CLI 实现）：在文件顶部添加注释 `// CLI-CONTRACT-ONLY: no Core milestone API` 并保留所有子进程调用
4. 保留 CLI 合约测试（help output、schema doc、error messages）为子进程调用

### DoD
- [ ] `bun test src/test/cli-milestone-management.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q 'MIGRATED\|CLI-CONTRACT-ONLY' src/test/cli-milestone-management.test.ts`

## Phase E: 迁移 cli.test.ts 的业务逻辑子集

77 次子进程调用，是最大的文件。不可能全部迁移（help text、error format 等 CLI 合约测试必须保留），目标是迁移纯业务逻辑的 create / edit / view / list 调用。

Business-logic tests to migrate: tests whose assertions check field values stored/returned (e.g., task title, status, label, description persisted correctly). CLI-contract tests to keep as subprocess: tests that assert on stdout/stderr text format, help text, exit codes, or error message wording.

1. For each test block in cli.test.ts, classify by the rule above and add an inline comment `// IN-PROCESS` or `// CLI-CONTRACT` next to the `it(` / `test(` line
2. Migrate business-logic tests (~40 estimated) using `createTaskPlatformAware` / `editTaskPlatformAware` / `viewTaskPlatformAware` / `listTasksPlatformAware`
3. Keep CLI-contract tests (~37 estimated) as subprocess calls
4. Remove `CLI_PATH` import only if zero subprocess calls remain; otherwise leave it

### DoD
- [ ] `bun test src/test/cli.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q 'IN-PROCESS\|createTaskPlatformAware\|editTaskPlatformAware' src/test/cli.test.ts`
- [ ] `grep -q 'CLI-CONTRACT' src/test/cli.test.ts`

## Constraints
- 验证 CLI 输出格式、help text、exit code、错误消息格式的测试必须保留为子进程调用
- 不修改测试断言内容——相同覆盖，相同正确性检查
- 迁移后测试通过数不得减少
- 不新增 Core API 方法，只调用已有方法（`createTaskFromInput`、`updateTaskFromInput`、`queryTasks`）
- cli-milestone-management.test.ts 的迁移以「Core 方法存在」为前提，否则标注 CLI-CONTRACT-ONLY 并跳过

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iteration 1: NEEDS_REVISION → fixed and re-uploaded.

Issues found and corrected:
1. Phase B DoD lines 3-4: Nested backticks in `! grep -qE '\$`bun \$\{CLI_PATH\}'` would break shell parsing and the escaped pattern would not match source text. Replaced with `! grep -q 'bun ${CLI_PATH}'` using single-quoted literal pattern.
2. Phase C DoD: No absence/migration-verification check. Added `grep -q 'checkAc'` and `grep -q 'editTaskPlatformAware'` items.
3. Phase D DoD: Conditional logic (Core method exists / skip) left DoD non-concrete. Fixed by requiring a marker comment (`// MIGRATED:` or `// CLI-CONTRACT-ONLY:`) in the file regardless of branch, verified with `grep -q 'MIGRATED\|CLI-CONTRACT-ONLY'`.
4. Phase E DoD: No migration-verification check. Added `grep -q 'IN-PROCESS\|createTaskPlatformAware\|editTaskPlatformAware'` and `grep -q 'CLI-CONTRACT'` items. Also clarified the business-logic vs CLI-contract classification rule with explicit criteria.
5. Phase A DoD: Added two `grep -q` items to verify the new fields are actually present in test-helpers.ts.

Plan review iteration 3: APPROVED

cap:propose=approved

claimed: 2026-06-25T11:52:56Z

Phase A ✓ 2026-06-25T11:59:05Z
Extended test-helpers.ts with checkAc, removeAc, uncheckAc, ref, doc, modifiedFile, plain support
Phase B ✓ 2026-06-25T12:00:42Z
Migrated task-edit-preservation.test.ts and cli-refs-docs.test.ts to in-process API
Phase C ✓ 2026-06-25T12:03:09Z
Migrated acceptance-criteria.test.ts to in-process API (kept CLI-CONTRACT error tests as subprocess)
Phase D ✓ 2026-06-25T12:05:08Z
cli-milestone-management.test.ts: Added CLI-CONTRACT-ONLY comment; no Core milestone add/remove API available
Phase E ✓ 2026-06-25T12:17:02Z
Migrated cli.test.ts task list business-logic tests to in-process API; CLI-CONTRACT tests kept as subprocess
DoD #1: PASS — bun test
DoD #2: PASS — bunx tsc --noEmit
## Execution Summary
Result: Done
Commit: 365ff8b

Completed: 2026-06-25T12:25:16Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 bun test src/test/test-helpers.test.ts
- [ ] #5 bunx tsc --noEmit
- [ ] #6 grep -q 'checkAc' src/test/test-helpers.ts
- [ ] #7 grep -q 'ref.*string' src/test/test-helpers.ts
- [ ] #8 bun test src/test/task-edit-preservation.test.ts
- [ ] #9 bun test src/test/cli-refs-docs.test.ts
- [ ] #10 ! grep -q 'bun ${cliPath}' src/test/task-edit-preservation.test.ts
- [ ] #11 ! grep -q 'bun ${cliPath}' src/test/cli-refs-docs.test.ts
- [ ] #12 bun test src/test/acceptance-criteria.test.ts
- [ ] #13 bunx tsc --noEmit
- [ ] #14 grep -q 'checkAc' src/test/acceptance-criteria.test.ts
- [ ] #15 grep -q 'editTaskPlatformAware' src/test/acceptance-criteria.test.ts
- [ ] #16 bun test src/test/cli-milestone-management.test.ts
- [ ] #17 bunx tsc --noEmit
- [ ] #18 grep -q 'MIGRATED\|CLI-CONTRACT-ONLY' src/test/cli-milestone-management.test.ts
- [ ] #19 bun test src/test/cli.test.ts
- [ ] #20 bunx tsc --noEmit
- [ ] #21 grep -q 'IN-PROCESS\|createTaskPlatformAware\|editTaskPlatformAware' src/test/cli.test.ts
- [ ] #22 grep -q 'CLI-CONTRACT' src/test/cli.test.ts
- [ ] #23 bun test
- [ ] #24 bunx tsc --noEmit
<!-- DOD:END -->
