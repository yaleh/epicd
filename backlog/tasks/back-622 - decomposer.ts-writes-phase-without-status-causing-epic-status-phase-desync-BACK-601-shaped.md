---
id: BACK-622
title: >-
  decomposer.ts writes phase without status, causing epic status/phase desync
  (BACK-601 shaped)
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 00:36'
updated_date: '2026-07-05 02:13'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 34000
phase: done
dod:
  - text: bun test src/test/engine-decompose.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

`completeTask` (`src/engine/complete.ts`) writes `phase` and `status` together via `label(roleOf(task), phase)` on every transition (the BACK-616/617 fix) — this is the property that keeps a task's human-facing `status` field (`Basic: Done`, `Epic: Needs Human`, ...) in sync with its machine-facing `phase` field (`done`, `needs-human`, ...).

`src/harness/decomposer.ts` — the engine's real compound-task decompose handler (`makeDecomposer`, BACK-605.5) — never got the same treatment. All three of its `core.updateTask` calls write `phase` only:

- Line 110 (crash-recovery re-entry, stabilising phase to `awaiting-children`)
- Line 121 (no children proposed / spawn failed → `needs-human`)
- Line 143 (children created → `awaiting-children`)

Found empirically on BACK-601 (2026-07-05, via the live `epicd-run` daemon's `epic-ready` channel firing unexpectedly): its board file shows `status: 'Epic: Ready'` while `phase: awaiting-children` — decomposed on 2026-07-04 (commit `1c026d2`) but the status field was never advanced. The daemon's legacy `epic-ready` predicate (`isEpicReady` in `plugin/scripts/scan-loop.cjs`, which reads the raw `status` string, not `phase` — a separate, baime-inherited scan path) fired a false-positive `epic-ready:BACK-601` event even though BACK-601 is genuinely `awaiting-children` and not evaluable yet (its children aren't all terminal). No harm resulted only because the `epic-ready` channel has no wired handler yet in `epicd-run` today — but the underlying desync is real and would surface as an incorrect human-facing status the moment any UI/board view or a future `epic-ready` handler trusts `status` at face value.

Line 126's comment ("Omit status → project default ... status is cosmetic here") reflects the same reasoning error `completeTask` had before BACK-616/617: `status` is not cosmetic, it's the field humans and legacy tooling actually read.

## Goals

1. Every `decomposer.ts` phase transition (`awaiting-children` on success, `awaiting-children` on crash-recovery stabilisation, `needs-human` on failure) writes a `status` that matches, using the same `label(roleOf(task), phase)` projection `completeTask` uses — one status↔phase sync mechanism, not two.
2. Newly created children get a `status` consistent with their `phase: "ready"` (currently omitted per line 126-127's comment) — same reasoning, same fix.
3. A regression test proves BACK-601-shaped desync (`status` stuck at a stale value while `phase` advances) cannot recur: after decompose, `status` is derived from `phase`, never left behind.

## Proposed Approach

In each of the three `core.updateTask` call sites in `decomposer.ts`, add `status: label(roleOf(task), phase)` alongside the `phase` write, exactly mirroring `completeTask`'s pattern in `src/engine/complete.ts`. For the child-creation call (line 128-138), add `status: label("primitive", "ready")` (children are always primitive at creation — decompose only ever creates leaf tasks) instead of omitting it.

## Trade-offs and Risks

- This makes `decomposer.ts` depend on `label`/`roleOf` from `src/core/field-registry.ts` and `src/types/index.ts` — the same dependencies `completeTask` already has; no new coupling introduced, just parity.
- Not doing: a generic "every `core.updateTask` call in the engine must include status" lint rule — scoped to the two known call sites (`complete.ts`, `decomposer.ts`) that perform phase transitions; other call sites (e.g. read-modify-write of unrelated fields) don't need this.
- One-time manual fix needed for BACK-601 itself (already desynced) — out of scope for this task's automated tests, but should be corrected by hand alongside landing the fix (same remediation pattern used for BACK-616's own stale status earlier this session).

## Implementation Plan

# Plan: decomposer.ts writes status alongside phase on every transition (BACK-622)

## Phase A: sync status↔phase in decomposer.ts + regression test

### Tests (write first)
- `src/test/engine-decompose.test.ts` (existing suite for `makeDecomposer`, or a new file if none exists — search first): 
  - "children-created transition sets both phase and status" — after a successful decompose, the epic's `phase === 'awaiting-children'` AND `status === label('compound', 'awaiting-children')`.
  - "no-children/failure transition sets both phase and status" — spawn primitive returns no children → `phase === 'needs-human'` AND `status === label('compound', 'needs-human')`.
  - "crash-recovery re-entry stabilisation sets both phase and status" — existing children found, current phase differs from `awaiting-children` → both fields updated together.
  - "created children get a status consistent with phase:ready" — each child's `status === label('primitive', 'ready')`, not omitted.

### Implementation
- `src/harness/decomposer.ts`: import `label` from `../core/field-registry.js` and `roleOf` from `../types/index.js` (same imports `src/engine/complete.ts` already uses). At each of the three `updateTask` call sites, add `status: label(roleOf(currentOrTask), newPhase)`. At the child-creation call, add `status: label("primitive", "ready")` to the `createTaskFromInput` input object.

### DoD
- [ ] `bun test src/test/engine-decompose.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints

- No new status/phase sync mechanism — reuse `label()`/`roleOf()` exactly as `completeTask` does; do not introduce a second projection function.
- `decomposer.ts` stays a harness module (may import `Core`, may NOT be imported by `src/engine` core) — unchanged.
- Do not change decompose's existing idempotency/crash-recovery logic — only add the paired `status` write to already-existing `updateTask` calls.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-05T02:04:06Z
<!-- SECTION:NOTES:END -->
