---
id: BACK-627
title: engine phase→status 派生集中到 updateTask，消除 BACK-622 逐点 bandaid
assignee:
  - '@claude'
created_date: '2026-07-05 05:28'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:refactor'
dependencies: []
ordinal: 40000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么

BACK-622 修了 decomposer 的 phase/status 失配，但方式是在每个转换点手写 `status: label(roleOf(t), phase)`。这是 bandaid：同样的三行咒语现已在 decomposer.ts（×3 + child-create 硬编码 primitive）、engine/complete.ts（×3）、engine/driver.ts、cli.ts 重复约 8 处。每个未来新增的 phase 转换点都必须记得补 status，否则悄悄重新引入同类失配。BACK-617 曾加过一次同类同步、BACK-622 又发现漏了一处——这个 bug 类未被关闭。

## 核心洞察：派生值已在唯一持久化边界算出又被丢弃

Core.updateTask（src/core/backlog.ts:1108）每次写入已计算 newStatus = displayStatus(task, callbackStatuses)——对有 phase 的任务即 label(roleOf(task), phase, statuses)——但只用于变更回调比较，随后 fs.saveTask 持久化调用方传入的原始 status。把该派生值在 saveTask 前写回 task.status，所有引擎写入者自动同步，约 8 处逐点 status: label(...) 全部可删。派生逻辑属于 updateTask，不属于每个调用点。

## 目标

- updateTask 中：若 task.phase，令 task.status = displayStatus(task, callbackStatuses) 在 saveTask 前落盘。无 phase 的任务是 no-op（安全）。
- 删除 decomposer.ts / complete.ts / driver.ts / cli.ts 逐点的 status: label(roleOf(...), phase) 写入。
- create 路径（createTaskFromInput）单独处理，见发现 #2。

## 顺带修掉的 code review 发现（2026-07-05, e2c143b..HEAD）

- #2 correctness：decomposer.ts:143 child-create 强制 status:'Basic: Ready'，在不声明该 status 的看板（默认 [To Do,In Progress,Done] 或外部消费者看板，CLAUDE.md Agent POV）上 createTaskFromInput→requireCanonicalStatus 抛错 → 创建 0 子任务、epic 卡死、re-dispatch 循环。本仓 config 含 Basic: Ready 故本地安全，仅外部/默认看板触发。修法：create 恢复 omit-status，或中心派生对 create 生效。
- #3 correctness：decomposer 的 label(roleOf(t), phase) 全部漏传第三个 statuses 参数 → title-case fallback，在非 title-case 看板持久化 off-vocabulary 大小写。中心化顺带修复。
- complete.ts:61 linear-advance complete() 仍无 status——BACK-622 遗漏的同类点，当前仅测试调用，潜伏。中心化后自动覆盖。

## 非目标

- 不改 phase 语义、不改 displayStatus 读取面。
- 不触碰 BACK-625 dispatch/transport 层。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 updateTask 对有 phase 的任务在 saveTask 前将 task.status 设为 displayStatus(task, config.statuses)；无 phase 的任务 status 不变（回归测试覆盖两种情况）
- [x] #2 删除 decomposer.ts/complete.ts/driver.ts/cli.ts 逐点 status: label(...) 写入后，所有引擎 phase 转换（含 complete() linear-advance）的 displayed status 仍与 phase 一致——无逐点 status 写入残留
- [x] #3 在默认 [To Do, In Progress, Done] 看板上 decompose 成功创建子任务、不再因 createTaskFromInput 校验抛错（回归测试，覆盖 review 发现 #2）
- [x] #4 phase→status 派生使用 config 声明的 statuses 词表（非 title-case fallback），非 title-case 看板不再持久化 off-vocabulary 大小写（发现 #3）
- [x] #5 bunx tsc --noEmit 干净；bun run check 干净；bun test 相关套件全绿
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-05 实现（BACK-627 in the ignition-fixpoint iteration）：
- Core.updateTask（src/core/backlog.ts）在 saveTask 前，若 task.phase 存在则 task.status = displayStatus(task, config.statuses)，no-op 当无 phase。
- 删除 decomposer.ts(×3)/complete.ts(×3)/driver.ts(×1)/cli.ts engine promote(×1) 的逐点 status: label(roleOf(...), phase) 写入，全部改走中心化派生。
- createTaskFromInput：input.phase 存在时改为直接 label("primitive", phase, config.statuses) 派生 status，不再经 requireCanonicalStatus 校验——修复发现#2（默认看板 decompose 建子任务会因未声明 'Basic: Ready' 而抛错、epic 卡死）。
- 回归覆盖：默认看板([To Do,In Progress,Done])decompose 成功建子任务；自定义大小写词表(Basic: READY)正确解析而非 title-case fallback；updateTask 对有/无 phase 任务的行为区分；engine-merge-wire/engine-compound 既有测试改为经 displayStatus() 读取投影（不再断言 complete.ts/driver.ts 逐点写 status，因为这正是本任务要移除的 bandaid）。
- bunx tsc --noEmit 干净；bun run check . 干净；bun test --parallel 1763 pass（1 处 milestone-rename 并行隔离 flake，单独跑 10/10 通过，与本改动无关）。
- 遗留：BACK-601 之类已带 phase 的任务，仍无法经 CLI/MCP 直接把 status 设成与 phase 不一致的目标值（updateTask 会用当前 phase 覆盖）——这是预期行为（消除逐点写不代表消除"无 --phase 入口"缺口），真正的收口在 BACK-628.3（补 --phase CLI/MCP 入口）。
<!-- SECTION:NOTES:END -->
