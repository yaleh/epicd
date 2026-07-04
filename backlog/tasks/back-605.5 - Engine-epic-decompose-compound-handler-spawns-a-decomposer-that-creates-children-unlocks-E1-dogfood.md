---
id: BACK-605.5
title: >-
  Engine epic-decompose: compound handler spawns a decomposer that creates
  children (unlocks E1 dogfood)
status: 'Basic: Needs Human'
assignee: []
created_date: '2026-07-04 08:04'
updated_date: '2026-07-04 08:14'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.4
parent_task_id: BACK-605
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
M1 已证明引擎自治跑**真 Basic task**。但 `src/engine/driver.ts` 对 **compound/epic → `needs-human` stub**（不会 decompose）。所以 **epic 还不能被引擎自驱**——E1（epic）作第一个引擎自驱 dogfood 卡在这里。本 task 让引擎能 **decompose 一个 epic**：为其创建 children、推进到 awaiting-children。

## 关键设计难点（须在 refine 解决）
- **compound 检测**：现 `isPrimitive(task) = 无 subtasks`。但**未 decompose 的 epic 没有 children → 会被误判 primitive 去执行**。须靠**存储的 `role: compound`**（ADR-011 D-1.1「预声明意图时存储」）区分。→ (a) `isPrimitive`/新 `isCompound` 读 `task.role`（compound=显式或有子）；(b) E1–E7 等 epic 须带 `role: compound`（设值/回填，协调 E1）。
- **decomposer = 真 worker（spawn seam）**：compound handler 经**注入的 spawn primitive** 起一个**真 claude 决composer worker**，读 epic 的 plan（Sub-Task Decomposition 骨架）→ **创建 child tasks**（带引擎字段 pipeline_id/phase/parent；经 CLI/IssueSource）→ park 至 backlog/ready。引擎 core 不 spawn（seam 纪律，`! grep -rq 'Agent(' src/engine`）。对应 baime `epic-ready` 决composer。
- **推进**：decompose 成功 → epic phase → `awaiting-children`；失败/无子 → needs-human。
- **幂等**：重跑不得重复建 children（cap/已存子检测）。

## 范围
- compound 检测（读 role）+ driver 的 compound 分支从 stub 改为 decompose handler。
- decomposer worker（harness，注入 spawn primitive）+ 创建 children 的引擎侧写入（pipeline_id/phase/parent 落对）。
- 推进 epic → awaiting-children；幂等守卫。

## 非目标（后续/其它）
- **epic evaluate**（all-children-terminal → done/needs-human）= 单独一件（可 605.6）——本 task 只做 decompose。
- 多 pipeline / 插件打包（E5 其余）。

## 依赖 / 边界
BACK-605.4（M1 worker 链就位）。decomposer 复用 605.1 的 spawn seam + 605.2 的 worktree（若在 worktree 内建子，须协调；或 decompose 直接在主板建子、不走 worktree——refine 决定）。

## 参考
ADR-011 D-1.1（role 派生/预声明）；execution-class.puml（Decompose/Evaluate）；`src/engine/driver.ts`（compound→needs-human stub）、`adjudicate.ts`（isPrimitive）；baime `handle`/`epic-ready` 决composer（参照）；E1（BACK-601）plan 骨架（被 decompose 的对象）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: engine epic-decompose

Proposal: 见本任务 Description。**依赖 BACK-605.4。**

> 设计裁决：**compound 检测靠存储 `role`**（未 decompose 的 epic 无子，不能靠子数判）。**decomposer = 真 worker（spawn seam），但不走 worktree**——children 是主板 artifact，直接在 repo root 建（区别于 primitive execute 的 worktree+merge）。引擎 core 不 spawn（`! grep -rq 'Agent(' src/engine`）。

## Phase A: compound 检测 + driver 分支到 decompose handler
### Tests (write first)
- `src/test/engine-compound.test.ts`：`isCompound(task)` = `task.role==='compound' || (task.subtasks?.length>0)`；`isPrimitive` = `!isCompound`；driver 遇 compound machine-phase → 调**注入的 decompose handler**（fake）而非 `phase:needs-human` stub；primitive 仍走 execute。
### Implementation
- `src/engine/adjudicate.ts`（或新 `role.ts`）：`isCompound`；`isPrimitive` 改为 `!isCompound`。`src/engine/driver.ts`：compound 分支从 needs-human stub 改为调注入的 `decompose(task)`。
### DoD
- [ ] `bun test src/test/engine-compound.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: decomposer worker（建 children）+ 推进 awaiting-children
### Tests (write first)
- `src/test/engine-decompose.test.ts`：注入 fake decompose primitive → 引擎调它（brief 含 epic id/plan、目标 repo root）→ 断言其后 epic phase → `awaiting-children`；primitive 报无子/失败 → `needs-human`。
### Implementation
- `src/harness/decomposer.ts`：`makeDecomposer(spawnPrimitive)` → `decompose(task, repoPath)`：cwd=repoPath（**无 worktree**），spawn primitive 带 brief（"读 epic 的 Sub-Task Decomposition，用 `backlog task create --parent <id> --status 'Basic: Ready'` 建 children，并写 `pipeline_id: execution` / `phase: ready`"）；建完引擎置 epic `phase=awaiting-children`。`src/cli.ts` 注入真 primitive（复用 `realSpawnPrimitive`，cwd=repo）。
### DoD
- [ ] `bun test src/test/engine-decompose.test.ts`
- [ ] `! grep -rq 'Agent(' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase C: 幂等 + role=compound 数据
### Tests (write first)
- `src/test/engine-decompose-idempotent.test.ts`：epic 已有 children 或 `cap:decompose=done` → 重跑不重复建（skip）；无守卫时会重复（红→绿证明守卫生效）。
### Implementation
- decompose 前查已存 children / `cap` 标记；已 decompose → skip + 保持 awaiting-children。为 E1–E7 epic 加 `role: compound`（一次性设置脚本或 `backlog task edit`）——使引擎认得它们是 compound。
### DoD
- [ ] `bun test src/test/engine-decompose-idempotent.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- decomposer = 真 worker（spawn seam），引擎 core 不 spawn；**decompose 不走 worktree**（主板建子）。
- 依赖 605.4；**epic evaluate（all-children-terminal → done/needs-human）= 单独件（605.6），不在本 task**。
- 幂等：重跑不重复建 children（已存子 / cap 守卫）。
- E1–E7 epic 须带 `role: compound`，引擎才认得（本 task 设值或 E1 回填协调）。
- 真 decompose 的 e2e（真 decomposer 建出真 children）由 sandbox/soak 证明，非 bun-test。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iter1: NEEDS_REVISION（independent architect，GCL E=4 C=2 H=2）——**结构性，非机械修复**。发现隐藏前置依赖（当前不存在）：
① `role` 字段不存在（type/parser/serializer 都无）→ isCompound 永读 undefined。
② `backlog task create` 不设 pipeline_id/phase → decomposer 建的 children **引擎 scan 看不见**（run.ts 按 pipeline_id===execution 过滤）。
③ spawn 措辞：复用 realSpawnPrimitive（非 realSpawn/withWorktree）+ 自己的 brief builder（buildBrief 硬编码 worktree）。
④ phase 转移：complete() 线性推进（ready→decomposing→awaiting-children），直设 awaiting-children 会跳过 decomposing。
⑤ 幂等：driver 已 withCapGuard 包，别另造 cap:decompose；用“已有 children”检。
⑥ 主板写 children 的 commit 语义（autoCommit=false、无 worktree merge）未定。
⑦ role:compound 回填 E1–E7 作可执行 DoD。
**根因：①② 是 E1 field-registry 内容。bootstrap 环：引擎驱 E1 需 decompose，decompose 需 E1 schema，E1 schema 不能被引擎驱→E1 schema slice 是手动前置。** 待人定 re-scope（拆前置 schema task / 前移 E1 schema slice / fold）后再继续 605.5。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
