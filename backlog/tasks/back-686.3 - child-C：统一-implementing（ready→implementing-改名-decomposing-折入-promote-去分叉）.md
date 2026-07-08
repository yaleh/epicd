---
id: BACK-686.3
title: child C：统一 implementing（ready→implementing 改名 + decomposing 折入 + promote 去分叉）
assignee:
  - '@claude'
created_date: '2026-07-08 04:00'
updated_date: '2026-07-08 07:10'
labels:
  - 'kind:basic'
  - 'area:engine'
  - 'area:runtime'
dependencies:
  - BACK-686.1
references:
  - docs/proposals/2026-07-08-pipeline-driving-and-queue-mechanism.md
parent_task_id: BACK-686
priority: high
ordinal: 99000
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
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态：authoring/draft。规格来自 proposal §10/§11。序列最后一步（A1 → (A2 ∥ B) → C），依赖 child A 的 entry_phase。走 authoring→refining 钉死 plan 后再 promote。

## 背景

现状 decompose 决策在 promote 时靠 `kind:epic` label 静态分叉（cli.ts:4560-4565 `isEpic ? decomposing : ready`）。但"该不该拆"是 CLAUDE.md 两段式 decompose test，是钻进 task 才做得出的判断。且 `ready` 是被合并掉的 ready/in-progress 队列态残留，不描述行为——"排队 vs 在跑"已确立为 claim 轴（child A）。

## 目标（proposal §11.3 child C）

统一入口为 `implementing`；分解退化为 implementing 内部分支；承重改名一次到位。递归 Task 字面成立：implementing 是唯一"把这个 task 做完"phase，分解只是它选择委派给子 task。

## Acceptance Criteria

- [ ] #1 [承重改名] `ready→implementing`：backfill 现有 `ready` 态 task 的 phase；`grep -r '\"ready\"' src/engine/pipeline.ts` 为空；引用点(pipeline.ts/dispatch.ts renderBasicReadyDispatch/handle-basic-ready.sh/run.ts/测试)一次性 sweep；lint 挡回流
- [ ] #2 `engine promote` 去分叉：删除 `isEpic ? decomposing : ready`，恒落 `implementing`；有测试断言 epic 与 primitive promote 后都落 implementing
- [ ] #3 decompose 决策移入 implementing 的 skill：primitive-executor 跑 decompose test，判 compound 时 invoke `epic-decompose` 子能力建子提议 → 引擎建子 → 推进 `awaiting-children`；有测试覆盖叶子路径与 compound 分支
- [ ] #4 [decomposing 退役] `decomposing` 从 pipeline.ts、phase-coverage.json、backfill 表移除；`makeDecomposer` 的建子+幂等逻辑迁入 implementing compound 分支；backfill 现有 `decomposing` 态 task 到 implementing；`decomposing→epic-ready` dispatch 分支迁移/删除
- [ ] #5 `kind:epic` 从 gate 降为 hint：promote 不再读它分叉，改由 implementing 的 decompose test 作先验（可被推翻——标 kind:epic 但小则走叶子、未标但大则拆）；有测试覆盖两种推翻
- [ ] #6 分支汇入 adjudicating，不流回 implementing；"流回"只经 guarded retreat→entry_phase(=implementing)；有测试覆盖 decomposition-layer 缺口的单步回退
- [ ] #7 `draft→drafting`、`spike→spiking` 改名（同批），registry/pipeline/skill frontmatter 同步；有测试断言新 phase 名合法、旧名不再出现
- [ ] #8 [自举 meter] 引擎用新 implementing 驱动一个真实 epic（内部判 compound → 建子 → awaiting-children → 汇 adjudicating gate → done）到底；有集成测试端到端跑通，全程不依赖 monitor/任何外部 driver
- [ ] #9 已发布 MCP tool 名称、CLI 子命令签名不改；`grep -r 'mcp__backlog__' plugin/.claude-plugin/` 与 `bun run cli --help` 命令签名相较改动前一致
- [ ] #10 execution phase 数 7→5：`implementing / awaiting-children / adjudicating / needs-human / done`；有测试断言 pipeline.ts 恰含这 5 个 execution phase

## 自举安全序约束（proposal §11.5，本 child 承重）

- `decomposing` 不能在有 in-flight epic 用它时删——过渡期引擎同时认新旧、或先排空、或 stop-the-world backfill。
- `ready→implementing` 的 backfill 与引擎读取路径同批切，杜绝"board 是 ready、代码只认 implementing"的空窗。
- 本 child 用**旧机制**实现、落地后**新机制**才自洽——AC#8 的自举 meter 是必过门。

## 改动范围 / 非目标

- 不做 claim 记录 / reaper（child A）、不做 kind 绑定 / evaluating 折叠本身（child B，本 child 假定 B 已定义 gate）。

## 依赖

- 依赖 child A（BACK-686.1）的 entry_phase（AC#6 retreat→implementing）。
- 若与 child B 的 pipeline.ts/dispatch.ts 改动物理冲突，refining 时决定"B 先落 C 再叠"或合并（合并恐超 ~2000 行，倾向拆）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: child C：统一 implementing（ready→implementing 改名 + decomposing 折入 + promote 去分叉）

## Phase A: `ready` → `implementing` rename, one sweep (AC#1)
### Tests (write first)
- `src/test/pipeline.test.ts` (extend): `execution` pipeline declares `implementing`, not `ready`; `grep -r '"ready"' src/engine/pipeline.ts` (run as a test assertion, not just CI grep) returns empty.
- `src/test/engine-fields-backfill.test.ts` (extend): a task with legacy `phase: "ready"` is backfilled to `phase: "implementing"` by the same idempotent backfill path `src/core/engine-fields-backfill.ts` already uses for other legacy-status migrations.
- Sweep every hardcoded `"ready"` phase-value assertion in the existing suite (`engine-*.test.ts`, `web-lifecycle-conformance.test.ts`, `status-label-projection.test.ts`, `pipeline.test.ts`, and any other hit from `grep -rln '"ready"' src/test`) to expect `"implementing"` instead — this IS the rename's regression net, not optional cleanup.

### Implementation
- `src/engine/pipeline.ts:17`: rename `{ name: "ready", ... }` → `{ name: "implementing", ... }`.
- `src/cli.ts`: every literal `"ready"` phase reference (including the promote fork at ~4562, addressed fully in Phase B) becomes `"implementing"`.
- `src/engine/dispatch.ts`: `renderBasicReadyDispatch` (and any sibling render function keyed to the `ready` phase name) is renamed/updated to `implementing` — the phase name inside its generated prompt text must match, since dispatch prompts are read by workers/skills that key off phase name.
- `src/core/engine-fields-backfill.ts`: add a `ready → implementing` resolver entry alongside the existing legacy-status resolvers (same idempotent, patch-only-if-changed pattern already used for other migrations — no new backfill mechanism).
- Add a lint/CI guard (e.g. a Biome/grep check wired into `bun run check .` or a dedicated test) that fails if a new literal `"ready"` phase-value string is reintroduced under `src/engine/` — this is AC#1's "lint 挡回流".

### DoD
- [ ] `bun test src/test/pipeline.test.ts src/test/engine-fields-backfill.test.ts`
- [ ] `grep -rn '"ready"' src/engine/pipeline.ts` (expect no output)
- [ ] `bun test` (full sweep — every test touched by the rename must be green before moving on, since later phases build on this one)

## Phase B: `engine promote` de-forks; `kind:epic` becomes a hint (AC#2, AC#5)
### Tests (write first)
- `src/test/cli-promote.test.ts` (new, or extend an existing promote test): both an epic-labeled task and a plain primitive task land on `phase: "implementing"` after `engine promote` — the `isEpic ? "decomposing" : "ready"` ternary (`src/cli.ts` ~4560-4567) is gone, replaced by an unconditional `phase: "implementing"`.
- `src/test/engine-decompose-precedence.test.ts` (new): two override cases — a task labeled `kind:epic` but small (fails the CLAUDE.md decompose-size test) still resolves to the **leaf** branch inside `implementing`; a task with no `kind:epic` label but that independently passes the decompose test still resolves to the **compound** branch. Both prove `kind:epic` is now an overridable hint, not a promote-time gate.

### Implementation
- `src/cli.ts` promote command: delete the `isEpic` ternary; `phase` is unconditionally `"implementing"` (the compound/leaf decision moves entirely into the `implementing` skill, Phase C).

### DoD
- [ ] `bun test src/test/cli-promote.test.ts src/test/engine-decompose-precedence.test.ts`

## Phase C: decompose decision folds into `implementing`; `decomposing` retires (AC#3, AC#4)
### Tests (write first)
- `src/test/primitive-executor-decompose-branch.test.ts` (new): drives `implementing`'s skill logic on a leaf task (stays/executes as leaf) and on a compound task (runs the CLAUDE.md decompose test, invokes the `epic-decompose` sub-capability, children get created, task advances to `awaiting-children`) — both branches asserted from one entry point.
- `src/test/engine-fields-backfill.test.ts` (extend further): a task with legacy `phase: "decomposing"` backfills to `phase: "implementing"`.
- `src/test/phase-skill-coverage.test.ts` / registry test (extend): `decomposing` no longer appears as a registered phase in `plugin/skills/phase-coverage.json`.
- `src/test/engine-dispatch.test.ts` (extend): the `decomposing → epic-ready` dispatch branch in `src/engine/dispatch.ts` is gone (grep-style assertion, mirroring Phase B (child B)'s AC#3 pattern).

### Implementation
- `plugin/skills/primitive-executor/SKILL.md`: add a Phase-0 branch — run the CLAUDE.md two-part decompose test; compound → invoke `epic-decompose`'s child-proposal logic as a sub-capability (not a separate phase/skill dispatch); leaf → proceed with primitive execution as today.
- `src/harness/decomposer.ts`: `makeDecomposer`'s children-creation + idempotency logic (live-board check for existing `parent_id` children, `applyProposedChildren`) is reused by/inlined into the `implementing` compound branch, not deleted — same function, new caller.
- `src/engine/pipeline.ts`: remove the `decomposing` state from `executionPipeline.states`.
- `plugin/skills/phase-coverage.json`: remove the `decomposing` entry.
- `src/core/engine-fields-backfill.ts`: add a `decomposing → implementing` resolver (same batch as Phase A's `ready` resolver — both land in the same backfill pass per the task's own bootstrap-safety note that the rename and backfill must ship atomically).
- `src/engine/dispatch.ts`: remove the `decomposing → epic-ready` dispatch-prompt branch (its logic is now inline inside the `implementing` skill's own compound path, not a separately dispatched phase).
- Retire `plugin/skills/epic-decompose/` as a standalone dispatched-phase skill — its child-proposal contract becomes a sub-capability the `primitive-executor` skill invokes directly, per the folding this task's title calls for.

### DoD
- [ ] `bun test src/test/primitive-executor-decompose-branch.test.ts src/test/engine-fields-backfill.test.ts src/test/phase-skill-coverage.test.ts src/test/engine-dispatch.test.ts`
- [ ] `grep -rn '"decomposing"' src/engine/pipeline.ts plugin/skills/phase-coverage.json` (expect no output)

## Phase D: forward-only guard — compound branch joins `adjudicating`, never flows back to `implementing` except a guarded retreat (AC#6)
### Tests (write first)
- `src/test/engine-implementing-no-flowback.test.ts` (new): the compound branch's forward path (`implementing → awaiting-children → adjudicating`) never re-enters `implementing` directly; the ONLY path back to `implementing` is `recordRetreat` (`src/engine/retreat.ts`) targeting `task.entry_phase === "execution/implementing"` — assert a decomposition-layer gap retreat lands exactly one step back on `implementing` via the existing single-step guard (`assertSingleStepRetreat`), reusing child A's retreat machinery with no new retreat mechanism.

### Implementation
- No new retreat code — this phase only adds the missing test coverage proving the existing `src/engine/retreat.ts` guard (child A/BACK-682) correctly rejects any non-retreat forward-flow attempt back into `implementing`, now that `implementing` is also the compound-decision phase.

### DoD
- [ ] `bun test src/test/engine-implementing-no-flowback.test.ts`

## Phase E: `draft→drafting`, `spike→spiking` rename, same batch (AC#7)
### Tests (write first)
- `src/test/pipeline.test.ts` (extend): `authoringPipeline` declares `drafting` not `draft`; `explorationPipeline` declares `spiking` not `spike`; legal-phase assertions updated.
- Sweep every other hardcoded `"draft"`/`"spike"` phase-value assertion identified by survey (`src/test/engine-fields-backfill.test.ts`, `src/test/cli-create.test.ts`, `src/test/task-path.test.ts`, `src/test/enhanced-init.test.ts`, `src/web/lib/driver-indicator.test.ts`, `src/test/exploration-pipeline.test.ts`, `src/web/lib/lanes.test.ts`, `src/test/prefix-config.test.ts`) to expect the new names.

### Implementation
- `src/engine/pipeline.ts:38,68`: rename `draft`→`drafting`, `spike`→`spiking`.
- `src/core/engine-fields-backfill.ts`, `src/utils/prefix-config.ts`, `src/core/backlog.ts`, `src/engine/exploration-handlers.ts`, `src/types/index.ts`: update every literal phase-name reference found by the same sweep discipline as Phase A.
- Registry/skill frontmatter referencing `draft`/`spike` as a phase name (not the general English word) updated in the same commit.

### DoD
- [ ] `bun test src/test/pipeline.test.ts`
- [ ] `bun test` (full sweep, same discipline as Phase A)

## Phase F: bootstrap self-hosting meter (AC#8)
### Tests (write first)
- `src/test/engine-implementing-self-host-e2e.test.ts` (new, modeled directly on `src/test/engine-autonomous-e2e.test.ts`'s `runEngine` + `realSpawn` seam + `WorkerRunner` test-double pattern, no monitor/external driver involved): drives one real epic task end-to-end — `implementing` (internally judges compound) → creates children → `awaiting-children` → children resolve → `adjudicating` gate (child B) → `done` — asserted via the engine's own `runEngine`/`Driver.tick` loop only.

### Implementation
- None beyond wiring the test double the same way `engine-autonomous-e2e.test.ts` already does — this phase is proof, not new production code; if it surfaces a gap in Phases A-D's wiring, fix that phase's implementation, don't add new mechanism here.

### DoD
- [ ] `bun test src/test/engine-implementing-self-host-e2e.test.ts`

## Constraints
- No claim/reaper work here (child A, `BACK-686.1`) and no `kind` binding / evaluating-fold mechanics themselves (child B, `BACK-686.3` assumes B already defines the `adjudicating` gate it joins into — Phase D above only proves the join, doesn't build the gate).
- Bootstrap-safety (proposal §11.5): the `ready→implementing` rename (Phase A) and its backfill must land in the same commit/PR as each other — never a window where the board shows `ready` but the engine only recognizes `implementing`. Same discipline for `decomposing`'s retirement (Phase C): don't delete the phase from `pipeline.ts` before the backfill migrating any live `decomposing` task has run.
- If Phase C's `decomposing`-removal physically conflicts with child B's `pipeline.ts`/`dispatch.ts` edits (both touch the same files), resolve at merge time by rebasing this child onto B's merged state — don't try to land both in one commit.
- This task is implemented with today's *existing* mechanism (skills, CLI); AC#8's self-hosting meter is what proves the *new* `implementing`-centric mechanism is self-consistent once landed — it is a required gate, not optional polish.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `grep -c '"name":' src/engine/pipeline.ts` and manual count confirms `executionPipeline.states` has exactly 5 entries: `implementing, awaiting-children, adjudicating, needs-human, done` (AC#10)
- [ ] `grep -rn 'mcp__backlog__' src/mcp/tools/ | sort > /tmp/mcp-tools-after.txt && diff /tmp/mcp-tools-before.txt /tmp/mcp-tools-after.txt` (AC#9: MCP tool names unchanged — snapshot `/tmp/mcp-tools-before.txt` from `main` before starting implementation)
- [ ] `bun run cli --help` output diffed against a pre-change snapshot shows no subcommand signature changes (AC#9)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/refining review: APPROVED after 1 iteration(s)

claimed: 2026-07-08T05:38:06Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
