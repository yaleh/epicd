---
id: BACK-655
title: >-
  任务生命周期模型 conformance：backfill 选对 pipeline + task create --pipeline/--phase +
  phase 合法性校验 + drift-lint
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-06 04:40'
updated_date: '2026-07-06 09:19'
labels:
  - 'kind:feature'
  - 'area:engine'
dependencies: []
references:
  - docs/task-lifecycle-model.md
  - docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md
  - docs/proposals/2026-07-04-multi-lane-issue-list.md
  - BACK-612
  - BACK-617
  - BACK-654
priority: high
ordinal: 75000
pipeline_id: execution
phase: needs-human
dod:
  - text: bun test
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun test src/test/cli-engine-fields-edit.test.ts
    checked: false
  - text: bun test src/test/terminal-status.test.ts
    checked: false
  - text: bun test src/test/pipeline-coupling-discipline.test.ts
    checked: false
  - text: bun test src/test/status-label-projection.test.ts
    checked: false
  - text: '! grep -q executionPipeline.id src/core/engine-fields-backfill.ts'
    checked: false
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

canonical 生命周期模型（docs/task-lifecycle-model.md，汇总 ADR-011 D-1/D-2 + 2026-07-04 proposal §2.2/§2.3）已裁决并大部分落码：一个递归 Task（Epic=有子节点的 Task）+ 三条 pipeline（execution/authoring/exploration，状态=phase）+ 派生维度（role 由树位置、actor 由 pipelineDef[phase].actor 查表、active 由运行时 claim）；per-task 只持久化 (pipeline_id, phase)，status = label(role,phase) 是投影。

但数据与 create/backfill 入口尚未 conform 到该模型，导致 Web Pipeline 视图出现结构非法却看似合理的分组（如 execution/proposal (12)）。已确认的偏差点：

1. computeBackfillFields（src/core/engine-fields-backfill.ts）对缺失 pipeline_id 的 task 一律默认 executionPipeline.id，无视其 status 语义。于是 Basic: Proposal 类任务被 deriveBarePhase 生成非法 phase "proposal"（任何 pipeline 都没声明），又被硬塞 pipeline_id=execution。
2. task create（src/cli.ts）没有 --pipeline/--phase 选项（task edit 已有），且默认 status 为旧扁平词汇 Basic: Proposal，使每个新建 task 落在 No pipeline / No phase 兜底车道，持续再生该乱象（BACK-654 即活例）。
3. 写入路径缺 phase 合法性校验：create/edit/backfill 可以写入一个不属于其 pipeline_id 的 phase 而不报错。
4. 无 drift 检测：status 有值但 pipeline_id/phase 空、或 phase 不属其 pipeline 的 task 无法被自动发现。

## 目标

让数据与入口回归 canonical 模型，使 Pipeline 视图（含 CLI/TUI/Web）恒只显示合法的 (pipeline_id, phase) 组合。保留已裁决的设计选择：actor 折进 phase（不做 phase×actor 正交叉乘）；active/claim 是运行时事实，永不折进持久状态；In Progress 属 claim 层而非 phase。

## 做什么

- 修 computeBackfillFields：按 status 语义选对 pipeline_id——authoring 承接 draft/refining/backlog（工作假设：Proposal→draft、Plan→refining、Backlog→backlog）；execution 承接 ready/decomposing/awaiting-children/evaluating/needs-human/done；exploration 承接 spike。不再无条件 execution。重跑幂等，历史误标 task 归位。
- task create 增 --pipeline 与 --phase（与 task edit 语义一致），默认 authoring/draft（取代旧默认 Basic: Proposal）；写入即校验 phase 合法性。
- phase 合法性校验：在 create/edit/backfill 的写入边界统一校验 phase 必须是其 pipeline_id 声明的 state，否则拒绝并给出清晰错误（复用 src/engine/pipeline.ts 的 pipeline 定义作为单一真值源）。
- drift-lint：提供一条 CLI 检查，列出 status 有值但缺 pipeline_id/phase、或 phase 非法的 task，供 CI/人工发现漂移。

## 工作假设（待本任务 proposal 阶段最终批准）

Proposal→draft、Plan→refining 的映射是 canonical 文档 §4.1 标注的工作假设。若 proposal 阶段改判（例如在 authoringPipeline 前端新增一等 proposal/plan phase），据此调整 §4.1 与本任务实现。

## 非目标

- 不改 adjudicate/completeTask/merge-lock/worktree 生命周期（BACK-654 独立处理 adjudicate 不一致）。
- 不引入 phase×actor 正交叉乘；不把 active/claim 持久化。
- 不重做 Web 多车道视图本身（BACK-604 已实现）；本任务只保证喂给它的数据合法。
- 不动 GET /api/gate-events 或 engine gate-log。

## 参考

- docs/task-lifecycle-model.md（canonical 模型，本任务的真值源）
- src/engine/pipeline.ts（三条 pipeline 的合法 phase 集）
- src/core/engine-fields-backfill.ts（computeBackfillFields / deriveBarePhase 现状）
- BACK-612（原 backfill 任务，本任务为其 conformance 跟进）；BACK-617（phase→status 单向同步，勿破坏）；BACK-654（adjudicate 不一致，独立）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 computeBackfillFields 依 status 语义选择 pipeline_id（authoring/execution/exploration），不再无条件默认 execution；单元测试覆盖 proposal/plan/backlog→authoring、ready/needs-human/done→execution、spike→exploration
- [x] #2 task create 暴露 --pipeline 与 --phase 选项，默认 authoring/draft（非旧 Basic: Proposal），语义与 task edit 一致，并有测试覆盖默认值与显式传值
- [x] #3 create/edit/backfill 写入 phase 时校验其必须是所属 pipeline_id 声明的 state，非法 phase 被拒绝并报清晰错误；测试覆盖合法与非法两种输入
- [x] #4 提供一条 CLI drift-lint 检查，列出 status 有值但 pipeline_id/phase 为空、或 phase 不属其 pipeline 的 task；测试覆盖至少一个 drift 与一个 clean 样例
- [x] #5 重跑 backfill 对历史误标 task（如被标 execution/proposal 的任务）幂等归位到正确 pipeline，且不破坏 BACK-617 的 phase→status 单向同步（In Progress 仍属 claim 层，不作为持久 phase 写入）
- [x] #6 reposition 与 drift-lint 除缺失/非法 phase 外，也检测并归位 status↔phase 的终态分歧（status 为终态而 phase 非终态，或反之，即使 (pipeline_id,phase) 组合本身合法）；并修复 isTerminalStatus 使无 phase 的 Done 任务也被判为终态；测试覆盖：execution/needs-human+status Done 的分歧任务被 drift-lint 标记并 backfill 归位到 execution/done，以及 isTerminalStatus 认 Basic: Done 为终态而非仅认最后一个配置状态
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 任务生命周期模型 conformance

Proposal: (inline — see task description; canonical truth source is `docs/task-lifecycle-model.md` §3 pipelines + §4.1 legacy-vocab mapping)

Goal coverage map (every proposal Goal → Phase/Gate):
- Goal 1 (fix `computeBackfillFields` pipeline selection by status semantics + reposition mislabeled) → Phase B
- Goal 2 (`task create --pipeline/--phase`, authoring/draft default) → Phase C
- Goal 3 (phase-legality validation at create/edit/backfill write boundary, single source = `src/engine/pipeline.ts`) → Phase A (helper + edit), Phase B (backfill), Phase C (create)
- Goal 4 (drift-lint CLI) → Phase D
- Constraint (BACK-617 phase→status sync intact; `In Progress` never persisted as a phase) → Phase B (In Progress→execution/ready mapping) + Acceptance Gate (`cli-engine-fields-edit.test.ts`)

---

## Phase A: 共享 phase-legality 单一真值助手 + edit 写边界校验

Add `pipelineById` / `isLegalPhase` / `assertLegalPhase` to `src/engine/pipeline.ts` (the single source of truth: the three `Pipeline` consts already live there). Wire `assertLegalPhase` into the `task edit` write boundary (`Core.applyTaskUpdateInput`) so an illegal `--phase` for a task's `pipeline_id` is rejected with a clear error. Also fold in a canonical `ALL_PIPELINES` array so `src/web/lib/driver-indicator.ts` stops redeclaring its own copy (single implementation, per CLAUDE.md).

### Tests (write first)
- `src/test/pipeline.test.ts` (extend) — new `describe("pipelineById / isLegalPhase", ...)`:
  - `it("pipelineById resolves each declared pipeline by id")` — `pipelineById("execution")?.id === "execution"`, `"authoring"`, `"exploration"`; `pipelineById("nope")` is `undefined`.
  - `it("isLegalPhase accepts a declared state of its pipeline")` — `isLegalPhase("authoring","draft")`, `isLegalPhase("execution","needs-human")`, `isLegalPhase("exploration","spike")` all `true`.
  - `it("isLegalPhase rejects a phase not declared by that pipeline")` — `isLegalPhase("execution","proposal")`, `isLegalPhase("authoring","ready")`, `isLegalPhase("execution","in-progress")` all `false`.
  - `it("isLegalPhase rejects unknown pipeline id or blank phase")` — `isLegalPhase("nope","draft")`, `isLegalPhase("execution","")`, `isLegalPhase("execution",undefined)` all `false`.
  - `it("assertLegalPhase throws a message naming pipeline, phase and legal states")` — `expect(() => assertLegalPhase("execution","proposal")).toThrow(/execution/)` and `.toThrow(/proposal/)`.
  - `it("ALL_PIPELINES lists exactly the three declared pipelines")` — ids sorted equal `["authoring","execution","exploration"]`.
- `src/test/cli-engine-fields-edit.test.ts` (extend) — inside the existing describe:
  - `it("rejects an illegal --phase for the task's pipeline_id")` — create a task, `task edit task-1 --pipeline-id execution --phase proposal` exits non-zero and does NOT persist `phase: proposal` (reload shows `phase !== "proposal"`).
  - `it("still accepts a legal --phase (regression on BACK-617 phase→status sync)")` — `task edit task-1 --pipeline-id execution --phase ready` → `phase === "ready"`, `status === "Basic: Ready"`.

### Implementation
- `src/engine/pipeline.ts`: add and export
  - `export const ALL_PIPELINES: Pipeline[] = [executionPipeline, authoringPipeline, explorationPipeline];`
  - `export function pipelineById(id: string | undefined): Pipeline | undefined` — `ALL_PIPELINES.find(p => p.id === id)`.
  - `export function isLegalPhase(pipelineId: string | undefined, phase: string | undefined): boolean` — false unless `phase` non-empty and `pipelineById(pipelineId)?.states.some(s => s.name === phase)`.
  - `export function assertLegalPhase(pipelineId: string | undefined, phase: string | undefined): void` — throws `Error` naming the pipeline, the offending phase, and the pipeline's legal state names when `!isLegalPhase(...)`.
- `src/web/lib/driver-indicator.ts`: import `ALL_PIPELINES` from `../../engine/pipeline` instead of declaring a local copy (delete its local `export const ALL_PIPELINES`; re-export for existing consumers if needed).
- `src/core/backlog.ts` `applyTaskUpdateInput` (after the `pipeline_id`/`phase` `applyStringField` blocks, ~line 1238): when `task.phase` is set, `assertLegalPhase(task.pipeline_id, task.phase)` so an illegal edit throws before save. Import `assertLegalPhase` from `../engine/pipeline.ts`.

### DoD
- [ ] `bun test src/test/pipeline.test.ts`
- [ ] `bun test src/test/cli-engine-fields-edit.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q "export function isLegalPhase" src/engine/pipeline.ts`
- [ ] `! grep -q "const ALL_PIPELINES" src/web/lib/driver-indicator.ts`

---

## Phase B: computeBackfillFields 按 status 语义选 pipeline + 归位历史误标

Replace the unconditional `pipeline_id = executionPipeline.id` default with a status-semantics resolver, and make backfill REPOSITION tasks whose current `(pipeline_id, phase)` is illegal (or incomplete) — not just fill blanks. Idempotent: a legal combo is never touched, so a second run is a byte-for-byte no-op.

### Tests (write first)
- `src/test/engine-fields-backfill.test.ts` (extend + amend the assertions that encode the OLD buggy behavior):
  - NEW `describe("resolvePipelinePhase", ...)`:
    - `it("maps legacy Proposal → authoring/draft")` — `resolvePipelinePhase("Basic: Proposal")` deep-equals `{ pipeline_id: "authoring", phase: "draft" }`.
    - `it("maps legacy Plan → authoring/refining")`.
    - `it("maps Backlog/Draft/Refining → authoring same-name phase")`.
    - `it("maps In Progress → execution/ready (claim layer, never persisted as a phase)")` — `resolvePipelinePhase("Basic: In Progress")` → `{ pipeline_id: "execution", phase: "ready" }`.
    - `it("maps Ready/Decomposing/Awaiting Children/Evaluating/Needs Human/Done → execution same-name phase")`.
    - `it("maps Spike → exploration/spike")`.
  - AMEND `describe("computeBackfillFields")`:
    - `it("selects authoring/draft for a legacy Proposal task instead of execution")` — replaces the old `defaults pipeline_id to the execution pipeline id` assertion: `computeBackfillFields(baseTask({status:"Basic: Proposal"}), new Map())` → `pipeline_id === "authoring"`, `phase === "draft"`.
    - `it("repositions a historically mis-tagged task (execution + illegal phase 'proposal') to authoring/draft")` — task already has `pipeline_id:"execution", phase:"proposal", status:"Basic: Proposal"`; patch sets `pipeline_id:"authoring", phase:"draft"`.
    - `it("leaves a legal (pipeline_id, phase) combo untouched")` — task with `pipeline_id:"execution", phase:"ready"` (any status) → patch has no `pipeline_id`/`phase` keys.
    - update the existing `derives phase from status when missing` / `returns no changes …` / `never touches dod or cap` cases to the new legal-combo semantics.
  - AMEND `describe("runBackfill")`:
    - existing `backfills blank structural fields …`: "To Do" tasks now expect `pipeline_id === "authoring"`, `phase === "draft"` (was execution/to-do); role assertions unchanged.
    - existing `is safe to run concurrently …`: task B created with status "In Progress" now expects `pipeline_id === "execution"`, `phase === "ready"` (was execution/in-progress).
    - NEW `it("second run over already-repositioned tasks is a true no-op")` — after one backfill, a re-run returns `updated: []` and does not change file mtime (mirror existing mtime pattern).

### Implementation
- `src/core/engine-fields-backfill.ts`:
  - Add `export function resolvePipelinePhase(status: string): { pipeline_id: string; phase: string } | undefined` — a small explicit legacy-vocab table implementing `docs/task-lifecycle-model.md` §4.1: `proposal→authoring/draft`, `plan→authoring/refining`, `to-do→authoring/draft`, `backlog→authoring/backlog`, `draft→authoring/draft`, `refining→authoring/refining`, `in-progress→execution/ready`, `ready|decomposing|awaiting-children|evaluating|needs-human|done→execution/same`, `spike→exploration/spike`. Build the key via the existing `deriveBarePhase(status)`; return `undefined` for unmapped/blank.
  - Rewrite `computeBackfillFields` pipeline/phase logic: compute `legal = task.pipeline_id && task.phase && isLegalPhase(task.pipeline_id, task.phase)` (import `isLegalPhase` from `../engine/pipeline.ts`). If `!legal`, `resolvePipelinePhase(task.status)` and, when it resolves, set `patch.pipeline_id`/`patch.phase` (both) — repositioning. When already legal, leave both untouched. Keep the `parent_id` and `role` blocks unchanged. Preserves idempotency (legal combo ⇒ empty patch).
  - Keep `runBackfill` unchanged (it already skips empty patches — the idempotency mechanism).

### DoD
- [ ] `bun test src/test/engine-fields-backfill.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q "export function resolvePipelinePhase" src/core/engine-fields-backfill.ts`
- [ ] `! grep -q "executionPipeline.id" src/core/engine-fields-backfill.ts`

---

## Phase C: task create --pipeline/--phase + authoring/draft 默认 + 写边界校验

Add `--pipeline` and `--phase` to the `task create` CLI command (semantics mirror `task edit`'s `--pipeline-id`/`--phase`). When none of `--pipeline`/`--phase`/`--status`/`--draft` is given, default to `authoring`/`draft` (deriving `status: "Basic: Draft"`) instead of the legacy `Basic: Proposal`. Validate phase legality at the create boundary in `Core.createTaskFromInput`.

### Tests (write first)
- `src/test/cli-create.test.ts` (extend):
  - `it("defaults a bare create to authoring/draft (not Basic: Proposal)")` — `task create "X"` with no flags → reloaded task `pipeline_id === "authoring"`, `phase === "draft"`, `status === "Basic: Draft"`.
  - `it("honors explicit --pipeline/--phase")` — `task create "Y" --pipeline execution --phase ready` → `pipeline_id === "execution"`, `phase === "ready"`, `status === "Basic: Ready"`.
  - `it("rejects an illegal --pipeline/--phase combo at create")` — `task create "Z" --pipeline execution --phase proposal` exits non-zero and creates no task file for it (id count unchanged, or reload shows no such task).
  - `it("--draft still creates a Draft and is unaffected by the authoring/draft default")` — existing draft behavior preserved.

### Implementation
- `src/cli.ts` `task create` command (options block ~lines 1563–1621): add `.option("--pipeline <id>", "engine pipeline id (defaults to authoring)")` and `.option("--phase <phase>", "engine phase; status is derived from phase (defaults to draft)")`.
- `src/cli.ts` create `.action` (the non-wizard `createTaskFromInput` call ~line 1671): pass `pipeline_id`/`phase` from options; when the user gave neither `--pipeline`/`--phase` nor `--status` nor `--draft`, default `pipeline_id: "authoring", phase: "draft"`. (Scope the default to this CLI action only — leave `Core.createTaskFromInput`'s config `defaultStatus` fallback and the wizard/MCP paths untouched.)
- `src/core/createTaskFromInput` in `src/core/backlog.ts` (~line 1008): when `input.phase` is set, resolve the effective pipeline (`input.pipeline_id`) and `assertLegalPhase(input.pipeline_id, input.phase)` before building the task, so an illegal combo is rejected symmetrically with edit. Import `assertLegalPhase` from `../engine/pipeline.ts`.

### DoD
- [ ] `bun test src/test/cli-create.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun src/cli.ts task create --help 2>&1 | grep -q -- '--pipeline'`
- [ ] `bun src/cli.ts task create --help 2>&1 | grep -q -- '--phase'`

---

## Phase D: engine drift-lint CLI 命令

Add an `engine drift-lint` command that lists tasks whose `status` is set but `pipeline_id`/`phase` is empty, or whose `phase` is not a legal state of its `pipeline_id`. Exit non-zero when drift is found (CI-usable), zero when clean.

### Tests (write first)
- `src/test/engine-drift-lint.test.ts` (new file, mirror `cli-engine-fields-edit.test.ts` fixture style: temp repo + `initializeTestProject` + `$` CLI invocation):
  - NEW `describe("computeDrift", ...)` (pure fn):
    - `it("flags status set but pipeline_id/phase empty")` — a task with `status` but no `pipeline_id`/`phase` appears with a reason mentioning missing fields.
    - `it("flags a phase illegal for its pipeline")` — `pipeline_id:"execution", phase:"proposal"` flagged; reason mentions the illegal phase.
    - `it("does not flag a legal (pipeline_id, phase) combo")` — `execution/ready` not flagged.
  - `it("engine drift-lint exits non-zero and lists a drifted task")` — write a drifted task directly via `core.filesystem.saveTask` (bypassing validation) with `pipeline_id:"execution", phase:"proposal"`, run `engine drift-lint`, expect non-zero exit and output containing the task id.
  - `it("engine drift-lint exits zero on a clean board")` — only legal tasks present → exit 0.

### Implementation
- `src/core/engine-fields-backfill.ts` (same domain module): add `export function computeDrift(tasks: Task[]): { id: string; reason: string }[]` — for each task with a non-empty `status`, flag when `pipeline_id`/`phase` is missing, or when `!isLegalPhase(task.pipeline_id, task.phase)`; return id + human-readable reason.
- `src/cli.ts`: register `engineCmd.command("drift-lint")` (next to the existing `engineCmd.command("backfill")` ~line 4792). Action loads `Core`, `core.queryTasks({})`, `computeDrift(tasks)`; print each `"<id>: <reason>"`; on non-empty set `process.exitCode = 1`, else print a clean-board line and exit 0.

### DoD
- [ ] `bun test src/test/engine-drift-lint.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q "export function computeDrift" src/core/engine-fields-backfill.ts`
- [ ] `bun src/cli.ts engine --help 2>&1 | grep -q 'drift-lint'`

---

## Phase E: status↔phase 终态分歧 reconcile + isTerminalStatus 修复

Close the two same-root residuals surfaced during review (BACK-654 class): (1) a task can carry a *legal* `(pipeline_id, phase)` pair that is non-terminal while its `status` was set to a terminal value (e.g. `execution/needs-human` + `Basic: Done`) — reposition (Phase B) only fires on illegal combos, so this divergence slips through; (2) `isTerminalStatus` treats "terminal" as the LAST configured status (here `Basic: Refining`), so a `Done` task with no `phase` is not recognized as terminal by the status fallback in `isTaskTerminal`.

### Tests (write first)
- `src/test/engine-fields-backfill.test.ts` (extend):
  - `it("repositions a legal-but-terminally-divergent task (execution/needs-human + status Done) to execution/done")` — task `pipeline_id:"execution", phase:"needs-human", status:"Basic: Done"`; patch sets `phase:"done"` (status is terminal but phase's actor≠none).
  - `it("computeDrift flags a status-terminal / phase-non-terminal divergence even when the combo is individually legal")` — same task appears in `computeDrift` with a reason mentioning the terminal/phase mismatch; a matching `execution/done` + `Basic: Done` task is NOT flagged.
  - `it("second run after terminal-divergence reposition is a no-op")` — once repositioned to `execution/done` (status Done ∧ phase done, agreed), a re-run leaves it untouched (idempotency preserved).
- `src/test/terminal-status.test.ts` (extend, or new if absent):
  - `it("recognizes a Done status as terminal regardless of its position in the configured list")` — `isTerminalStatus("Basic: Done", availableStatuses)` is `true` even though `Basic: Refining` is the last configured status.
  - `it("still treats a non-terminal status (e.g. Basic: Ready) as non-terminal")`.

### Implementation
- `src/utils/terminal-status.ts`: fix `isTerminalStatus` so a status is terminal when its derived bare phase maps to an `actor:"none"` phase (reuse `resolvePipelinePhase` from Phase B + `getPhaseActor`/pipeline data), rather than only equalling `statuses[statuses.length-1]`. Keep the existing last-status behavior as a fallback for non-engine statuses. (Verify the Kanban cleanup consumer of `getTerminalStatus` still compiles/behaves — see Constraints.)
- `src/core/engine-fields-backfill.ts` `computeBackfillFields`: after the legal-combo check, add a divergence branch — when `status` resolves to a terminal phase (`resolvePipelinePhase(task.status)` yields an `actor:"none"` phase) but the current `task.phase` is non-terminal, reposition to the status-implied terminal phase even if the current combo is individually legal. Idempotent: once phase agrees with the terminal status, the patch is empty.
- `src/core/engine-fields-backfill.ts` `computeDrift`: additionally flag any task whose `status` is terminal but whose `(pipeline_id, phase)` resolves to a non-terminal actor (the divergence class), with a clear reason.

### DoD
- [ ] `bun test src/test/engine-fields-backfill.test.ts`
- [ ] `bun test src/test/terminal-status.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `grep -q "resolvePipelinePhase" src/utils/terminal-status.ts`

---

## Constraints
- `In Progress` stays a claim/runtime concept: backfill maps it to `execution/ready`, never persists `in-progress` as a phase. BACK-617's one-directional phase→status sync (`Core.updateTask` ~lines 1108–1155) must not break — `Basic: In Progress` written by the claim script while `phase` stays `ready` must still survive (do not add status→phase back-sync).
- `src/engine/pipeline.ts` is the single source of truth for legal phases; `isLegalPhase`/`resolvePipelinePhase`/`computeDrift` derive from it (and its §4.1 legacy table) — no second phase-name table, no invented vocabulary.
- Backfill stays idempotent and in-place: legal `(pipeline_id, phase)` combos are never rewritten; a second run must be a byte-for-byte no-op (no `updatedDate` churn).
- Do not touch adjudicate/completeTask/merge-lock/worktree lifecycle, the Web multi-lane view, `GET /api/gate-events`, or `engine gate-log` (out of scope per proposal 非目标).
- Do not introduce a phase×actor cross-product or persist `active`/claim.
- Changing `isTerminalStatus`/`getTerminalStatus` must not break existing consumers (Kanban cleanup `CleanupModal`, board export) — keep the last-configured-status behavior as a fallback and verify those call sites still pass under `bun test`.
- Keep total change ≤ ~1700 LOC; each phase ≤ ~200 LOC.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun test src/test/cli-engine-fields-edit.test.ts`
- [ ] `bun test src/test/terminal-status.test.ts`
- [ ] `bun test src/test/pipeline-coupling-discipline.test.ts`
- [ ] `bun test src/test/status-label-projection.test.ts`
- [ ] `! grep -q "executionPipeline.id" src/core/engine-fields-backfill.ts`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal approved (task description authored as detailed proposal). Starting plan draft.

Plan review APPROVED (strict architect, GCL E=7 C=5 H=1). 4 phases: A shared phase-legality helper + edit validation; B computeBackfillFields pipeline-by-status + reposition; C task create --pipeline/--phase; D engine drift-lint. Ready for LFDD.

追加 Phase E + AC#6：status↔phase 终态分歧 reconcile + isTerminalStatus 修复（BACK-654 同源残留的硬化，折入本 PR，不另建 task）。

LFDD lightweight-path sample #4: declared structured dodGates (criterion ① of docs/research/lightweight-fixpoint/README.md) before dispatching implementation agent.

claimed: 2026-07-06T08:21:13Z

engine complete --worktree routed needs-human on both attempts, but root-cause classification confirms this is an OPERATIONAL bug in the merge mechanism (gitMergeBranch's board-only-conflict auto-resolve in src/harness/real-primitives.ts uses git diff --name-only without -z, so a non-ASCII (Chinese) task filename comes back shell-escaped and the follow-up git checkout --ours/add pathspec fails to match — confirmed by reproducing manually with -z NUL-delimited paths, which resolved cleanly). Not a code defect in BACK-655 itself; not fixed inline per BACK-655's own Non-goals (excludes merge-lock/worktree lifecycle). Resolved the merge manually (commit 87fa675) after independently re-verifying all 7 structured DoD gates pass post-merge (bun test: 1961 pass/0 fail; bunx tsc --noEmit: clean). Dispatched an independent fresh-context audit agent (no implementation memory) given this touches engine core logic: it re-ran tests/tsc, re-verified all 6 ACs live (not just via shipped tests), confirmed backfill idempotency on the real board (18 tasks repositioned on first run, true no-op on second), and found one medium-severity gap (task create --pipeline/--phase validation asymmetry) filed as BACK-661. Zero blocking issues.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
