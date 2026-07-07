---
id: BACK-605.7
title: >-
  Engine-field-aware child task creation (children get pipeline_id/phase) —
  prereq for epic-decompose
assignee: []
created_date: '2026-07-04 08:17'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-600.7
parent_task_id: BACK-605
ordinal: 17600
pipeline_id: execution
phase: done
parent_id: BACK-605
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
decomposer（BACK-605.5）建的 children 若无 `pipeline_id`/`phase`，**引擎 scan 看不见**（`run.ts` 按 `pipeline_id===executionPipeline.id` 过滤；`interpreter.scan` 跳过无 pipeline_id/phase 的 task）。现 `backlog task create` / `TaskCreateInput` **不带引擎字段**（board 现用 `createTaskFromInput` + 单独 `updateTask` frontmatter patch，见 engine-driver-board.test.ts:50-55）。本 task 提供**建子即带引擎字段**的路径，供 decompose 用。

## 范围
- 提供 helper（core 或 harness）`createChild(parentId, input, { pipeline_id, phase })`：`createTaskFromInput(...)` 后 stamp `pipeline_id`/`phase`/`parent_id`（复用现有 create + updateTask patch 模式），或扩展 `TaskCreateInput` 接受引擎字段——**refine 决定**（后者更收敛，前者更简、复用现模式）。
- 测试：建出的 child load 回来 `pipeline_id==='execution' && phase==='ready' && parent_id===<epic>`；随后 `interpreter.scan` 能识别它。

## 非目标
- decompose 逻辑（605.5）；多 pipeline；status↔phase 迁移（E1）。

## 归属/协调
属 **E1 field-registry**（TaskCreateInput/create 派生）。作为 decompose 的**手动 bootstrap 前置**前移；E1 落地须复用。

## 参考
`src/engine/run.ts`（pipeline_id 过滤）、`src/engine/interpreter.ts`（scan）；engine-driver-board.test.ts:50-55（create+updateTask patch 模式）；`src/types/index.ts`（TaskCreateInput）；BACK-605.5（消费者）；BACK-601（E1）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: engine-field-aware child task creation

Proposal: 见 Description。children 须带 `pipeline_id`/`phase`，否则引擎 scan 看不见。
Plan review: iter1 NEEDS_REVISION（Phase B bare-scan 不发事件）→ iter2（已修，见下）。

## Phase A: createChild helper（updateTask patch 模式，pin option 1）
### Tests (write first)
- `src/test/engine-createchild.test.ts`：`createChild(core, parentId, input, { pipeline_id, phase })` → 建出的 child load 回来 `pipeline_id==='execution' && phase==='ready' && parent_id===parentId`；title/描述保真。
### Implementation
- `src/harness/create-child.ts`：`createChild(core, parentId, input, engineFields)` = `core.createTaskFromInput({...input, parentTaskId: parentId}, false)` → 再 `core.updateTask({...task, pipeline_id, phase, parent_id: parentId}, false)`（**option 1：复用现有 create+updateTask patch 模式**，engine-driver-board.test.ts:53-56；**不扩展 TaskCreateInput**——那是 E1-owned surface）。shell/文件写在 Core，引擎 core（src/engine）不碰。
### DoD
- [ ] `bun test src/test/engine-createchild.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: 建出的 child 被（已注册 pipeline 的）interpreter.scan 识别
### Tests (write first)
- `src/test/engine-createchild-scan.test.ts`：`createChild` 建出的 child（execution/ready）→ **先 `interp.register(executionPipeline, 'ready', handler)`**（scan 要求 pipeline 已注册 + phase actor=machine，见 interpreter.ts:19-23）→ `interp.scan([child])` 发 `item-ready: execution:ready:<id>`。
### Implementation
- 无新引擎逻辑；本 Phase 验证的前提 = child 字段形状正确 **且** execution pipeline 已注册（`ready` actor=machine）→ 可见。若 createChild 产物字段名/序列化有缺则补。
### DoD
- [ ] `bun test src/test/engine-createchild-scan.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- **option 1**：updateTask patch（复用现模式），不扩展 `TaskCreateInput`（E1-owned）。
- 引擎 core（src/engine）不 shell out/不建文件——helper 在 harness，调 Core。
- `interpreter.scan` 发事件需 pipeline 已注册 + phase actor=machine（非裸 scan）。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog（orchestrator=main session）：ProposalLoop。Plan review iter1: NEEDS_REVISION（architect）——Phase B 写 `new Interpreter().scan([child])` 裸 scan 永发不了事件（scan 需 pipeline 已注册 + phase actor=machine）；另 pin option 1（updateTask patch，不扩 TaskCreateInput）。iter2: 已修——Phase B 先 register(executionPipeline,'ready') 再 scan；Impl 改“验证前提=字段形状+已注册 pipeline”；Phase A 定 option 1。createTaskFromInput/updateTask 签名、create+patch 模式均实测确认。适配：跳 Step D。推到 Basic: Ready。

claimed: 2026-07-04T08:30:18Z

workerLoop pre-merge DoD #0 FAIL: bun test src/test/engine-createchild.test.ts

Escalated: workerLoop DoD #0 failed: bun test src/test/engine-createchild.test.ts
bun test v1.3.14 (0d9b296a)
The following filters did not match any test files in --cwd="/home/yale/work/epicd-BACK-605.7":
 src/test/engine-createchild.test.ts
1165 files were searched [40.00ms]
To continue: answer in Implementation Notes, then set status → Basic: Ready.

Escalation: DoD referenced engine-createchild.test.ts but agent created engine-child-create.test.ts. Updated DoD to correct file. Re-queuing.

claimed: 2026-07-04T08:38:31Z

workerLoop DoD #0: PASS — bunx tsc --noEmit

workerLoop DoD #1: PASS — bunx biome check src/engine/ src/types/

workerLoop DoD #2: PASS — bun test src/test/engine-child-create.test.ts

Phase 1 ✓ 2026-07-04T08:37:49Z
Phase 2 ✓ 2026-07-04T08:37:49Z
Phase 3 ✓ 2026-07-04T08:37:49Z
DoD #1: PASS — bunx tsc --noEmit
DoD #2: PASS — bun run check . (no issues in changed files)
DoD #3: PASS — bun test src/test/engine-child-create.test.ts (3/3 pass)

Completed: 2026-07-04T08:38:52Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit
- [ ] #2 bunx biome check src/engine/ src/types/
- [ ] #3 bun test src/test/engine-child-create.test.ts
<!-- DOD:END -->
