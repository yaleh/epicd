---
id: BACK-515
title: Split cli.test.ts and add --max-jobs 4 parallel file execution in CI
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-06-25 14:51'
updated_date: '2026-06-25 15:37'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split the monolithic cli.test.ts (2461 lines, 71 subprocess calls) into 8-10 focused test files, then configure CI to run bun test files in parallel with --max-jobs 4 (conservative, avoids CPU saturation from concurrent bun subprocess spawning). Expected combined savings: ~30-40s from splitting enabling better file-level parallelism, on top of BACK-512's in-process API gains.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Split cli.test.ts and add parallel file execution

## Context

`src/test/cli.test.ts` is 2461 lines containing 14 describe blocks and 90 test cases under a single outer `describe("CLI Integration")`. Keeping all tests in one file prevents bun's file-level parallel execution (`--isolate` mode, already active in CI) from parallelising across the split. Splitting into 8–9 focused files lets each file run as an independent worker, directly reducing wall-clock CI time on top of the in-process API gains from BACK-512.

## Phase 1: Audit cli.test.ts and define split boundaries

Read `src/test/cli.test.ts` in full and produce a split map document listing:
- Which describe blocks map to which new file
- Which imports each new file needs (from `../index.ts`, `../markdown/parser.ts`, etc.)
- Which blocks share the same `beforeEach` git-init + `initializeTestProject` pattern (all do — each file gets its own `beforeEach`/`afterEach` using `createUniqueTestDir` + `safeCleanup`, identical to the existing pattern in `cli-milestone-management.test.ts`)
- Note that the outer `describe("CLI Integration")` wrapper is cosmetic — it can be dropped in split files; each file's top-level describe becomes the feature name

Proposed split map (adjust only if a block is too small to warrant its own file — merge small blocks with thematically adjacent ones):

| New file | Source describe blocks | Approx lines |
|---|---|---|
| `cli-instructions.test.ts` | "root command" + "backlog instructions command" | ~200 |
| `cli-help-schemas.test.ts` | "command help input schemas" + "self-correcting CLI errors" | ~140 |
| `cli-init.test.ts` | "backlog init command" + "git integration" | ~375 |
| `cli-create.test.ts` | "create commands" | ~95 |
| `cli-task-list.test.ts` | "task list command" | ~430 |
| `cli-task-view-edit.test.ts` | "task view command" + "task shortcut command" + "task edit command" | ~405 |
| `cli-task-lifecycle.test.ts` | "task archive and state transition commands" | ~330 |
| `cli-docs-board.test.ts` | "doc and decision commands" + "board view command" | ~450 |

Total: 8 new files. The original `src/test/cli.test.ts` is deleted after all tests pass.

Shared state to extract per file:
- `const CLI_PATH = join(process.cwd(), "src", "cli.ts")` — copy to each file that uses CLI subprocess calls; files that use only Core API do not need it
- `const normalizeCliOutput = ...` — copy only into files that use it (cli-instructions.test.ts)
- Imports: each file carries only the imports it needs; the full import set in cli.test.ts lines 1–11 is the superset

### DoD
- [ ] `grep -q '## Split Map' /tmp/tmp.MDM6v9uui5/cli-split-map.md`

## Phase 2: Split cli.test.ts into focused files

Create each new file under `src/test/` following the pattern of `src/test/cli-milestone-management.test.ts`:

1. No outer `describe("CLI Integration")` wrapper — start directly with the feature-level describe
2. Declare `let TEST_DIR: string` at module scope
3. `beforeEach`: call `createUniqueTestDir("<prefix>")` and store to `TEST_DIR`; for blocks that need git + init, replicate the git-init + `initializeTestProject` calls from the source describe's own `beforeEach`
4. `afterEach`: call `safeCleanup(TEST_DIR)`
5. Carry only the imports referenced in that file's tests

After creating all 8 files:
- Run each file individually to confirm it passes
- Delete `src/test/cli.test.ts`
- Run full suite to confirm no regressions

### DoD
- [ ] `bun test src/test/cli-instructions.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-help-schemas.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-init.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-create.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-task-list.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-task-view-edit.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-task-lifecycle.test.ts --timeout=30000`
- [ ] `bun test src/test/cli-docs-board.test.ts --timeout=30000`
- [ ] `! test -f src/test/cli.test.ts`
- [ ] `bun test --timeout=30000`

## Phase 3: Add parallel file execution

CI already runs `bun test --isolate` (Linux/macOS) and `bun test --isolate --max-concurrency=4` (Windows). The `--isolate` flag runs each file in its own worker process; bun schedules workers using an internal pool. After the split, 8 new files replace 1 large file, so bun's existing `--isolate` scheduling immediately benefits.

The additional change requested is to cap concurrency at 4 on all platforms (not just Windows) to avoid CPU saturation from concurrent bun subprocess spawning within each test file. This is done by adding `--max-concurrency=4` to the Linux/macOS branch of the CI `Run tests` step in `.github/workflows/ci.yml`.

Specifically, change the else branch from:
```
bun test --isolate --timeout=10000 --reporter=junit --reporter-outfile=test-results.xml
```
to:
```
bun test --isolate --timeout=10000 --max-concurrency=4 --reporter=junit --reporter-outfile=test-results.xml
```

No Makefile or new scripts are needed; the existing CI step covers the change.

### DoD
- [ ] `grep -q 'max-concurrency=4' /home/yale/work/Backlog.md/.github/workflows/ci.yml`
- [ ] `bun test --isolate --timeout=30000 --max-concurrency=4`

## Constraints

- Do not change any test logic or assertions; this is a mechanical split + config change only
- Do not rename existing test files other than deleting `cli.test.ts`
- Do not add new shared helpers unless a pattern appears in 3 or more new files
- Do not touch Windows CI branch (already has `--max-concurrency=4`)
- Do not merge describe blocks across feature areas just to reduce file count

## Acceptance Gate
- [ ] `! test -f /home/yale/work/Backlog.md/src/test/cli.test.ts`
- [ ] `bun test --isolate --timeout=30000 --max-concurrency=4`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `grep -q 'max-concurrency=4' /home/yale/work/Backlog.md/.github/workflows/ci.yml`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iteration 1: APPROVED

cap:propose=approved

claimed: 2026-06-25T15:14:14Z

All phases complete: 8 new test files created (cli-instructions, cli-help-schemas, cli-init, cli-create, cli-task-list, cli-task-view-edit, cli-task-lifecycle, cli-docs-board), cli.test.ts deleted, --max-concurrency=4 added to Linux/macOS CI branch, all 1348 tests pass.

Completed: 2026-06-25T15:37:34Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 grep -q '## Split Map' /tmp/tmp.MDM6v9uui5/cli-split-map.md
- [ ] #5 bun test src/test/cli-instructions.test.ts --timeout=30000
- [ ] #6 bun test src/test/cli-help-schemas.test.ts --timeout=30000
- [ ] #7 bun test src/test/cli-init.test.ts --timeout=30000
- [ ] #8 bun test src/test/cli-create.test.ts --timeout=30000
- [ ] #9 bun test src/test/cli-task-list.test.ts --timeout=30000
- [ ] #10 bun test src/test/cli-task-view-edit.test.ts --timeout=30000
- [ ] #11 bun test src/test/cli-task-lifecycle.test.ts --timeout=30000
- [ ] #12 bun test src/test/cli-docs-board.test.ts --timeout=30000
- [ ] #13 ! test -f src/test/cli.test.ts
- [ ] #14 bun test --timeout=30000
- [ ] #15 grep -q 'max-concurrency=4' /home/yale/work/Backlog.md/.github/workflows/ci.yml
- [ ] #16 bun test --isolate --timeout=30000 --max-concurrency=4
- [ ] #17 ! test -f /home/yale/work/Backlog.md/src/test/cli.test.ts
- [ ] #18 bun test --isolate --timeout=30000 --max-concurrency=4
- [ ] #19 bunx tsc --noEmit
- [ ] #20 bun run check .
- [ ] #21 grep -q 'max-concurrency=4' /home/yale/work/Backlog.md/.github/workflows/ci.yml
<!-- DOD:END -->
