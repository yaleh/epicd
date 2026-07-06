---
id: BACK-617
title: engine phase writes must sync legacy status field for external monitor compat
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-04 16:48'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 29000
pipeline_id: execution
phase: done
dod:
  - text: >-
      bun test src/test/engine-merge-wire.test.ts
      src/test/engine-driver-board.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Root cause (found while checking item-4 monitor-driven readiness after BACK-616):
completeTask() and driver.ts write task.phase via store.updateTask({...task, phase: X})
but never update task.status. displayStatus()/label() correctly derive the human-facing
status from phase for in-repo readers, but the actual external monitor daemon
(baime plugin/scripts/scan-loop.js) reads the RAW YAML `status:` field directly via
regex (readTaskMeta) — it has no knowledge of `phase` at all. This is the real,
load-bearing contract the "basic-ready"/"stale-in-progress" channels depend on.

Confirmed regression: BACK-616 went through a real engine-complete merge and now has
phase: done but status: 'Basic: In Progress' forever (stale) — the external monitor
will never see it as done, and may eventually misfire stale-in-progress. Likewise
BACK-612 (authored via task edit --plan/--dod-gate without --status) has phase: ready
but status: 'Basic: Proposal' — invisible to scan-loop.js's basic-ready channel today
(bun src/cli.ts engine scan --once sees it; node scan-loop.js --scan-once does not).

Fix: every call site that writes task.phase via store.updateTask must also compute and
write the matching status string via label(roleOf(task), phase) (src/core/field-registry.ts),
so the persisted status field never drifts from phase. Config's declared `statuses` list
already matches label()'s default title-cased fallback 1:1 for every execution-pipeline
phase (ready/needs-human/done/etc) — confirmed by inspection of backlog/config.yml.

Scope: src/engine/complete.ts (completeTask's 3 store.updateTask call sites) and
src/engine/driver.ts (1 call site). Not in scope: the legacy complete() function
(src/engine/complete.ts:30-60) which is unused by the current worker->engine path.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: BACK-617 — sync legacy status field on every engine phase write

## Phase A: sync status alongside phase in completeTask + driver

### Tests (write first)
Extend `src/test/engine-merge-wire.test.ts` (in-memory TaskStore fixture already used there):
- "completeTask writes status: 'Basic: Done' alongside phase: 'done' on adjudicated success"
- "completeTask writes status: 'Basic: Needs Human' alongside phase: 'needs-human' on dodResults failure"
- "completeTask writes status: 'Basic: Needs Human' alongside phase: 'needs-human' on merge conflict"
- "completeTask writes status: 'Epic: Done' (not 'Basic: Done') for a compound task (has children)"

Extend `src/test/engine-driver-board.test.ts` (or wherever driver.ts's needs-human write is already covered):
- "driver's needs-human phase write also sets status: 'Basic: Needs Human'"

### Implementation
- `src/engine/complete.ts`: import `label` and `roleOf` (from `../core/field-registry.js` and
  `../types/index.js`). At each of the 3 `store.updateTask({ ...task, phase: X })` call sites
  inside `completeTask`, change to
  `store.updateTask({ ...task, phase: X, status: label(roleOf(task), X) })`.
  Do NOT touch the unused legacy `complete()` function (lines 30-60) — out of scope.
- `src/engine/driver.ts:70`: same change — `store.updateTask({ ...task, phase: "needs-human", status: label(roleOf(task), "needs-human") })`.
- No signature changes to `CompleteTaskOptions`/`TaskStore` — `label`/`roleOf` take only the
  task (and an optional statuses list, omitted — config's declared statuses already match
  label's default title-cased fallback 1:1, confirmed by inspection of backlog/config.yml).

### DoD
- [ ] `bun test src/test/engine-merge-wire.test.ts src/test/engine-driver-board.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- Only sync `status` at the same call sites that already write `phase` — no new phase
  transitions, no new call sites, no change to adjudication/merge/commit logic.
- Reuse `label()`/`roleOf()` as-is; do not add a second status-computation helper.
- Existing persisted tasks with already-stale status (e.g. BACK-616, BACK-612) are NOT
  backfilled by this task — that is a separate concern (a repo-wide backfill would be
  BACK-612's own scope, not this one). This task only stops the drift going forward.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
