---
id: BACK-600.5
title: Implement and test safety-critical invariants
status: 'Basic: Backlog'
assignee: []
created_date: '2026-06-26 08:39'
updated_date: '2026-06-26 09:15'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies: []
parent_task_id: BACK-600
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child 5 of epic BACK-600 (E0). Enforce and test ADR-010 invariants: merge serialization (single-merge lock), worktree isolation (per-task git worktree with guaranteed cleanup), and cap idempotency (check cap markers so a restarted driver never double-executes a phase). Depends on child 4.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-safety-merge.test.ts
- [ ] #2 bun test src/test/engine-safety-worktree.test.ts
- [ ] #3 bun test src/test/engine-safety-cap.test.ts
- [ ] #4 bunx tsc --noEmit
- [ ] #5 bun test
- [ ] #6 bun test src/test/engine-safety-cross-mechanism-lock.test.ts
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 跨机制并发（问题 1，安全必修）：soak 期旧 loop-backlog 与引擎不得同时 advance 真板上同一 task。二选一落地——(a) 共享同一把板级锁：引擎 merge 锁的锁文件路径与旧 loop 的 `.merge-lock` 对齐，使两机制互斥；或 (b) soak fallback 钉为冷备：引擎运行时旧 loop 不得起（单一活动驱动器）。须有测试覆盖该互斥。
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: Implement and test safety-critical invariants

## Background
`epicd` modifies its own repository, so the three ADR-010 safety invariants are non-negotiable (epic BACK-600, child 5): merge serialization (one merge at a time so concurrent advances cannot corrupt main), worktree isolation (each spawned task gets its own `git worktree add` with guaranteed cleanup on success or failure), and cap idempotency (before executing any phase, check the task's `cap` markers so a restarted driver never double-executes a completed phase). These harden the driver/worktree interface introduced in child 4 and must be covered by tests before the tracer bullet (child 6).

## Goals
1. Merge serialization: a lock ensures only one merge proceeds at a time; a concurrent-merge test shows no interleaving/corruption.
2. Worktree isolation: each spawned task runs in its own `git worktree`, and the worktree is cleaned up on both success and failure paths.
3. Cap idempotency: a phase guarded by a `cap` marker is skipped on a second invocation; a restart test proves no double-execution.
4. All three invariants have dedicated tests.

## Proposed Approach
Add `src/engine/safety.ts` implementing a merge lock (e.g. proper-lockfile, already a dependency) wrapping the advance/merge step, a worktree manager that creates and unconditionally cleans up worktrees (try/finally), and a cap guard that reads/writes `cap` markers on the `Task` (from child 2) to make phase execution idempotent. Wire these into the child-4 driver via its existing worktree/merge interface.

## Trade-offs and Risks
We are NOT building distributed locking or multi-host coordination. Risk: a leaked worktree on crash; mitigation: cleanup in `finally` plus a startup sweep, asserted by the failure-path test. Risk: cap markers written but phase not actually complete; mitigation: write the cap marker only after the guarded action succeeds, asserted by the restart test.

---

# Plan: Safety-critical invariants

Proposal: see above.

## Phase A: Merge serialization
### Tests (write first)
- Add `src/test/engine-safety-merge.test.ts`: two concurrent advance/merge attempts serialize via the lock; assert they do not interleave and the result is consistent.

### Implementation
- `src/engine/safety.ts`: merge lock wrapping the merge/advance step.

### DoD
- [ ] `bun test src/test/engine-safety-merge.test.ts`
- [ ] `grep -q 'lock' src/engine/safety.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: Worktree isolation + cleanup
### Tests (write first)
- Add `src/test/engine-safety-worktree.test.ts`: spawning creates an isolated worktree; on both success and thrown-error paths the worktree is removed (assert no leftover worktree directory).

### Implementation
- `src/engine/safety.ts`: worktree manager with try/finally cleanup and startup sweep.

### DoD
- [ ] `bun test src/test/engine-safety-worktree.test.ts`
- [ ] `grep -q 'worktree' src/engine/safety.ts`
- [ ] `bun run check .`

## Phase C: Cap idempotency
### Tests (write first)
- Add `src/test/engine-safety-cap.test.ts`: a phase guarded by a `cap` marker runs once; a simulated restart re-invokes it and asserts it is skipped (no double-execution).

### Implementation
- `src/engine/safety.ts`: cap guard reading/writing `cap` markers on the Task; marker written only after the guarded action succeeds.

### DoD
- [ ] `bun test src/test/engine-safety-cap.test.ts`
- [ ] `grep -q 'cap' src/engine/safety.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- All three invariants are mandatory per ADR-010 and must be tested before child 6 begins.
- Reuse existing locking dependency where possible; no distributed/multi-host locking.

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

反馈（来自 epic 边界复查，问题 1）：当前 plan 的 merge 锁是引擎进程内锁（proper-lockfile），明示不做分布式/多主协调。但 ADR-010 的安全目标是『别把库改坏』，soak 期旧 loop 与引擎同读写**同一块真板**——进程内锁管不到跨机制。这正是 baime ADR-010 INV-13（两 Monitor → 重复派发）在跨机制层面的复活。新增 AC/DoD 要求引擎锁与旧 loop `.merge-lock` 同名共享，或把 fallback 钉为冷备。参见 BACK-601『M1 边界纪律』第 1 条与 ADR-010 ENG-3。
<!-- SECTION:NOTES:END -->
