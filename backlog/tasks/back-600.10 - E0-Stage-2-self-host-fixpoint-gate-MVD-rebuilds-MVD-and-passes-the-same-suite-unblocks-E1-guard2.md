---
id: BACK-600.10
title: >-
  E0 Stage 2 self-host fixpoint gate (verifier+self-test instrument; guard#2
  discharged by soak run)
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-04 09:32'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
parent_task_id: BACK-600
ordinal: 19000
pipeline_id: execution
phase: done
parent_id: BACK-600
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
E1（BACK-601）plan 钉死的 M1 边界 guard#2 未交付：600.6 的 "fixpoint" 只是**驱动收敛幂等**（跑两遍第二遍 no-op），**不是** §15.1 的 **Stage 2「MVD 重建 MVD」**——即"自造驱动能复现自身、过同套件 → 自举可信"。Stage 2 未通过前让引擎自驱 E1 属"用未验证驱动器跑真实路线图"。本 task 补上这个显式 M1 gate，解锁 E1 guard#2。

## 定义（§15.1，勿与 600.6 混淆）
- Stage 0 = 旧 loop（造 MVD）；Stage 1 = MVD 自驱一个 tracer WorkItem（≈M1 已证）；
- **Stage 2 = MVD 重建 MVD**：引擎自驱产出一份**重建的最小驱动核**（isolated worktree），该重建物**过同一套件**（bun test 的引擎子集）→ 不动点校验通过。
- 关键判据：套件跑在**独立产出的重建树**上（非当前树原地重跑——那退化成 600.6）。

## 关键设计难点（须在 refine 解决，避免又一个 stub）
- **MVD 面清单**：明确"最小驱动核" = 哪些 src/engine/* + harness seam + pipeline 数据 + 哪些 test 构成"同套件"。落成显式 manifest。
- **重建来源 ≠ 复制**：重建须由引擎驱动 + 真 worker（spawn seam）从契约/测试重产实现，非 cp 现有 impl。gate 判据是"套件过重建树"。
- **gate 自证**：gate 逻辑本身须可信——用 fixture 证明它能区分 good-rebuild（过）与 deliberately-broken-rebuild（挂）。防 stub 的核心 DoD。
- **隔离**：重建在 isolated worktree/sandbox，绝不污染真板/真核；单一活动驱动器纪律（.active-agents）。
- **产物**：可运行 stage2 gate（脚本/入口）+ manifest + 自证 test；记为显式 M1 gate。真 live 全量重建跑是 soak；本 task 交付 gate 机制+判据+自证，非一次 live 全量重建。

## 非目标
- 不做 vN→vN+1 升级流水线（§15.1 后半，后续）。
- 不做完整 live 引擎重建的一次性执行（soak）。

## 参考
baime 讨论记录 §15.1（Stage 0/1/2 定义）、§15.2（M1/M2 勿混）；docs/uml/use-case-model.md:99；ADR-010；BACK-601 guard#2；BACK-600.6（被区分对象）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: E0 Stage 2 self-host fixpoint gate (MVD rebuilds MVD, passes same suite AND drives)

Proposal: 见 Description（§15.1 Stage 2 定义；与 600.6 收敛幂等两义勿混）。
Plan review iter1: independent architect NEEDS_REVISION（crux C + 框架 B + Defect0 + D + E）——本 re-plan 并入全部 5 项。

> **本 task 交付 = Stage 2 验证器 + 自证（instrument），不是一次通过的 live 自host 跑。** guard#2 只由**一条记录在案的、真重建树上的 `stage2 passed:true` 事件**（soak）解除——本 task **不产出**该事件，只交付产出它的仪器。E1 **不得**把 600.10-done 当作 guard#2 已清。（架构评审 B）

## 反 stub 判据（architect C，crux）
"重建树过 `MVD_TEST_FILES`" 单独**不足**——因 TDD 下测试即规格，"重建过测试"≈"worker 把测试弄绿"= **Stage 1**，非 Stage 2。真 Stage 2 = **自应用**：重建的驱动器**自身**能**驱动一个 tracer WorkItem 到 fixpoint**（用**重建的** driver/interpreter/sandbox 代码）。故 gate 判据 = **套件绿 ∧ 重建驱动器能驱 tracer 到 fixpoint**（后者在 `rebuiltRepoPath` 内跑）。

## Phase 0: 删除既有假 Stage 2（Defect 0）
### Tests (write first)
- `src/test/stage2-no-fake.test.ts`：断言 `! exists(src/test/engine-stage2-selfhost-fixpoint.test.ts)`（或其内容已改写为调用真 gate，不再靠 test 自植 JSON.parse 重构）——防"两个 Stage 2、其一是 stub 保持 bun test 绿"。
### Implementation
- **删除** `src/test/engine-stage2-selfhost-fixpoint.test.ts`（已确认 stub：spawn `()=>({success:true})`、从 test 自植的 description `JSON.parse` 重构、结构等价断言；重建 0 源、驱 0 worker、跑 0 套件于重建树）。移除任何把它当 Stage 2 证据的引用。
### DoD
- [ ] `bun test src/test/stage2-no-fake.test.ts`
- [ ] `! test -f src/test/engine-stage2-selfhost-fixpoint.test.ts`

## Phase A: MVD manifest + 必要性守卫（"最小驱动核" + "同套件"，且清单最小完备）
### Tests (write first)
- `src/test/stage2-manifest.test.ts`：(a) `MVD_SOURCE_FILES` 非空且每路径存在（src/engine 的 pipeline/driver/interpreter/adjudicate/complete/run/safety/store/sandbox + harness seam worker-runner/decomposer/dod-runner/real-primitives）；(b) `MVD_TEST_FILES` 非空且每个存在（"同套件"= engine-*.test.ts 子集）；(c) 无不存在路径。
- **必要性守卫（architect D）**：在 toy fixture 上断言——**移除任一 `MVD_SOURCE_FILES` 条目 → 套件失败**（证清单无死条目、套件确实 exercise 每个源）；据此在真 manifest 上此性质由 soak 校验（in-suite 用 toy 证机制）。
### Implementation
- `src/engine/mvd-manifest.ts`：`export const MVD_SOURCE_FILES: string[]`、`export const MVD_TEST_FILES: string[]`。
### DoD
- [ ] `bun test src/test/stage2-manifest.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: stage2 gate runner（套件绿 ∧ 重建驱动器能驱 tracer）+ 三态自证
### Tests (write first)
- `src/test/stage2-gate.test.ts`（**anti-stub 自证**，**最小 toy fixture 引擎**，不递归全 engine 套件；child `bun test` 的 cwd=temp `rebuiltRepoPath`，**隔离于父 repo bunfig/套件**——architect E）：
  - **good**：toy engine（toy driver + toy 单测 pass + toy tracer-drive 能到 fixpoint）→ `runStage2Fixpoint(...)` 返回 `{ passed: true }`。
  - **broken-unit**：toy 源改到 toy 单测**失败** → `{ passed:false, reason:'suite-failed' }`。
  - **broken-drive（crux C 的关键 fixture）**：toy **单测仍过**但 toy driver **驱不动 tracer**（改坏驱动逻辑但不碰断言）→ `{ passed:false, reason:'drive-failed' }`。证 gate 不退化成 Stage 1。
  - **incomplete**：缺失 manifest 源 → `{ passed:false, reason:'missing-source' }`。
  - 断言 gate **区分四态**。
### Implementation
- `src/harness/stage2-gate.ts`：`runStage2Fixpoint({ rebuiltRepoPath, sourceFiles, testFiles, tracerEntry }): Promise<Stage2Result>`：
  1. `sourceFiles` 全部在 `rebuiltRepoPath` 存在非空，否则 `missing-source`；
  2. `Bun.spawn(["bun","test", ...testFiles], { cwd: rebuiltRepoPath, /* 隔离：不上溯父 bunfig/套件 */ })`，非 0 → `suite-failed`；
  3. **自应用**：`Bun.spawn(["bun","test", tracerEntry], { cwd: rebuiltRepoPath })`（tracer-drive 跑在**重建**代码上），非 0 → `drive-failed`；
  4. 皆过 → `{ passed:true }`。`Stage2Result = { passed; reason?; failures? }`。参数化以便 toy 自证 / 真 MVD 跑。
### DoD
- [ ] `bun test src/test/stage2-gate.test.ts`
- [ ] `! grep -rq 'Agent(' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase C: M1 gate 入口 + 记录（显式 gate；真 manifest 只经 CLI，绝不进 in-suite）
### Tests (write first)
- `src/test/stage2-gate-record.test.ts`：`recordStage2Gate(result, appendLine)` → 断言写一条结构化记录（gate_type='stage2'、passed、reason/failures、rebuild provenance、timestamp 注入）。
### Implementation
- `src/harness/stage2-gate.ts`：`recordStage2Gate(result, appendLine)` 追加一行 JSON。
- `src/cli.ts`：`engine stage2-gate --rebuilt <path>` —— 用 `MVD_SOURCE_FILES/MVD_TEST_FILES` + tracer entry 跑 `runStage2Fixpoint`，`recordStage2Gate` 到 docs/research/gcl-events.jsonl，passed=false → 非 0 退出。**真 manifest 路径只经此 CLI**，in-suite 自证只碰 toy（architect E）。
### DoD
- [ ] `bun test src/test/stage2-gate-record.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- 判据 = **套件绿 ∧ 重建驱动器能驱 tracer 到 fixpoint**（自应用；行为，非字节一致）。单靠"过套件"退化成 Stage 1（architect C）。
- gate 跑在**独立重建树** `rebuiltRepoPath`，绝不原地重跑当前树（防退化 600.6）；隔离真核/真板。
- **本 task 不产出 guard#2 解除事件**：真 live 全量自host 重建（引擎驱 + 真 worker 从契约重造实现）是 soak；本 task 交付 gate 机制+判据+三态自证。guard#2 由 soak 的 `stage2 passed:true` 记录解除。E1 不得据本 task done 视 guard#2 清（architect B）。
- child `bun test` cwd=temp rebuiltRepoPath，不上溯父 bunfig/套件；真 manifest 只经 CLI，不进默认 `bun test`（防递归/串台，architect E）。
- gate 在 harness（可 spawn），`src/engine` 核不含 spawn（seam）。
- 不做 vN→vN+1 升级流水线（§15.1 后半）。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iter1: independent architect NEEDS_REVISION. 5 defects folded into re-plan:
D0 (blocker): pre-existing src/test/engine-stage2-selfhost-fixpoint.test.ts is a STUB (6th instance) — reconstructs pipeline by JSON.parse of test-planted descriptions; rebuilds 0 source, drives 0 worker, runs 0 suite on rebuilt tree. Phase 0 DELETES it.
C (crux): 'rebuild passes MVD_TEST_FILES' is tautological (tests=spec) → collapses to Stage 1. Fix: gate criterion = suite-green AND rebuilt driver drives a tracer to fixpoint (self-application, run inside rebuiltRepoPath). Added broken-drive fixture (units pass but driver can't drive → passed:false).
B (framing): this task delivers the VERIFIER/instrument, NOT a passing run → does NOT satisfy guard#2. guard#2 discharged only by a recorded real-rebuild stage2 passed:true (soak). Reworded; E1 must not treat 600.10-done as guard#2 cleared.
D: manifest-necessity test (removing any MVD_SOURCE_FILES entry breaks suite).
E: child bun test cwd isolation (temp rebuiltRepoPath, no parent bunfig/suite); real manifest only via CLI, never in-suite.

claimed: 2026-07-04T09:37:39Z

Phase 0 ✓ 2026-07-04T09:49:43Z
DoD #1: PASS — bunx tsc --noEmit
Phase A ✓ 2026-07-04T09:49:43Z
Phase B ✓ 2026-07-04T09:49:43Z
Phase C ✓ 2026-07-04T09:49:43Z
DoD #2: PASS — bunx biome check src/engine/ src/types/ src/harness/ src/test/ (8 warnings, 0 errors)
DoD #3: PASS — bun test stage2-no-fake/manifest/gate: 11 tests pass

Completed: 2026-07-04T09:51:04Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit
- [ ] #2 bunx biome check src/engine/ src/types/ src/harness/ src/test/
- [ ] #3 bun test src/test/stage2-no-fake.test.ts src/test/stage2-manifest.test.ts src/test/stage2-gate.test.ts
<!-- DOD:END -->
