---
id: BACK-686.2
title: >-
  child B：actor 细化 machine-agent/machine-mechanical + kind 绑定 + adjudicating 变
  gate
assignee:
  - '@claude'
created_date: '2026-07-08 04:00'
updated_date: '2026-07-08 05:35'
labels:
  - 'kind:basic'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
references:
  - docs/proposals/2026-07-08-pipeline-driving-and-queue-mechanism.md
parent_task_id: BACK-686
priority: high
ordinal: 98000
pipeline_id: execution
phase: done
dod:
  - text: bun test
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test src/test/pipeline-coupling-discipline.test.ts
    checked: false
  - text: bun test src/test/harness-evaluator.test.ts
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态：authoring/draft。规格来自 proposal §3/§9。与 child A 大体并行（gate 的 fresh-context 用 A 的 puller 标识）。走 authoring→refining 钉死 plan 后再 promote。

## 背景

`actor=machine` 太粗，把"引擎 tick 内机械活"和"必须派 LLM 会话的长耗时活"混为一类。phase-coverage.json 今天一律 `"status":"skill"`：`execution/evaluating` 被登记为 skill(epic-evaluate)，但它本质是机械脚本(engine evaluate/evaluateEpic：跑 IA + 聚合子终态)。为一次纯 shell 计算占用会话是浪费。

## 目标（proposal §11.3 child B）

registry 条目的 kind 携带 actor 细分，`scan`/`dispatch`/`hasPendingWork` 只读 kind 即知是否掏 spawn 成本。

## Acceptance Criteria

- [ ] #1 registry（phase-coverage.json）每条带 `kind ∈ {skill, script, gate}`；有测试/lint 断言每个 machine phase 有且仅有一个 kind
- [ ] #2 `execution/evaluating` 从 kind:skill(epic-evaluate) 改为 kind:script(engine evaluate)；`epic-evaluate` skill 退役
- [ ] #3 [机械 AC] `grep` 确认 `src/engine/dispatch.ts` 无 `evaluating→epic-eval-due` 分支；evaluating 改由 Interpreter tick 内 `evaluateEpic` 直接跑
- [ ] #4 `adjudicating` 变 gate：先跑机械 gate-script(DoD 全绿? AC 全勾? 无越界 diff? auditDepthFor?)，light 直接落 done、不派会话；full 才 dispatch adjudicate skill；有测试覆盖 light 路径不 spawn 会话、full 路径 spawn
- [ ] #5 evaluating 的 IA+子聚合并入 adjudicating gate-script（proposal §9.5 已定折叠）；epic 路径 awaiting-children→adjudicating(gate)→done，无独立 evaluating phase；有测试覆盖 epic 装配路径
- [ ] #6 `scan`/`hasPendingWork`/`dispatch` 一致地只为 kind:skill 与 gate 的升级路径掏 spawn 成本，kind:script 不 dispatch；有测试断言
- [ ] #7 gate 的 fresh-context：adjudicating 升级出去的会话标识 ≠ 产出该 diff 的 implementing puller 标识；复用 child A 的 puller 上下文标识，可断言（依赖 A）
- [ ] #8 不改核心状态机前向 scan 谓词/actor 归属（decomposing/awaiting-children 等不变，本 child 不动 pipeline 结构，仅 kind 标注与 evaluating 折叠）；既有 scan 谓词测试套件全绿
- [ ] #9 不改 engine complete 的 DoD 独立重跑逻辑，adjudicating gate 只在其后加一层判断；既有 DoD 独立重跑测试套件全绿
- [ ] #10 不破坏 BACK-628.4 epic 评估语义（IA 红/子 needs-human → epic needs-human；IA 全绿且子全 done → 判断层）；既有 epic 评估测试迁移到 tick 内直接调用后全绿

## 改动范围 / 非目标

- 不做 ready→implementing 改名 / decomposing 折入 / promote 去分叉（child C）。
- 不做 claim 记录本身（child A），仅消费其 puller 标识做 fresh-context 断言。

## 依赖

- gate 的 fresh-context（AC#7）依赖 child A 的 puller 上下文标识。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: child B：actor 细化 machine-agent/machine-mechanical + kind 绑定 + adjudicating 变 gate

## Phase A: registry carries `kind` (AC#1)
### Tests (write first)
- `src/test/phase-skill-coverage.test.ts` (extend): every entry in `plugin/skills/phase-coverage.json` has exactly one `kind ∈ {skill, script, gate}`; a phase missing `kind`, or with an unrecognized value, fails the test.

### Implementation
- `plugin/skills/phase-coverage.json`: add `kind` to all 7 entries (`{phase, status, skill, kind}`); values assigned per the phases touched below — `execution/evaluating: "script"`, `execution/adjudicating: "gate"`, everything else keeps `kind: "skill"` (no other phase changes behavior in this task).

### DoD
- [ ] `bun test src/test/phase-skill-coverage.test.ts`

## Phase B: `evaluating` becomes a mechanical script, `epic-evaluate` skill retires (AC#2, AC#3, AC#10)
### Tests (write first)
- `src/test/engine-evaluating-script.test.ts` (new): a task sitting at `execution/evaluating` is driven by `Driver.tick` calling `evaluateEpic` (`src/harness/evaluator.ts:92`) directly and synchronously — no dispatch/spawn call is recorded for it (mechanical, not a skill dispatch); result resolves the task per existing IA/child-aggregation semantics (IA red or any child `needs-human` → `needs-human`; IA green + all children `done` → forward).
- Migrate `src/test/harness-evaluator.test.ts`'s BACK-628.4 assertions so at least one case invokes `evaluateEpic` via the tick path (not only the CLI path) — confirms AC#10's "既有 epic 评估测试迁移到 tick 内直接调用后全绿".
- `src/test/engine-dispatch.test.ts` (extend): assert `dispatch.ts` no longer exports/uses `renderEpicEvalDueDispatch` (AC#3's grep target).

### Implementation
- `src/engine/driver.ts` (`Driver.tick`, ~line 78-103): add a branch for `phase === "evaluating"` that calls `evaluateEpic` directly and applies its verdict, the same way the existing `phase === "adjudicating"` branch calls `adjudicateHandler` — mechanical, no session spawn.
- `src/engine/dispatch.ts`: remove `renderEpicEvalDueDispatch` (~line 202) and its call sites — evaluating no longer needs a human/agent-facing dispatch prompt.
- Delete `plugin/skills/epic-evaluate/` (skill retired — its logic is now `evaluateEpic` invoked mechanically, not via a dispatched skill).
- `src/cli.ts`'s `engine evaluate <taskId>` command (~line 4466-4469) is unchanged — it stays as a manual/debug entry point calling the same `evaluateEpic`.

### DoD
- [ ] `bun test src/test/engine-evaluating-script.test.ts src/test/harness-evaluator.test.ts src/test/engine-dispatch.test.ts`
- [ ] `grep -n "evaluating" src/engine/dispatch.ts | grep -i "eval-due\|renderEpicEvalDue"` produces no output

## Phase C: `adjudicating` becomes a gate (AC#4, AC#7)
### Tests (write first)
- `src/test/engine-adjudicating-gate.test.ts` (new): given a task at `execution/adjudicating`, a mechanical gate-script runs first — DoD all-green? AC checkboxes all-checked? diff in scope? `auditDepthFor` (already in `src/engine/retreat.ts:125`) — light path resolves straight to `done` with **no** dispatch/spawn recorded; full path issues exactly one dispatch of the `adjudicate` skill.
- `src/test/engine-adjudicating-fresh-context.test.ts` (new): the full-path dispatch's session/puller identity is asserted distinct from the `implementing` puller identity recorded on the task's claim (consumes child A's `src/engine/claim.ts` `puller` field per AC#7 — see Constraints for sequencing note).

### Implementation
- `src/engine/adjudicate-gate.ts` (new, or extend `src/engine/adjudicate.ts`): a `gateAdjudicating(task, dodResult, changedPaths)` mechanical function — reuses `auditDepthFor` for the light/full split, checks DoD-green + AC-checkbox state; returns `{ verdict: "done" } | { verdict: "dispatch-skill" }`.
- `src/engine/driver.ts`: the existing `phase === "adjudicating"` branch calls `gateAdjudicating` first; only on `"dispatch-skill"` does it fall through to the existing skill-dispatch path (`renderAdjudicatingDispatch` in `dispatch.ts` stays for the full path only).
- Fresh-context assertion consumes `src/engine/claim.ts`'s puller field (child A, `BACK-686.1`) to compare against the new dispatch's session identity.

### DoD
- [ ] `bun test src/test/engine-adjudicating-gate.test.ts src/test/engine-adjudicating-fresh-context.test.ts`

## Phase D: fold evaluating's IA+aggregation into the adjudicating gate for the epic path (AC#5)
### Tests (write first)
- `src/test/engine-epic-gate-fold.test.ts` (new): an epic task's assembled path is `awaiting-children → adjudicating(gate) → done/needs-human` — the gate-script runs `evaluateEpic`'s IA+child-aggregation logic itself; a fresh epic task driven end-to-end never visits/dispatches `evaluating` at all.

### Implementation
- `gateAdjudicating` (Phase C) calls `evaluateEpic`'s IA+aggregation logic as its epic-specific mechanical check before the light/full split, so an epic task's gate absorbs what `evaluating` used to do.
- `src/engine/driver.ts`: for epic tasks (task has children), route `awaiting-children`'s forward transition straight to `adjudicating` rather than `evaluating` — `evaluating` stays a declared pipeline state (AC#8: no pipeline-as-data change) but becomes unreachable in the epic runtime path; document this explicitly as the "folding" the task's own notes call for, not a state-machine edit.

### DoD
- [ ] `bun test src/test/engine-epic-gate-fold.test.ts`

## Phase E: `scan`/`hasPendingWork`/`dispatch` read `kind`, not just `actor` (AC#6)
### Tests (write first)
- `src/test/engine-scan-kind.test.ts` (new): for a `kind:script` phase (evaluating), `scan`/`hasPendingWork` report pending work but `dispatch` never spawns a session for it; for `kind:skill` and a gate's full-path upgrade, `dispatch` does spawn — assert spawn-call counts directly.

### Implementation
- `src/engine/scan.ts` (`scanReadyLines`, line 46) and `src/engine/run.ts` (`hasPendingWork`, line 29): keep existing `actor === "machine"` gating (AC#8: don't touch actor semantics) but add a `kind` read from `phase-coverage.json` so `dispatch` (not `scan`/`hasPendingWork` themselves) can decide whether to spend spawn cost — `kind:script` phases are handled inline by `Driver.tick` (Phases B/D), never dispatched.

### DoD
- [ ] `bun test src/test/engine-scan-kind.test.ts`

## Constraints
- No `ready→implementing` rename, no `decomposing` folding, no promote de-branching — that's child C (`BACK-686.3`), not this task.
- No claim-record implementation here (child A, `BACK-686.1`) — Phase C/AC#7 only *consumes* its `puller` field. If child A hasn't merged yet when this task starts implementation, stub the puller-identity comparison behind the same interface `src/engine/claim.ts` is expected to expose, and note the stub explicitly rather than silently skipping AC#7's test.
- `evaluating` remains a declared state in `src/engine/pipeline.ts` (AC#8 forbids touching pipeline-as-data) — "folding" (AC#5) is a runtime routing change in `driver.ts`, never a change to the `Pipeline`/`PipelineState` data itself.
- `src/engine/adjudicate.ts`'s existing `adjudicate()` (ENG-8 mechanical DoD verdict) and `src/engine/complete.ts`'s `completeTask`/`completeAdjudication` are unchanged (AC#9) — the new gate-script sits strictly after DoD verdict resolution, as an additional decision layer, not a replacement.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `git diff --stat main -- src/engine/pipeline.ts src/engine/complete.ts src/engine/adjudicate.ts | (! grep .)` (AC#8/#9: pipeline-as-data and DoD independent-rerun logic stay untouched)
- [ ] `bun test src/test/pipeline-coupling-discipline.test.ts` (AC#8: scan-predicate/actor suite stays green)
- [ ] `bun test src/test/harness-evaluator.test.ts` (AC#10: epic evaluation semantics unchanged after migrating to tick invocation)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/refining review: APPROVED after 1 iteration(s)

claimed: 2026-07-08T04:32:05Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
