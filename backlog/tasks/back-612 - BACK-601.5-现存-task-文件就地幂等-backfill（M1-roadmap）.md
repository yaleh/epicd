---
id: BACK-612
title: BACK-601.5 - 现存 task 文件就地幂等 backfill（M1 roadmap）
status: 'Basic: Done'
assignee: []
created_date: '2026-07-04 10:44'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
ordinal: 23000
pipeline_id: execution
phase: done
parent_id: BACK-601
dod:
  - text: bun test src/test/engine-fields-backfill.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
对每个现存 backlog/tasks/*.md，由 registry default/derive 填空结构字段：pipeline_id/phase/parent_id/role（role 由树位置派生；phase 由现 status 经 registry parse(status)→裸 phase 映射）。dod/cap 不 backfill（声明式内容非结构默认）。就地、幂等、并行安全；不移动/改名文件；不得破坏旧 loop 读同批文件。CLI 子命令或一次性迁移。backfill 不得在旧 loop 与引擎同时持板时跑（guard#1 前置）。Scope：新 backfill 例程（用 601.1 的 list/upsert + 601.2 的 registry 默认）、迁移入口、幂等测试。依赖 601.2（A）+ 601.1（list/upsert）；不依赖 601.4（C）。最后跑。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: BACK-612 — in-place idempotent backfill of engine structural fields (pipeline_id/phase/parent_id/role)

## Phase A: Backfill routine + registry-driven field derivation

### Tests (write first)
Create `src/test/engine-fields-backfill.test.ts`:
- `computeBackfillFields`:
  - "derives bare phase from a role-prefixed status" — task with `status: "Basic: In Progress"`, no `phase` → `{ phase: "in-progress" }` (inverse of `titleCasePhase` in `src/core/field-registry.ts`: strip leading `"<Word>: "`, lowercase, spaces→hyphens).
  - "derives bare phase for legacy unprefixed status" — `status: "To Do"`, no `phase` → `{ phase: "to-do" }`.
  - "defaults pipeline_id to the execution pipeline id when missing" — task with no `pipeline_id` → `{ pipeline_id: "execution" }` (== `executionPipeline.id` from `src/engine/pipeline.ts`).
  - "derives parent_id from legacy parentTaskId when parent_id is blank" — task with `parentTaskId: "back-600"`, no `parent_id` → `{ parent_id: "back-600" }`.
  - "derives role from tree position (compound when task has children)" — build `childIdsByParent` from a task list's `parentTaskId` graph; task with children → `{ role: "compound" }` via `roleOf(task, childIds)` from `src/types/index.ts`.
  - "derives role: primitive for a leaf task with no children" → `{ role: "primitive" }`.
  - "returns no changes (empty object) when all four fields are already present".
  - "never touches dod or cap" — patch never contains `dod`/`cap` keys.
- `runBackfill(core)` (real temp `FileSystem` fixture, `createUniqueTestDir`/`initializeTestProject` pattern used in `src/test/engine-driver-board.test.ts`):
  - "backfills blank structural fields across all task files and reports which ids changed".
  - "does not move or rename any files" — same file paths before/after.
  - "second run is a true no-op" — run twice; second run's `updated` list is empty and no task file mtime changes.
  - "is safe to run concurrently with itself" — two `runBackfill` calls through the lock-guarded CLI entry point at once; end state equals a single serial run (mirrors concurrency test shape in `src/test/engine-safety-merge.test.ts`).

### Implementation
- `src/core/engine-fields-backfill.ts` (new, mirrors `src/core/prefix-migration.ts`'s shape):
  - `deriveBarePhase(status: string): string | undefined` — strip a leading `"<Word>: "` role-prefix (case-insensitive), kebab-case the remainder. Pure inverse of `titleCasePhase`; no second phase-name table.
  - `computeBackfillFields(task: Task, childIdsByParent: Map<string, string[]>): Partial<Pick<Task, "pipeline_id" | "phase" | "parent_id" | "role">>` — returns only currently-blank derivable keys: `pipeline_id` defaults to `executionPipeline.id`; `phase` via `deriveBarePhase(task.status)`; `parent_id` from `task.parentTaskId`; `role` via `roleOf(task, childIdsByParent.get(task.id) ?? task.subtasks)`. Excludes `dod`/`cap`.
  - `runBackfill(core: Core): Promise<{ updated: string[] }>` — `core.queryTasks({})` (601.1 list primitive); build `childIdsByParent` once from every task's `parentTaskId`; compute patch per task; skip entirely (no write) when patch is empty (this is what makes the second run byte-identical — avoids `core.updateTask`'s automatic `updatedDate` bump on a no-op); call `core.updateTasksBulk(changed, "BACK-612 backfill: engine structural fields", false)` (601.1 bulk upsert primitive, same one used elsewhere in `src/core/backlog.ts`).
- `src/cli.ts`: add `engine backfill` subcommand next to `engine scan`/`engine complete` (~line 4520 block). Action wraps `runBackfill(core)` in `withMergeLock(core.filesystem.backlogDir, () => runBackfill(core), realMergeLockFs)` (same lock primitive `engine complete` uses — satisfies guard#1, keeping the old loop-backlog daemon and the engine mutually exclusive on the same `.merge-lock` sentinel). Print `backfilled N tasks: <ids>` or `no tasks needed backfill`.
- No changes to `src/core/field-registry.ts` or `src/types/index.ts` — this phase only adds a derivation routine on top of the already-shipped registry/types (601.2).

### DoD
- [ ] `bun test src/test/engine-fields-backfill.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- In-place only: never rename/move a `backlog/tasks/*.md` file; only frontmatter fields change.
- Must not write a task file when its computed patch is empty — the mechanism that makes a second run byte-for-byte idempotent, not merely "field values happen to match."
- `dod` and `cap` are never populated by this routine, even when empty/absent.
- The `engine backfill` CLI action must acquire the same `.merge-lock` sentinel path as `engine complete` (guard#1) before touching any task file — no second lock mechanism, no bypassing `withMergeLock`.
- Reuse `Core.queryTasks` + `Core.updateTasksBulk` (601.1) as-is; do not introduce a new bulk-write primitive.
- Phase derivation is a pure string transform (prefix-strip + kebab-case), not a lookup table — keeps parity with `label()`/`titleCasePhase()` in `src/core/field-registry.ts` so there is exactly one status↔phase mapping convention.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-04T23:48:20Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
