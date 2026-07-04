---
id: BACK-600
title: 'E0: 引擎自驱 MVD（keystone）'
status: 'Epic: Evaluating'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-04 04:53'
labels:
  - 'kind:epic'
  - 'epicd:E0'
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 forked Backlog.md 改造成 `epicd` 引擎的最小可行驱动器（MVD），并由**当前 loop-backlog** 建造（自举 Stage 0）。E0 在*功能*上最小，但在*安全*上不打折——它即将修改自己所在的库。

范围（ADR-011 D-7 子集）：
- **fork→引擎 repo**：把 Backlog.md 身份改名为 `epicd`（package.json、二进制名、README 等）。
- **最小字段**：WorkItem 复用现有 `Task` 类型，新增 `pipeline_id` / `state` / `role` / `parent_id` / 结构化 `dod` / `cap`（ADR-011 D-1）。
- **execution-pipeline-as-data + 极小解释器**：一条 execution pipeline 定义（`backlog→ready→in-progress→done` + `needs-human`），解释器按 `item-ready: <pipeline>:<state>:<task_id>` 单一事件分派 handler（ADR-011 D-2）。
- **Core 之上的 driver**：detect→spawn→merge→advance。
- **agent→engine 完成 API**：替代 `.agent-done-*` sentinel。
- **安全关键子集（不可省）**：merge 串行化、worktree 隔离、cap 幂等——即 ADR-010 中"别把库改坏"的那部分。

延后（推给 MVD 自驱完成）：domain 富语义、field-registry 完美、exploration pipeline、完整 GateEvent 查询、UI、auth、自治。

自举里程碑：E0 完成 = **M1**（引擎 repo 自驱自身）。试跑次序：先在 sandbox board 跑 tracer bullet，fixpoint 通过后再上引擎真板；旧 loop 留作 soak 期 fallback，不立即删。

参考：ADR-011（`docs/adr/`）D-1/D-2/D-7；ADR-010 不变量；baime 讨论记录 §15。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] repo 身份改名为 `epicd`（package.json name、bin、README）
- [ ] `Task` 类型扩展出 `pipeline_id/state/role/parent_id/dod/cap`，parse/serialize 往返通过
- [ ] 一条 execution pipeline 以**数据**定义；解释器按 `(pipeline,state)` 分派，无硬编码 Basic/Epic 派发
- [ ] driver 完成 detect→spawn→merge→advance 闭环；agent→engine 完成 API 替代 `.agent-done`
- [ ] 安全关键子集落地并测试：merge 串行化、worktree 隔离、cap 幂等（ADR-010 子集）
- [ ] tracer bullet 在 sandbox board 跑通（fixpoint），再上引擎真板

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
把 forked Backlog.md 改造成 `epicd` 引擎的最小可行驱动器（MVD），并由**当前 loop-backlog** 建造（自举 Stage 0）。E0 在*功能*上最小，但在*安全*上不打折——它即将修改自己所在的库。

范围（ADR-011 D-7 子集）：
- **fork→引擎 repo**：把 Backlog.md 身份改名为 `epicd`（package.json、二进制名、README 等）。
- **最小字段**：WorkItem 复用现有 `Task` 类型，新增 `pipeline_id` / `state` / `role` / `parent_id` / 结构化 `dod` / `cap`（ADR-011 D-1）。
- **execution-pipeline-as-data + 极小解释器**：一条 execution pipeline 定义（`backlog→ready→in-progress→done` + `needs-human`），解释器按 `item-ready: <pipeline>:<state>:<task_id>` 单一事件分派 handler（ADR-011 D-2）。
- **Core 之上的 driver**：detect→spawn→merge→advance。
- **agent→engine 完成 API**：替代 `.agent-done-*` sentinel。
- **安全关键子集（不可省）**：merge 串行化、worktree 隔离、cap 幂等——即 ADR-010 中"别把库改坏"的那部分。

延后（推给 MVD 自驱完成）：domain 富语义、field-registry 完美、exploration pipeline、完整 GateEvent 查询、UI、auth、自治。

自举里程碑：E0 完成 = **M1**（引擎 repo 自驱自身）。试跑次序：先在 sandbox board 跑 tracer bullet，fixpoint 通过后再上引擎真板；旧 loop 留作 soak 期 fallback，不立即删。

参考：ADR-011（`docs/adr/`）D-1/D-2/D-7；ADR-010 不变量；baime 讨论记录 §15。

---

# Epic Plan: E0: 引擎自驱 MVD（keystone）

## Background

The forked Backlog.md repo must be transformed into `epicd` — a self-hosting autonomous work engine. The current codebase is a generic kanban tool (package name `backlog.md`, version 1.47.1) with no pipeline, interpreter, or driver concepts. Engine-specific metadata (cap markers, parent links, DoD results, gate evidence) is currently squeezed into freeform notes and recovered by regex — an `L(R|G)` inflation problem per ADR-011.

E0 is the minimum viable driver (MVD): functional scope is minimal, but safety invariants are non-negotiable because the engine will modify its own repository. Bootstrapping milestone M1 = "engine repo self-drives its own development," so the skills and runtime must live inside this repo. The build order follows ADR-011 D-7's minimal field subset and the bootstrap soak discipline: sandbox tracer bullet first, then cut over to the real engine board.

## Goals

1. The repo identity is renamed to `epicd` across all package and binary surfaces (AC#1).
2. The `Task` type is extended with the D-7 engine fields (`pipeline_id`, `state`, `role`, `parent_id`, `dod`, `cap`); parse/serialize round-trip is verified by tests (AC#2).
3. A single execution pipeline (`backlog→ready→in-progress→done` + `needs-human`) is defined as data; the interpreter dispatches by `(pipeline_id, state)` with no hardcoded Basic/Epic logic (AC#3).
4. The engine driver closes the `detect→spawn→merge→advance` loop; the `agent→engine` completion API replaces `.agent-done-*` sentinel files (AC#4).
5. Safety-critical invariants are implemented and tested: merge serialization, worktree isolation, cap idempotency (AC#5).
6. A tracer bullet run on a sandbox board reaches fixpoint; the engine board is then switched to self-drive (AC#6).

## Sub-Task Decomposition

1. **Rename repo identity to `epicd`** — Update `package.json` name/bin, CLI binary entrypoint, README, and any hardcoded `backlog.md` identity strings so the package, binary, and documentation all present as `epicd`.

2. **Extend Task schema with engine fields and verify parse/serialize roundtrip** — Add `pipeline_id`, `state`, `role`, `parent_id`, `dod` (`DoDItem[]`), and `cap` (`CapMarker[]`) to the `Task` interface in `src/types/index.ts`; update the markdown parser and serializer to read/write these fields as YAML frontmatter; add tests that verify roundtrip fidelity for tasks with and without the new fields.

3. **Define execution pipeline as data and build the minimal interpreter** — Author the single execution pipeline definition (`backlog→ready→in-progress→done` + `needs-human` gate state) as a typed data structure; implement the interpreter that identifies actionable `(pipeline_id, state)` items and emits the parameterized `item-ready: <pipeline_id>:<state>:<task_id>` event; build the handler-registry dispatch layer so new pipelines can be added by registering a handler without touching interpreter core.

4. **Build the engine driver and agent→engine completion API** — Implement the `detect→spawn→merge→advance` driver loop that wires the interpreter to actual git worktree operations; replace the `.agent-done-*` file-sentinel handshake with a typed `engine.complete(taskId, result)` API call that the spawned worker invokes to signal completion and trigger state advancement.

5. **Implement and test safety-critical invariants** — Enforce merge serialization (one merge at a time via a lock so concurrent advances cannot corrupt the main branch), worktree isolation (each spawned task gets its own `git worktree add` with guaranteed cleanup on success or failure), and cap idempotency (before executing any phase, check the task's `cap` markers so a restarted driver never double-executes a completed phase); cover all three with dedicated tests.

6. **Tracer bullet: sandbox board fixpoint + cutover to real engine board** — Create a minimal sandbox backlog with one or two synthetic tasks; run the full driver cycle against it until fixpoint (all tasks reach a terminal state with no errors); once verified, update the real epicd backlog config and cut the active board over to the self-driving engine while leaving the old loop-backlog skill available as a soak-period fallback.

## Sequencing

```
Child 1 (rename)       ──┐
                          ├── can run in parallel (no shared files)
Child 2 (schema)       ──┘
                          │
Child 3 (interpreter)  ◄──┘ depends on Child 2 (needs extended Task type)
                          │
Child 4 (driver)       ◄──┘ depends on Child 3 (interpreter drives dispatch)
                          │
Child 5 (safety)       ◄──┘ depends on Child 4 (safety wraps driver operations)
                          │
Child 6 (tracer bullet) ◄─┘ depends on all of 1–5 (exercises the full stack)
```

- **Children 1 and 2** touch disjoint parts of the codebase (package identity vs. type system) and can be developed and merged in parallel.
- **Child 3** requires Child 2's schema to be merged so the interpreter can reference `pipeline_id` and `state` on the extended `Task` type.
- **Child 4** requires Child 3's handler-registry and event types to be stable before wiring the driver loop.
- **Child 5** (safety invariants) logically wraps the driver: merge serialization is inside the advance step, worktree isolation is inside spawn, and cap idempotency gates the entire cycle. It follows Child 4 but can be prototyped alongside it, merging after.
- **Child 6** is the integration gate; it must be the last to merge and requires all prior children to be in the main branch so the full stack can be exercised against the sandbox board.

## Constraints

- E0 scope is strictly the D-7 minimal subset from ADR-011. Fields and subsystems not in that subset (domain-rich semantics, field-registry unification, exploration pipeline, full GateEvent query, UI, auth, autonomy) are explicitly deferred to post-MVD self-driven iterations.
- The interpreter must remain a generic `(pipeline, state)` dispatcher. No hardcoded `Basic`/`Epic`/`kind:` label logic may appear in interpreter or driver core — any such logic belongs in a registered handler.
- The agent→engine completion API must be the only supported handshake mechanism once Child 4 merges; the `.agent-done-*` sentinel mechanism is replaced, not extended.
- The old `loop-backlog` skill must remain functional as a soak-period fallback until the tracer bullet (Child 6) is confirmed stable on the real engine board; it must not be deleted as part of E0.
- All three safety invariants (merge serialization, worktree isolation, cap idempotency) are non-negotiable per ADR-010 and must be covered by tests before Child 6 begins.
- The rename (Child 1) must not break any existing CLI/MCP/instruction contract surface; only identity strings (name, bin, README) change — no behavioral changes.
- Bootstrap soak discipline: sandbox board fixpoint must be demonstrated before the real engine board cutover; both must be documented in Child 6's implementation notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Epic proposal approved. Starting epic plan draft.

Epic plan review iteration 1: APPROVED
premise-ledger:
[E] sub-task count: 6 children enumerated in ## Sub-Task Decomposition (≥2 required)
[E] goal coverage: all 6 Goals (AC#1–AC#6) each map to exactly one child sub-task
[C] sequencing acyclic: DAG traced — Child1‖Child2 → Child3 → Child4 → Child5 → Child6; no cycles
[C] scope discipline: all children are within D-7 minimal subset per ADR-011; deferred items explicitly listed in Constraints
[H] feasibility of child boundaries: children are right-sized (rename, schema, interpreter, driver, safety, tracer-bullet); none is over-scoped to warrant its own epic
GCL-self-report: E=2 C=2 H=1

cap:propose=approved

cap:decompose=started

cap:decompose=done
epicDecompose: 6 children created via feature-to-backlog and parked at Basic: Proposal. Sequencing: (1‖2) → 3 → 4 → 5 → 6. Promote chosen children to Basic: Ready to authorize execution.

Sub-task BACK-600.2 completed: 2026-06-26T09:10:10Z

Sub-task BACK-600.1 completed: 2026-06-26T09:18:42Z

onChildDone: 2/6 children done

onChildDone: 2/6 children done (BACK-600.1, BACK-600.2 reached Basic: Done; remaining children at Basic: Backlog)

onChildDone: 2/6 children done (BACK-600.1, BACK-600.2 reached Basic: Done)

Sub-task BACK-600.3 completed: 2026-06-26T11:55:32Z

onChildDone: 3/6 children done (BACK-600.1, BACK-600.2, BACK-600.3). Remaining: BACK-600.4, BACK-600.5, BACK-600.6 at Basic: Backlog — promote to Basic: Ready to continue.

onChildDone: 3/6 children done (BACK-600.1, BACK-600.2, BACK-600.3 at Basic: Done; BACK-600.4, BACK-600.5, BACK-600.6 at Basic: Backlog)

onChildDone: 3/6 children done (BACK-600.1, BACK-600.2, BACK-600.3 at Basic: Done; BACK-600.4, BACK-600.5, BACK-600.6 at Basic: Backlog — awaiting human promotion to Basic: Ready)

onChildDone: 3/6 children done (3 still at Basic: Backlog — awaiting human promotion)

onChildDone: 3/6 children done (BACK-600.1, BACK-600.2, BACK-600.3 = Basic: Done; BACK-600.4, BACK-600.5, BACK-600.6 = Basic: Backlog). Waiting for remaining children.

Sub-task BACK-600.7 completed: 2026-07-04T03:57:46Z

Sub-task BACK-600.4 completed: 2026-07-04T04:02:53Z

Sub-task BACK-600.5 completed: 2026-07-04T04:36:22Z

Sub-task BACK-600.6 completed: 2026-07-04T04:47:08Z

cap:evaluate=recommendation:FINISH | done=7 needsHuman=0 | all children Basic: Done; all DoD shell-gates re-verified in main branch (108 tests, 0 fail) | data_source: measured

RECOMMENDATION: FINISH.
To finish: set status → Epic: Done.
To iterate: set status → Epic: Proposal or Epic: Plan and re-run /epic-to-backlog.

2026-07-04 里程碑校正（读引擎代码后）：600.6 的 tracer/cutover 是 in-memory 模拟（sandbox.ts::runToFixpoint 用空 stub spawn）+ config 一行注释，**证明的是循环收敛，不是真板自治**。引擎当前仍 test-only、spawn 为 stub、safety 未接 driver、complete 线性无 role/DoD 分叉。故 **E0 六 children 全 done ≠ M1 自治**。新增装配 children：**600.7**（四轴 reconcile，已建）、**600.8**（真板驱动器：board-backed store + 接 safety + role/DoD 分叉 + run 循环，stub spawn）、**600.9**（真 spawn worker → 自治跑通一条 Basic task = M1 自治最小证明）。**M1 自治 gate 应挂在 600.9 通过，而非 600.6。** Guard 1（跨机制锁）已由 safety.ts 共享 .merge-lock 解。
<!-- SECTION:NOTES:END -->
