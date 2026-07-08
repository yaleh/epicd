---
id: BACK-686.1
title: child A：claim/in-flight 硬化 + entry_phase 写入 + staleness reaper
assignee:
  - '@claude'
created_date: '2026-07-08 03:59'
updated_date: '2026-07-08 05:01'
labels:
  - 'kind:basic'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
references:
  - docs/proposals/2026-07-08-pipeline-driving-and-queue-mechanism.md
parent_task_id: BACK-686
priority: high
ordinal: 97000
pipeline_id: execution
phase: needs-human
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态：authoring/draft。规格来自 proposal §4/§6/§11。本 child 是 Epic BACK-686 的第一交付物，含最先落地的 A1(entry_phase)。走 authoring→refining 钉死 plan 后再 promote。

## 背景

今天 claim 状态散落在 `.caps/<id>.exec-lock`(flock)、`.active-agents`(单驱动守卫)、`.caps/<id>.wt`/`.signal`(能力令牌)、Implementation Notes 的 "claimed:" 时间戳里；且 `.active-agents`/`.caps` 是文件，kill -9 后不自清——崩溃的处理者会把 task 永久卡在 processing。而 `engine promote`(cli.ts:4560-4565)只写 pipeline_id/phase，从不写 `entry_phase` → `assertSingleStepRetreat` 对任何真实 task 必 throw，BACK-682 的三分类回退契约在真实任务上是死代码。

## 目标（proposal §11.3 child A）

把 claim 从散落状态升为**引擎原生、带租约 + reaper 的一等 in-flight 记录**，覆盖全部 agent-phase；并补上 entry_phase 写入这一"入边义务"。

## 内部结构

- **A1（最先，极小）**：`engine promote`（及未来任何跨 pipeline 入边 spawn）写 `entry_phase = 入边前的 ${pipeline_id}/${phase}`。立刻让 BACK-682 的死 retreat 边活过来。
- **A2**：引擎原生 claim/in-flight 记录，字段含 phase、worktree/branch、entry_phase、lease 到期时刻、puller 上下文标识；覆盖全部 agent-phase（含 adjudicating——今天它落地后无任何 exec-lock/claim）。配 staleness reaper：租约过期 → 免费重排队 / 半成品续跑或 GC。

## Acceptance Criteria

- [ ] #1 [A1] `engine promote` 后 `task.entry_phase` 非空且等于入边前的 `${pipeline_id}/${phase}`；有测试断言
- [ ] #2 [A1] 一个真实 task 从 adjudicating 单步 retreat 到 entry_phase 成功（BACK-682 现为死代码，本 AC 使其可运行）；有测试覆盖
- [ ] #3 [A2] `.caps`/`.active-agents` 的读写集中到单一 claim 模块；有 grep/结构检查断言不再散落
- [ ] #4 [A2] claim 记录覆盖全部 agent-phase，含 adjudicating（今天无 claim 保护）；有测试断言 adjudicating 期间的并发认领被互斥
- [ ] #5 [A2] 注入一个 stale claim（租约过期）→ reaper 使该 task 自动回到"排队"（phase 不变、claim 消失）；有测试覆盖崩溃自动重排队
- [ ] #6 claim 记录存 claim 元数据（worktree/branch/entry_phase/lease/puller 标识），不存 phase 副本；phase 仍是唯一进度真值
- [ ] #7 不改核心状态机/pipeline-as-data（ADR-011 D-2）；既有 scan 谓词测试套件全绿
- [ ] #8 不改 engine complete 的 DoD 独立重跑逻辑；既有 DoD 独立重跑测试套件全绿

## 改动范围 / 非目标

- 不做 actor 细化 / kind 绑定（child B）、不做 ready→implementing 改名 / decomposing 折入（child C）。
- 不改 baime；claim 记录是 epicd 原生，为脱离 baime scan-loop reaper 铺路（不在本 child 卸载 baime）。

## 依赖

- BACK-660（monitor）依赖本 child。
- 本 child 是 A1 → (A2 ∥ B) → C 序列的最前。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: child A：claim/in-flight 硬化 + entry_phase 写入 + staleness reaper

## Phase A: A1 — entry_phase written at every cross-pipeline entry (AC#1, AC#2)
### Tests (write first)
- `src/test/engine-promote-entry-phase.test.ts` (new): after `engine promote`, `task.entry_phase` equals the exact `${pipeline_id}/${phase}` the task held immediately before promote mutated it; asserts non-empty.
- `src/test/engine-retreat-real-task.test.ts` (new): a real (non-fixture-only) task promoted into `execution`, driven to `execution/adjudicating`, then `recordRetreat`'d — must land back on its recorded `entry_phase` with no throw (this is the "BACK-682 dead code → live" proof required by AC#2).

### Implementation
- `src/cli.ts` (~4521-4574, the `engine promote` command): capture `const priorPhaseKey = \`${task.pipeline_id ?? ""}/${task.phase ?? ""}\`` before overwriting `pipeline_id`/`phase`, and add `entry_phase: priorPhaseKey` to the `store.updateTask({...})` call. `entry_phase` is written-once (already documented at `src/types/index.ts:104-109`) — do not overwrite it on subsequent promotes of the same task.

### DoD
- [ ] `bun test src/test/engine-promote-entry-phase.test.ts src/test/engine-retreat-real-task.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: A2 — single claim module replaces scattered `.caps`/`.active-agents` reads/writes (AC#3, AC#4, AC#6)
### Tests (write first)
- `src/test/engine-claim-store.test.ts` (new): `acquireClaim`/`readClaim`/`releaseClaim` roundtrip; a `ClaimRecord` never contains a `phase` field (AC#6 — phase stays the sole progress truth, only `worktree`/`branch`/`entryPhase`/`leaseExpiresAt`/`puller` are stored); a second `acquireClaim` for the same task id while the first is held fails/throws (mutex).
- `src/test/engine-claim-covers-all-phases.test.ts` (new): for every machine-actor phase across `ALL_PIPELINES` (including `execution/adjudicating`, today's gap per AC#4), acquiring a claim succeeds once and a concurrent second acquire for the same task is rejected.

### Implementation
- `src/engine/claim.ts` (new module — the single centralization point, AC#3): `ClaimRecord { taskId, worktree, branch, entryPhase, leaseExpiresAt, puller }`; path helpers for `backlog/.caps/<id>.*`; `acquireClaim`/`readClaim`/`releaseClaim`/`listActiveClaims`, using the same `proper-lockfile` primitive already used in `src/engine/safety.ts`/`src/engine/supervisor.ts` (AC#7 constraint: keep behavior consistent with existing lock stores rather than inventing a second locking convention).
- `src/web/lib/coordinator-claims.ts`: keep its exported function signatures (`readActiveAgentIds`, `readClaimedWorktreePath`, `getCoordinatorClaimState(s)`) but make their bodies delegate to `src/engine/claim.ts` instead of reading `.active-agents`/`.caps/<id>.wt` directly.
- `src/engine/run.ts`: `isDriverActive()` delegates to `claim.ts`'s `listActiveClaims()` instead of checking `ACTIVE_AGENTS_FILE` directly.
- `src/engine/dispatch.ts`: source the `.caps/<id>.wt` / exec-lock / signal-file paths it writes into generated prompts from `claim.ts`'s exported path helpers, so the doc text and the runtime path can't diverge.
- Wire claim acquisition into the `execution/adjudicating` entry point (today's actual gap, AC#4) — locate the current adjudicating dispatch path via `grep -rn "adjudicating" src/engine plugin/scripts` at implementation time, and call `acquireClaim` there the same way the basic-ready dispatch path does.
- `handle-basic-ready.sh` remains the OS-level flock writer for its own exec-lock; centralization (AC#3) targets the Node/TS read/write call sites listed above, not rewriting the shell script's locking primitive.

### DoD
- [ ] `bun test src/test/engine-claim-store.test.ts src/test/engine-claim-covers-all-phases.test.ts src/web/lib/coordinator-claims.test.ts`
- [ ] `grep -rn "\.active-agents\|\.caps/" src/ --include=*.ts | grep -v -e src/engine/claim.ts -e '\.test\.ts:'` produces no output (no scattered literal path references left outside the claim module and tests)

## Phase C: staleness reaper (AC#5)
### Tests (write first)
- `src/test/engine-claim-reaper.test.ts` (new): inject a `ClaimRecord` with `leaseExpiresAt` in the past for a task sitting at some machine-actor phase; run the reaper; assert the claim is gone and `task.phase` is unchanged (crash → automatic requeue, no phase mutation — ties AC#5 to AC#6's "claim never duplicates phase").

### Implementation
- `reapStaleClaims()` in `src/engine/claim.ts`: scan `listActiveClaims()`, remove any whose `leaseExpiresAt` has passed; never touches `task.phase`.
- Wire `reapStaleClaims()` into the existing driver/monitor scan-loop tick (the same periodic loop `src/engine/run.ts`/`driver.ts` already runs) so stale claims are reaped continuously, not just on-demand.

### DoD
- [ ] `bun test src/test/engine-claim-reaper.test.ts`

## Constraints
- No actor-kind refinement (child B) and no `ready→implementing` rename / `decomposing` folding (child C) in this task — those are explicitly out of scope per the task's own "改动范围/非目标".
- Do not touch baime; the claim module is epicd-native (paves the way to eventually drop the baime scan-loop reaper, but does not do so here).
- `ClaimRecord` must never carry a `phase` copy — any implementation detail that stores phase alongside a claim is a defect against AC#6, not a style choice.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `git diff --stat main -- src/engine/pipeline.ts src/engine/complete.ts src/engine/adjudicate.ts | (! grep .)` (AC#7/#8: core state machine, pipeline-as-data, and DoD independent-rerun logic stay untouched)
- [ ] `bun test src/test/pipeline.test.ts src/test/pipeline-coupling-discipline.test.ts` (AC#7: scan-predicate suite stays green)
- [ ] `bun test src/test/engine-adjudicate.test.ts src/test/engine-adjudicate-eng8.test.ts` (AC#8: DoD independent-rerun suite stays green)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/refining review: APPROVED after 1 iteration(s)

claimed: 2026-07-08T04:31:57Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
