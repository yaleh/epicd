---
id: BACK-600.3
title: Define execution pipeline as data and build minimal interpreter
status: 'Basic: Done'
assignee:
  - claude
created_date: '2026-06-26 08:39'
updated_date: '2026-06-26 11:55'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies: []
modified_files:
  - src/engine/pipeline.ts
  - src/engine/interpreter.ts
  - src/test/engine-interpreter.test.ts
parent_task_id: BACK-600
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child 3 of epic BACK-600 (E0). Author the single execution pipeline (backlog->ready->in-progress->done + needs-human) as typed data; build interpreter that emits item-ready:<pipeline_id>:<state>:<task_id> and dispatches via a handler registry keyed by (pipeline_id,state) with no hardcoded Basic/Epic logic. Depends on child 2.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: Define execution pipeline as data and build minimal interpreter

## Background
`epicd` (epic BACK-600, child 3) must dispatch work generically rather than via hardcoded Basic/Epic label logic. Per ADR-011 D-2 the execution lifecycle (`backlog→ready→in-progress→done` plus a `needs-human` gate) is defined as data, and a minimal interpreter identifies actionable `(pipeline_id, state)` items and emits a single parameterized event `item-ready: <pipeline_id>:<state>:<task_id>`. A handler registry lets new pipelines be added without touching interpreter core. This depends on child 2's extended `Task` type.

## Goals
1. A single execution pipeline is declared as a typed data structure (states + transitions + the `needs-human` gate).
2. The interpreter scans tasks and, for each actionable item, produces the event string `item-ready: <pipeline_id>:<state>:<task_id>`.
3. Dispatch goes through a handler registry keyed by `(pipeline_id, state)`; interpreter core contains no `Basic`/`Epic`/`kind:` literals.
4. Adding a new pipeline/handler requires only registration, proven by a test that registers a second handler.

## Proposed Approach
Create `src/engine/pipeline.ts` (the data definition + types) and `src/engine/interpreter.ts` (scan→detect→emit→dispatch). The interpreter reads `pipeline_id`/`state` from the `Task` type added in child 2. The registry is a `Map<string, Handler>` keyed by `pipeline_id:state`. The interpreter is pure with respect to side effects — it returns events and invokes registered handlers; git/worktree wiring belongs to child 4.

## Trade-offs and Risks
We are NOT building the exploration pipeline or full GateEvent query (deferred). Risk: over-generalizing the registry; mitigation: keep it a flat keyed map with one execution pipeline and assert genericity via the "register a second handler" test rather than speculative abstraction.

---

# Plan: Execution pipeline as data + minimal interpreter

Proposal: see above.

## Phase A: Pipeline data + event emission
### Tests (write first)
- Add `src/test/engine-interpreter.test.ts`: given tasks at various `(pipeline_id, state)`, assert the interpreter emits exactly the expected `item-ready: <pipeline_id>:<state>:<task_id>` strings and that a `needs-human` state emits no actionable event.

### Implementation
- `src/engine/pipeline.ts`: typed pipeline definition (states, transitions, gate).
- `src/engine/interpreter.ts`: scan + event emission.

### DoD
- [ ] `bun test src/test/engine-interpreter.test.ts`
- [ ] `! grep -qiE '"?(Basic|Epic):' src/engine/interpreter.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: Handler registry dispatch
### Tests (write first)
- Extend `src/test/engine-interpreter.test.ts`: register a handler for the execution pipeline and a second synthetic pipeline; assert each event is routed to its registered handler by `(pipeline_id, state)` and that an unregistered key is a no-op/error as specified.

### Implementation
- `src/engine/interpreter.ts`: add the `Map`-backed handler registry and `dispatch(event)`.

### DoD
- [ ] `bun test src/test/engine-interpreter.test.ts`
- [ ] `grep -q 'register' src/engine/interpreter.ts`
- [ ] `bun run check .`

## Constraints
- No hardcoded `Basic`/`Epic`/`kind:` logic in interpreter core — belongs in handlers.
- One execution pipeline only; exploration pipeline deferred.

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

claimed: 2026-06-26T11:42:36Z

Phase A+B ✓ 2026-06-26T11:45:00Z - pipeline.ts and interpreter.ts with scan/emit + handler registry dispatch, 19 tests pass. Pre-existing flaky failures in cli-help-schemas/cli-doc-search under parallel I/O are unrelated (pass in isolation). All DoD checks green.

Completed: 2026-06-26T11:55:31Z
workerLoop pre-merge DoD: all 5 passed (19/19 tests, no Basic/Epic literals, register found, tsc clean, 1372/1372 pass)
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-interpreter.test.ts
- [ ] #2 ! grep -qiE '"?(Basic|Epic):' src/engine/interpreter.ts
- [ ] #3 grep -q 'register' src/engine/interpreter.ts
- [ ] #4 bunx tsc --noEmit
- [ ] #5 bun test
<!-- DOD:END -->
