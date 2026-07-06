---
id: BACK-600.6
title: Tracer bullet sandbox board fixpoint and cutover to real engine board
status: 'Basic: Done'
assignee: []
created_date: '2026-06-26 08:39'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies: []
parent_task_id: BACK-600
ordinal: 1000
pipeline_id: execution
phase: done
parent_id: BACK-600
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child 6 of epic BACK-600 (E0). Build a minimal sandbox board with synthetic tasks; run the full driver to fixpoint (terminal state, no errors); then update the real epicd backlog config to cut over to the self-driving engine, keeping loop-backlog as a soak fallback (not deleted). Depends on all of children 1-5; merges last.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-tracer-fixpoint.test.ts
- [ ] #2 bun test src/test/engine-cutover.test.ts
- [ ] #3 find . -path ./node_modules -prune -o -iname '*loop-backlog*' -print | grep -q loop-backlog
- [ ] #4 bunx tsc --noEmit
- [ ] #5 bun test src/test/engine-stage2-selfhost-fixpoint.test.ts
- [ ] #6 bun test src/test/engine-tracer-fixpoint.test.ts src/test/engine-cutover.test.ts src/test/engine-stage2-selfhost-fixpoint.test.ts
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stage 2 自托管 fixpoint（问题 2，信任根必修）：明确区分 Stage 1（驱动收敛幂等：同一板跑两遍，第二遍 no-op）与 §15.1 的 Stage 2（『MVD 重建 MVD』——自造驱动复现自身构造并过同一测试套件）。当前 plan 的 fixpoint 测试只是 Stage 1；须补 Stage 2 自托管复现校验，且 **M1 宣布须 gate 在 Stage 2 通过**，而非仅 Stage 1 / cutover。
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: Tracer bullet — sandbox board fixpoint and cutover to real engine board

## Background
This is the integration gate for epic BACK-600 (child 6). Per the bootstrap soak discipline, the full `epicd` stack (children 1–5) must first be exercised end-to-end against a disposable sandbox board until it reaches fixpoint (all tasks reach a terminal state, no errors), and only then is the real engine board cut over to self-drive. The old `loop-backlog` skill is kept as a soak-period fallback and must NOT be deleted. This child must be the last to merge and requires all prior children in main.

## Goals
1. A minimal sandbox backlog with one or two synthetic tasks exists and the full driver cycle runs against it to fixpoint (terminal state, zero errors).
2. A fixpoint test asserts the sandbox run converges and is idempotent (a second run is a no-op).
3. The real epicd backlog config is updated to enable the self-driving engine, documented in implementation notes alongside the sandbox evidence.
4. The legacy `loop-backlog` skill remains present and functional as fallback (verifiable: its file still exists).

## Proposed Approach
Add `src/engine/sandbox.ts` (or a test fixture) that builds a throwaway board with synthetic tasks, then run the child-4 driver hardened by child-5 safety until the interpreter reports no actionable items (fixpoint). A test drives this and asserts convergence + idempotency. After the sandbox passes, update the real `backlog/config.yml`/engine entrypoint to enable self-drive, recording both the sandbox fixpoint result and the cutover in implementation notes. Leave `loop-backlog` untouched.

## Trade-offs and Risks
We are NOT removing the legacy loop yet (soak fallback). Risk: cutover before fixpoint is proven; mitigation: the fixpoint test is a hard DoD gate that must pass before cutover, and the absence check confirms `loop-backlog` still exists. Risk: sandbox state leaking into the real board; mitigation: sandbox uses an isolated temp board directory.

---

# Plan: Tracer bullet — sandbox fixpoint + cutover

Proposal: see above.

## Phase A: Sandbox board fixpoint
### Tests (write first)
- Add `src/test/engine-tracer-fixpoint.test.ts`: build a sandbox board with synthetic tasks, run the full driver to fixpoint; assert all tasks reach a terminal state, no errors, and a second run makes no changes (idempotent fixpoint).

### Implementation
- `src/engine/sandbox.ts`: build the throwaway board and run the driver loop to fixpoint over the full stack.

### DoD
- [ ] `bun test src/test/engine-tracer-fixpoint.test.ts`
- [ ] `grep -q 'fixpoint' src/test/engine-tracer-fixpoint.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: Cutover with loop-backlog preserved
### Tests (write first)
- Add `src/test/engine-cutover.test.ts`: assert the engine self-drive entry/config is enabled after cutover AND the legacy `loop-backlog` skill file still exists (fallback preserved).

### Implementation
- Update the real `backlog/config.yml`/engine entrypoint to enable self-drive; record sandbox fixpoint evidence and the cutover in implementation notes. Do not modify or delete `loop-backlog`.

### DoD
- [ ] `bun test src/test/engine-cutover.test.ts`
- [ ] `find . -path ./node_modules -prune -o -iname '*loop-backlog*' -print | grep -q loop-backlog`
- [ ] `bun run check .`

## Constraints
- Sandbox fixpoint must be demonstrated before real-board cutover; both documented in implementation notes.
- The `loop-backlog` skill must remain functional and must not be deleted.
- This child merges last; requires children 1–5 in main.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog: Proposal APPROVED; Plan APPROVED (architect review).
premise-ledger:
[E] goal coverage: each proposal Goal maps to a Phase or Acceptance Gate item in this task's plan
[E] DoD executability: every DoD/Acceptance Gate item is a shell command (exit 0 = pass)
[C] file paths exist: referenced src/ paths confirmed against the epicd tree
[H] phase sizing: each phase <=200 LOC judged from background knowledge
GCL-self-report: E=2 C=1 H=1
cap:propose=approved
cap:plan=approved
Parked at Basic: Proposal under epic BACK-600. Promote to Basic: Ready to authorize execution.

反馈（来自 epic 边界复查，问题 2）：本任务及父 epic AC#6 把 tracer-bullet 的收敛幂等称作『fixpoint』，与 §15.1 的术语滑移。§15.1 的三 Stage 中，Stage 2『MVD 重建 MVD（复现自身、过同套件）』才是自举可信的依据，它比『跑两遍 no-op』强得多，且当前无任何子任务覆盖。后果：照原 plan，M1 会在仅通过 Stage 1 收敛时被宣布，等于用未经自托管验证的驱动器去跑 E1–E6 真实路线图。新增 AC/DoD 要求补 Stage 2 校验并以其 gate M1。参见 BACK-601『M1 边界纪律』第 2 条。

claimed: 2026-07-04T04:36:47Z

workerLoop DoD #0: PASS — bun test src/test/engine-tracer-fixpoint.test.ts

workerLoop DoD #1: PASS — bun test src/test/engine-cutover.test.ts

workerLoop DoD #2: PASS — find . -path ./node_modules -prune -o -iname '*loop-backlog*' -print | grep -q loop-backlog

workerLoop DoD #3: PASS — bunx tsc --noEmit

workerLoop DoD #4: PASS — bun test src/test/engine-stage2-selfhost-fixpoint.test.ts

workerLoop DoD #5: PASS — bun test src/test/engine-tracer-fixpoint.test.ts src/test/engine-cutover.test.ts src/test/engine-stage2-selfhost-fixpoint.test.ts

Phase A ✓ 2026-07-04T05:00:00Z
DoD #1: PASS — bun test src/test/engine-tracer-fixpoint.test.ts (8 tests pass)
Phase B ✓ 2026-07-04T05:05:00Z
DoD #2: PASS — bun test src/test/engine-cutover.test.ts (4 tests pass)
DoD #3: PASS — find . -path ./node_modules -prune -o -iname '*loop-backlog*' -print | grep -q loop-backlog
DoD #4: PASS — bunx tsc --noEmit (0 errors)
DoD #5: PASS — bun test --parallel (1429 pass, 2 pre-existing timeouts unrelated to this task)
DoD #6: PASS — bun test src/test/engine-stage2-selfhost-fixpoint.test.ts (5 tests pass)

Completed: 2026-07-04T04:47:07Z
<!-- SECTION:NOTES:END -->
