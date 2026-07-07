---
id: BACK-613
title: >-
  engine complete DoD gate: run structured executable dod, not prose
  definitionOfDoneItems (fix false needs-human)
assignee:
  - '@claude'
created_date: '2026-07-04 14:17'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 25000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么（BACK-605.8 manual-soak 拉出的系统性缺陷）
用 epicd-run monitor 真跑 BACK-611(E1 子任务)时,实现本身 green,却被 engine complete honestly 判为 needs-human、不合并。根因经证据定位:

**runDoD 读错字段。** src/harness/dod-runner.ts 把每条 task.definitionOfDoneItems[].text 当 sh -c 执行——但 definitionOfDoneItems 是 ## Definition of Done 里的**人面 prose 勾选框**(默认模板文案,如 'bunx tsc --noEmit passes when TypeScript touched')。作为 shell 跑:#1→exit2 FAIL、#2→exit0 **SPURIOUS PASS(不确定性!)**、#3→exit2 FAIL(括号语法错)。于是**任何带默认 prose DoD 的真任务都被误判 needs-human**,且个别 prose 偶然 exit0 造成假过。

而 Task 模型其实**已有**结构化可执行 DoD 字段:dod?: DoDItem[](src/types/index.ts:90),是 BACK-609 已落地的 field-registry 描述符(yamlKey dod, type dod)。runDoD 本应跑**这个**结构化 dod(shell 命令),而非 prose 勾选框。

**Phase E 集成测试为何没抓到:** 它用合成的 true/false 作 DoD gate,从未跑 prose——正是 DoD-绿但机制坏 的老元模式(同 decompose stub / 假 Stage-2 test),只被 soak 抓到。

## 范围
1. **runDoD 改读结构化 task.dod**(可执行 DoDItem[].text),不再执行人面 definitionOfDoneItems prose。
2. **authoring 产出结构化 dod**:feature-to-backlog/task 模板须把 plan 的 DoD/Acceptance **可执行命令**写进结构化 dod 字段(现在只写了 prose 勾选框)。CLI task create/edit 需能设结构化 dod。
3. **空 dod 语义**:completeTask 现在 empty dodResults→needs-human(安全默认)。须区分'无可执行 gate(authoring 缺陷,显式报错)'与'gate 全过'。
4. **回归/契约测试**:用**真 prose 勾选框 + 真结构化 dod**两种 fixture 覆盖 runDoD/engine complete,替代 Phase E 的合成 true/false(其盲区正是本 bug)。

## 非目标
- 不改 label(role,phase)/E1 其余。
- 不在此 task 里完成 BACK-611(它 blocked 于本 fix;修好后回去重跑 engine complete)。

## 参考
BACK-605.8(soak 记录含完整证据);BACK-611(被 blocked 的实现,worktree /home/yale/work/epicd-BACK-611 + branch task/BACK-611 保留);src/harness/dod-runner.ts;src/engine/complete.ts(ENG-8 empty→needs-human);src/types/index.ts:72(prose)/:90(结构化 dod);src/core/field-registry.ts:222(dod 描述符);BACK-609(已落地 dod 描述符但无人填)。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: engine DoD gate reads structured executable dod (fix false needs-human)

## Phase A: runDoD reads structured task.dod (executable), not prose definitionOfDoneItems
### Tests (write first) — src/test/dod-runner-structured.test.ts
- runDoD runs each task.dod[].text as sh -c in cwd: dod=[{text:'true'}] → [{passed:true}]; dod=[{text:'false'}] → [{passed:false}].
- runDoD IGNORES definitionOfDoneItems (prose): task with definitionOfDoneItems=[{text:'bunx tsc --noEmit passes when TypeScript touched'}] and empty dod → returns [] (no prose executed).
- empty/absent dod → returns [].
### Implementation
- src/harness/dod-runner.ts: read task.dod (DoDItem[]) instead of task.definitionOfDoneItems. Update doc comment.
### DoD
- [ ] bun test src/test/dod-runner-structured.test.ts
- [ ] bunx tsc --noEmit

## Phase B: CLI can set structured executable dod gates
### Tests (write first) — src/test/cli-dod-gate.test.ts
- task create --dod-gate 'bunx tsc --noEmit' → persisted structured dod=[{text:'bunx tsc --noEmit',checked:false}] in frontmatter; definitionOfDoneItems (prose) untouched.
- task edit --dod-gate '<cmd>' appends to structured dod.
### Implementation
- src/cli.ts: add --dod-gate <cmd> (accumulator) to task create + edit; plumb to set task.dod via updateTask (serialized by field-registry dod descriptor). Keep --dod → prose (unchanged).
### DoD
- [ ] bun test src/test/cli-dod-gate.test.ts
- [ ] bunx tsc --noEmit

## Phase C: end-to-end — engine complete on structured dod (contract test replacing Phase-E synthetic gates)
### Tests (write first) — src/test/engine-complete-structured-dod.test.ts
- temp board+worktree: task with structured dod=[{text:'true'}] → engine complete merges → phase=done.
- structured dod=[{text:'false'}] → needs-human, no merge.
- empty structured dod → needs-human, no merge (safe default: no machine gate declared).
### Implementation
- none beyond A/B (uses engine complete CLI + completeTask).
### DoD
- [ ] bun test src/test/engine-complete-structured-dod.test.ts
- [ ] bunx tsc --noEmit

## Constraints
- definitionOfDoneItems (prose ## Definition of Done) stays human-facing, NEVER executed.
- empty structured dod → needs-human (do not auto-merge ungated tasks).
- Out of scope (follow-up): feature-to-backlog authoring emitting structured dod; unifying the two dod representations; BACK-611 completion (separate — will set its dod + re-run engine complete after this lands).

## Acceptance Gate
- [ ] bun test
- [ ] bunx tsc --noEmit
- [ ] bun run check .
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged to main (a-series HEAD). Fixed the DoD-green-but-broken defect from BACK-605.8 soak: runDoD now re-runs STRUCTURED task.dod (shell gates) instead of prose definitionOfDoneItems (which was sh-c'd → false fails + spurious passes). Added --dod-gate CLI (create+edit) + TaskCreateInput.dodGates to populate structured gates. Empty structured dod → needs-human (never auto-merge ungated). adjudicate confirmed coherent: with dodResults present it uses ENG-8 path (ignores prose), so passing structured gates → done regardless of prose defaults. Migrated runDoD/engine-complete-cli/epicd-run-integration tests to structured gates; consolidated 2 runDoD test files → engine-dod-runner.test.ts (net: 8 files, +158/-17). Plan deviation (noted): folded Phase-C new file into engine-complete-cli.test.ts + Phase-A test into engine-dod-runner.test.ts to avoid duplication. Independently verified on main: tsc PASS; 16/16 affected; biome exit 0; full suite green modulo known parallel-load timeout flakes (config/milestone, pass standalone). Unblocks BACK-611 (set its --dod-gate + re-run engine complete).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
