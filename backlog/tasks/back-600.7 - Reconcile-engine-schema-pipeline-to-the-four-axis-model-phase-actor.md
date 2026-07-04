---
id: BACK-600.7
title: Reconcile engine schema/pipeline to the four-axis model (phase/actor)
status: 'Basic: Backlog'
assignee: []
created_date: '2026-07-04 03:17'
updated_date: '2026-07-04 03:18'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies:
  - BACK-600.3
parent_task_id: BACK-600
ordinal: 10500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E0 child (前置于 600.4)。把引擎 reconcile 到**四轴终版**，避免 driver 建在会被 E1 删除的字段上。

## Background
600.2 给 Task 加了惰性引擎字段 `state`，600.3 定义了 executionPipeline（`ready/in-progress/done/needs-human`，`actionable: boolean`）+ interpreter——都在**四轴终版之前**。终版（proposal `docs/proposals/2026-07-04-multi-lane-issue-list.md` §2.3 · E1/BACK-601 AC#5/#6 · E3/BACK-603 AC#5 · state 图 `docs/uml/workitem-lifecycle-state.puml`）定：per-task 只存 `pipeline_id` + 裸 `phase`；`turn=actor(phase)` 归 pipeline-data；role/turn 派生；删冗余惰性字段；ready/in-progress 合并（claim 分 queued/active）；`needs-human` 是 `actor=human` 的 phase。本 task 在 driver（600.4）建成前把**引擎内部**对齐到该模型。

## Scope（仅引擎内部）
- `PipelineState`: `actionable: boolean` → `actor: "machine"|"human"|"none"`。
- `executionPipeline`: phases 与 state 图一致——`ready`(actor=machine，合并 in-progress) · `decomposing`(machine) · `awaiting-children`(none) · `evaluating`(machine) · `needs-human`(human) · `done`(none)。
- Task 引擎侧：以裸 `phase` 取代惰性 `state`（删冗余字段）；`pipeline_id` 保留；`role`/`turn` **不存**（派生）。
- `Interpreter.scan`: 谓词 = `pipelineDef[phase].actor==machine`（claim 归 Coordinator，本 task 可 stub/留待 600.4）；发 `item-ready:<pipeline>:<phase>:<id>`。
- parser/serializer：读写 `phase`(+`pipeline_id`)，不再读写 `state`。

## Non-goals
- `status` 的 web/CLI/board **全量迁移与显示投影**（归 E1/E4）——本 task 不动人面 `status` 字段接线。
- Coordinator/claim 实现（600.4/600.5 + E5）。
- IssueSource（601.1）。

## Trade-off
触及 600.2/.3 的 done 产物（state 字段、pipeline 定义）。正当性：pre-M1、interpreter 仍 test-only 未接线，**在 driver 建于其上之前**改最省，无返工。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PipelineState 用 actor: machine|human|none 取代 actionable；executionPipeline 的 phases 与 state 图一致（ready 合并 in-progress、needs-human 为 actor=human、done 为 actor=none）
- [ ] #2 Task 引擎侧以裸 phase 取代惰性 state（删冗余字段）；pipeline_id 保留；role/turn 不存（派生）
- [ ] #3 parser/serializer 读写 phase（+pipeline_id）不再读写 state；往返测试通过
- [ ] #4 Interpreter.scan 谓词 = pipelineDef[phase].actor==machine，发 item-ready:<pipeline>:<phase>:<id>；engine-interpreter 测试更新并通过
- [ ] #5 不改 status 的 web/CLI/board 全量迁移（归 E1/E4）；本 task 仅引擎内部，无返工
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan — engine four-axis reconcile（3 phase，测试先行）

### Phase A — pipeline actor + phases
- **测试先行** `src/test/engine-interpreter.test.ts`：actor=machine 的 phase 发 item-ready；actor=human/none 的 phase 不发。
- **实现** `src/engine/pipeline.ts`：`PipelineState.actor` 取代 `actionable`；`executionPipeline` phases = ready(machine，合并 in-progress) / decomposing(machine) / awaiting-children(none) / evaluating(machine) / needs-human(human) / done(none)，与 `docs/uml/workitem-lifecycle-state.puml` 一致。
- DoD：`bun test src/test/engine-interpreter.test.ts` · `bunx tsc --noEmit`

### Phase B — Task 引擎字段 state→phase + parse/serialize
- **测试先行** `src/test/engine-fields-roundtrip.test.ts`：`phase`+`pipeline_id` 往返无损；不写 `state` key。
- **实现** `src/types/index.ts`（`state`→`phase`，删冗余）；`src/markdown/parser.ts` + `serializer.ts` 读写 `phase`。
- DoD：`bun test src/test/engine-fields-roundtrip.test.ts` · `bunx tsc --noEmit`

### Phase C — scan 谓词 actor==machine
- **测试先行**：`Interpreter.scan` 仅对 actor=machine 发；事件 key = `<pipeline>:<phase>:<id>`。
- **实现** `src/engine/interpreter.ts`：谓词改 `pipelineDef[phase].actor==machine`（"无有效 claim" guard stub/留 600.4）。
- DoD：`bun test` · `bun run check .`

## Constraints
- **仅引擎内部**；不触 web/CLI/board 的 `status` 接线（E1/E4）。
- claim（Coordinator）出范围；scan 的"无有效 claim"guard 本 task stub，600.4 补。
- interpreter 保持通用（pipeline-as-data）；core 不硬编码 role/kind。
- `state`→`phase` 是引擎字段重命名/去冗余；若人面仍需读旧 `status`，由 E1 迁移，本 task 不承担其兼容。

## Acceptance Gate
- `bunx tsc --noEmit` · `bun run check .` · `bun test`
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
