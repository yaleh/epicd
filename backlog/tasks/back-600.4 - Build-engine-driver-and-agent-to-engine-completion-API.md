---
id: BACK-600.4
title: Build engine driver and agent-to-engine completion API
status: 'Basic: Backlog'
assignee: []
created_date: '2026-06-26 08:39'
updated_date: '2026-07-04 03:18'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies:
  - BACK-600.3
  - BACK-600.7
parent_task_id: BACK-600
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child 4 of epic BACK-600 (E0). Implement detect->spawn->merge->advance driver loop wiring the interpreter to git worktree ops; replace the .agent-done-* sentinel with a typed engine.complete(taskId,result) API that signals completion and triggers state advancement via the pipeline. Depends on child 3.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: Build engine driver and agent-to-engine completion API

## Background
`epicd` (epic BACK-600, child 4) needs a driver that closes the `detect→spawn→merge→advance` loop on top of the interpreter from child 3, and a typed completion handshake that replaces the legacy `.agent-done-*` file sentinel. The driver wires interpreter events to real git worktree operations; the spawned worker signals completion through `engine.complete(taskId, result)` which advances the task's `state` via the pipeline. This depends on child 3's interpreter and event types being stable.

## Goals
1. A driver implements `detect` (run interpreter), `spawn` (start a worker per actionable item), `merge` (integrate result), and `advance` (move `state` along the pipeline).
2. A typed `engine.complete(taskId, result)` API exists and is the completion mechanism — no `.agent-done-*` sentinel files are read or written.
3. A driver-loop test drives a synthetic task from `ready` through `done` using the completion API.
4. The completion call triggers state advancement through the pipeline definition, not hardcoded transitions.

## Proposed Approach
Create `src/engine/driver.ts` (the loop) and `src/engine/complete.ts` (the completion API). The driver consumes interpreter events and invokes handlers that perform spawn/merge/advance. `engine.complete` records a result and asks the pipeline for the next state, then persists it via the Core task store. Worktree/merge primitives are stubbed behind a small interface here and hardened in child 5.

## Trade-offs and Risks
We are NOT implementing autonomy or UI. Risk: leaving any `.agent-done` reference would mean the sentinel is extended, not replaced; mitigation: an explicit absence DoD check `! grep -rq 'agent-done' src/engine`. Real merge serialization and worktree isolation are added in child 5; this child uses a minimal interface so child 5 can drop in the hardened implementation.

---

# Plan: Engine driver + agent-to-engine completion API

Proposal: see above.

## Phase A: Completion API replaces sentinel
### Tests (write first)
- Add `src/test/engine-complete.test.ts`: calling `engine.complete(taskId, result)` advances the task `state` to the pipeline's next state and records the result; assert no sentinel file is created.

### Implementation
- `src/engine/complete.ts`: typed `complete(taskId, result)` that reads the pipeline and persists the advanced `state` via Core.

### DoD
- [ ] `bun test src/test/engine-complete.test.ts`
- [ ] `! grep -rq 'agent-done' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase B: Driver detect→spawn→merge→advance loop
### Tests (write first)
- Add `src/test/engine-driver.test.ts`: a synthetic `ready` task is detected, spawned (stub), completed via the API, merged, and advanced to `done`; assert the loop reaches a terminal state with no errors.

### Implementation
- `src/engine/driver.ts`: the loop wiring interpreter events to spawn/merge/advance over a small worktree interface.

### DoD
- [ ] `bun test src/test/engine-driver.test.ts`
- [ ] `grep -q 'complete' src/engine/driver.ts`
- [ ] `bun run check .`

## Constraints
- `engine.complete` is the only completion handshake; `.agent-done-*` is replaced, not extended.
- State advancement is driven by the pipeline data, not hardcoded transitions.

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

2026-07-04 对齐四轴终版（执行前须与 E1/BACK-601 协调）：final 决定删除惰性 state 字段、以裸 phase 为唯一持久进度、role/turn 派生（turn=actor(phase) 归 pipeline-data）。本 task 的“advance state”应理解为“advance phase”；不要在会被 E1 删除的 state 字段上建驱动器。engine.complete 推进的是 phase（查 pipeline-data 的下一 state），仍不硬编码转移；ready/in-progress 合并（靠 claim 分 queued/active），needs-human 是 actor=human 的 phase。若 E1 schema 收敛未先行，本 task 所用字段须由 E1 迁移。

2026-07-04：新增前置依赖 BACK-600.7（引擎四轴对齐：state→phase、actionable→actor、ready/in-progress 合并）。600.7 完成后，本 task 直接在 phase/actor 上建 driver（engine.complete 推进 phase，scan 谓词 actor==machine ∧ 无有效 claim），不再涉及 state 字段。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-complete.test.ts
- [ ] #2 ! grep -rq 'agent-done' src/engine
- [ ] #3 bun test src/test/engine-driver.test.ts
- [ ] #4 bunx tsc --noEmit
- [ ] #5 bun test
<!-- DOD:END -->
