---
id: BACK-611
title: 'BACK-601.4 - status↔phase 人面投影 label(role,phase)'
status: 'Basic: Done'
assignee:
  - '@claude-opus'
created_date: '2026-07-04 10:44'
updated_date: '2026-07-04 15:55'
labels: []
dependencies:
  - BACK-613
ordinal: 22000
pipeline_id: execution
phase: done
parent_id: BACK-601
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun test src/test/status-label-projection.test.ts
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
引入唯一 label(role, phase) 投影函数（config 已声明的 "<Role>: <Phase>" 串）作为 status 显示计算的唯一处，将 web/CLI/board/status-callback 的显示读指向它，收敛当前隐式 status-vs-phase 分裂。turn/role 保持派生、绝不持久。Scope：新投影 helper（与 registry 同处，单函数）、显示消费点（web/CLI/board/status-callback）。E1 只产出投影；E4 消费（lane 渲染不在 E1）。依赖 601.2（A）；与 601.3（B）、601.5（D）并行。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: status↔phase 人面投影 label(role, phase)

Proposal: task Description (BACK-611)

Design summary (from ADR-012 / docs/uml/architecture-class-skeleton.puml & epicd-workitem-state.svg,
docs/proposals/2026-07-04-multi-lane-issue-list.md §2):
- The human-facing status string "<Role>: <Phase>" (e.g. "Basic: Ready", "Epic: Ready") is a
  DERIVED display projection, not an independent stored axis.
- `label(role, phase)` is the single place that computes it: role primitive → "Basic",
  role compound → "Epic"; the bare `phase` name (e.g. "ready") is title-cased into the Phase segment
  ("Ready"), joined as "<Role>: <Phase>". This reproduces the config-declared status vocabulary in
  backlog/config.yml (`statuses: [... "Basic: Ready", "Epic: Ready", ...]`).
- role derivation already ships in `roleOf(task)` (src/types/index.ts, BACK-609/601.2). `turn` and
  `role` stay derived, never persisted. This task ADDS the projection and repoints display reads;
  it does NOT change on-disk serialization of the `status`/`phase`/`role` fields, and it does NOT
  touch lane/column rendering (that is E4).
- Current state (investigated): there is NO projection today. Every consumer reads the persisted
  `task.status` string directly, so status-vs-phase agreement is implicit/unenforced. Enumerated
  display-status computation/format sites to repoint in Phase B:
    - src/cli.ts — task-list status grouping (canonical status bucketing, ~L2183-2200) and the
      "sorted by priority" status indicator (~L2170); plain task-view status line.
    - src/board.ts — buildKanbanColumns status bucketing (~L40).
    - src/ui/board.ts — TUI board column grouping / label (parent-status compare ~L84,
      formatColumnLabel usage ~L443/L588).
    - src/web/components/TaskList.tsx (~L786) and src/web/components/MilestoneTaskRow.tsx (~L60)
      and src/web/components/Statistics.tsx (StatusIcon, ~L162) — React display of `task.status`.
    - src/core/backlog.ts — onStatusChange callback firing (~L1121/L1877) + src/utils/status-callback.ts
      (OLD_STATUS/NEW_STATUS injection).

## Phase A: `label(role, phase)` projection helper (single source of truth)
### Tests (write first)
- File: `src/test/field-registry.test.ts` — add a new `describe("label(role, phase) projection")` block:
  - `it("projects primitive role + phase to 'Basic: <Phase>'")` — `label("primitive", "ready")` === "Basic: Ready".
  - `it("projects compound role + phase to 'Epic: <Phase>'")` — `label("compound", "ready")` === "Epic: Ready".
  - `it("title-cases the bare phase name")` — `label("primitive", "in-progress")` === "Basic: In Progress"
    and `label("primitive", "needs-human")` === "Basic: Needs Human".
  - `it("round-trips every config-declared status")` — for each phase in the pipeline vocabulary,
    `label(role, phase)` produces a string present in `backlog/config.yml` `statuses`
    (e.g. "Basic: Proposal", "Epic: Done"), proving the projection reproduces the declared labels.
  - `it("accepts a Task and derives role via roleOf")` — a convenience overload/wrapper
    `labelOf(task)` returns `label(roleOf(task), task.phase)` (leaf task ⇒ "Basic: …",
    task with subtasks ⇒ "Epic: …").
### Implementation
- Add ONE exported function `label(role: "primitive" | "compound", phase: string): string` in
  `src/core/field-registry.ts` (co-located with FIELD_DESCRIPTORS/roleOf per the task scope
  "与 registry 同处，单函数"), plus a thin `labelOf(task: Task): string` that wraps
  `label(roleOf(task), task.phase)`. role→segment map: primitive→"Basic", compound→"Epic".
  phase→segment: title-case the hyphen/space-split bare phase name.
- No new files, no new types persisted; reuse existing `roleOf` from src/types/index.ts.
### DoD
- [ ] `bun test src/test/field-registry.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: Repoint display consumers to `labelOf` (web / CLI / board / status-callback)
### Tests (write first)
- File: `src/test/field-registry.test.ts` (or a new `src/test/label-projection-consumers.test.ts`):
  - `it("cli/board display uses labelOf, not raw persisted status")` — build a Task whose derived
    `labelOf` differs from a stale persisted `status`, run the display formatter used by CLI task
    list / board bucketing, and assert the rendered status equals `labelOf(task)`.
- File: `src/test/status-callback.test.ts`:
  - `it("callback NEW_STATUS is the projected label")` — assert the status-change callback receives
    `labelOf(task)` for the new status (derived projection), not an ad-hoc string.
- File: `src/test/web-board-filters.test.tsx` (or the existing TaskList render test):
  - `it("web task row renders labelOf(task) as the status badge")` — render the row component and
    assert the badge text equals `labelOf(task)`.
- Absence check (single source of truth): a test asserting no second formatter remains, e.g.
  `it("no consumer re-derives '<Role>: <Phase>' inline")` backed by a grep-style guard in the suite,
  OR enforced in the Acceptance Gate below via `! grep`.
### Implementation
- src/cli.ts: replace direct `task.status` reads at the display sites (task-list bucketing ~L2183-2200,
  priority-sorted indicator ~L2170, plain view status line) with `labelOf(task)`.
- src/board.ts (~L40) and src/ui/board.ts (grouping/label sites) : compute the bucket/display status
  from `labelOf(task)` instead of the raw persisted `task.status`.
- src/web/components/TaskList.tsx (~L786), MilestoneTaskRow.tsx (~L60), Statistics.tsx StatusIcon (~L162):
  render `labelOf(task)`; if the web layer cannot import core directly, repoint at the server
  serialization boundary in src/server/index.ts so served tasks carry the projected display status.
- src/core/backlog.ts onStatusChange firing (~L1121/L1877): pass `labelOf(task)` as the new/old status
  into executeStatusCallback (src/utils/status-callback.ts unchanged — it only forwards the value).
### DoD
- [ ] `bun test src/test/field-registry.test.ts src/test/status-callback.test.ts src/test/web-board-filters.test.tsx`
- [ ] `bunx tsc --noEmit`

## Constraints
- role/turn stay DERIVED and are NEVER persisted: this task adds no stored field; `roleOf` remains the
  role source and no `turn` field is introduced or written.
- E1 only PRODUCES the projection; consumption by lane/column rendering is E4 and is OUT OF SCOPE —
  do not add or change lane grouping, per-pipeline columns, or DisplayHints here.
- Single source of truth: after this task there is exactly one place that builds the "<Role>: <Phase>"
  string (`label`/`labelOf` in field-registry.ts). No consumer may re-derive or re-concatenate the
  Role/Phase segments inline — every display read goes through the helper.
- No change to on-disk serialization/round-trip of `status`, `phase`, `role` (field-registry
  descriptors unchanged); this is a display-read repoint only.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `! grep -rnE '["\x60](Basic|Epic): ' src/cli.ts src/board.ts src/ui/board.ts src/web/components src/core/backlog.ts`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan authored + self-reviewed (authoring pass to fix status↔phase mismatch: phase=ready was set by E1 decompose before authoring; now genuinely plan-ready). Enumerated current display-status sites: src/cli.ts (task-list status bucketing ~L2183-2200, priority-sorted status indicator ~L2170, plain view status line); src/board.ts (buildKanbanColumns bucketing ~L40); src/ui/board.ts (TUI column grouping/formatColumnLabel ~L84/L443/L588); src/web/components/TaskList.tsx ~L786, MilestoneTaskRow.tsx ~L60, Statistics.tsx StatusIcon ~L162 (served via src/server/index.ts); src/core/backlog.ts onStatusChange firing ~L1121/L1877 + src/utils/status-callback.ts injection. Finding: no projection exists today — every consumer reads persisted task.status directly, so status-vs-phase agreement is implicit/unenforced; label(role,phase) converges it.

claimed: 2026-07-04T13:19:53Z

SOAK OUTCOME (BACK-605.8 manual-soak, 2026-07-04): implementation is COMPLETE + sound — committed 4bfbc85 in worktree /home/yale/work/epicd-BACK-611 (branch task/BACK-611); independently verified in-worktree: bunx tsc --noEmit PASS, bun test src/test/status-label-projection.test.ts 0 fail. engine complete routed it to needs-human NOT due to the code but due to systemic defect BACK-613 (runDoD executes prose definitionOfDoneItems as sh -c instead of structured executable dod). BLOCKED on BACK-613. Do NOT re-author/re-implement — worktree + commit are preserved; after BACK-613 lands, set BACK-611's structured dod to executable gates and re-run 'bun run cli engine complete BACK-611 --worktree /home/yale/work/epicd-BACK-611' to merge.

COMPLETED (manual finish, dogfooding BACK-613 --dod-gate). Set structured dod gates (bunx tsc --noEmit / bun test src/test/status-label-projection.test.ts / bun run check .) via new --dod-gate flag; merged current main into the stale task/BACK-611 worktree (resolved board-file conflict taking main's authoritative back-611.md); ran engine complete BACK-611 --worktree → gates re-verified in worktree, fast-forward merge under lock, phase→done. label(role,phase)/labelOf/displayStatus projection code now on main. Worktree+branch cleaned. NOTE: this was the manual merge-tail (engine complete), NOT a monitor-driven run — 611 was already implemented pre-BACK-613.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
