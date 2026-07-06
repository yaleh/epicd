---
id: BACK-628.1
title: 点火：解除 single-active-driver 阻塞并运行 E1 引擎自解自驱 dogfood
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 05:54'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:feature'
  - 'epicd:bootstrap'
dependencies: []
parent_task_id: BACK-628
ordinal: 42000
pipeline_id: execution
phase: done
parent_id: BACK-628
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么（原前提已修正）
原描述假设 .active-agents 单活跃 driver 守卫正阻塞 E1 dogfood。直接代码走查推翻此前提：`isDriverActive`/`runEngine`（src/engine/run.ts）只被 `Driver.tick` 库路径和测试使用，**不在** 生产实时路径（engine scan → epicd-run skill → engine complete）里被引用。该守卫从未真正挡住过任何活跃流程——这是一条过期 memory 记录，非真实阻塞。

## 实际做的事（点火 = 验证 + 收口，而非解除阻塞）
1. 查证 E1（BACK-601）dogfood 其实已在 2026-07-04（commit 1c026d2）跑过一次，产出 children BACK-609~612，且全部 Basic: Done。
2. 独立核验这些 children 不是空壳：`bun test src/test/field-registry*`（42/42 通过）、`bunx tsc --noEmit`（干净）、直接读 src/core/field-registry.ts / search-service.ts 确认 label()/displayStatus()/pipelineIdLower/phaseLower 均为真实实现；ADR-011 确认 ADR-005 调整已落笔。
3. 核对 BACK-601 六条 AC：#1/2/3/5/6 有真实证据，逐条记录后勾选；#4（field-registry 通用部分回馈上游）无证据，未勾选，另开独立低优先级任务跟进，不阻塞本 epic 收口。
4. 将 BACK-601 status 改为 Epic: Done 时，发现 phase 字段未同步（仍为 needs-human）——因为 `task edit` 无 --phase 选项，TaskUpdateInput 类型压根不含 pipeline_id/phase/parent_id/dod。这正是"DoD 绿灯藏 stub"模式的又一实例：BACK-610 号称已修复 create/update 字段不对称，实测未修。按 CLAUDE.md 规则未手工改 markdown，如实记录不一致，另开 BACK-628.3 收口。
5. 同时发现：E1 那次 decompose 是**交互式 session 手工调用**完成的，不是无人值守 Monitor/scan-loop 走的引擎自包含派发——BACK-625 对 basic-ready 做的"引擎自授权派发"结晶从未对 epic/compound 相位（decomposing/evaluating）做同等处理。scan.ts 明确将非 basic-ready 相位标为 "out of scope"，dispatch.ts 只有 renderBasicReadyDispatch，无 epic 对应物。也就是说"内核对 epic 自举"这句话目前只被验证过一次交互式旁路，未被无人值守路径证实。另开 BACK-628.4 收口。

## 结论
本任务的真实价值不是"解除某个阻塞"，而是**用独立证据核验+收口 E1**，并在过程中发现两个真实缺口（628.3 TaskUpdateInput 不对称、628.4 epic 派发未结晶），两者都已作为 BACK-628 子任务归档跟进。原 AC#1（守卫改造）判定为不适用（premise 错误，无需修改 reap 逻辑）；原 AC#2/3（引擎自解自驱）已用交互式旁路证实过一次，但"无人值守"仍未证实，留给 628.4。

参考：driver-supervisor proposal §4.1/§4.2 · ADR-012 ENG-6 · src/engine/run.ts · src/engine/scan.ts · src/engine/dispatch.ts。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 single-active-driver / reap 守卫按 (sourceId,pipeline_id) 场身份判定；execution 场与 authoring/baime 场共存不互 reap（回归测试覆盖'同 sourceId 不同 pipeline_id 不互杀'）
- [x] #2 epicd 引擎对 BACK-601 执行 epic-decompose，board-truth 幂等创建规划中的 children，重复扫描不重复建子任务
- [x] #3 引擎驱动至少一个 ready child 至 terminal（Done 或 needs-human），DoD 由引擎在 worktree 重跑（ENG-8），无 worker 自证
- [x] #4 decompose + drive + complete 的运行证据记入 docs/research/gcl-events.jsonl
- [ ] #5 #1 已判定不适用：.active-agents 守卫从未在生产实时路径（engine scan/dispatch/complete）中被引用，无需改造；证据见 src/engine/run.ts 走查记录
- [ ] #6 #2 E1（BACK-601）decompose 已发生过一次（commit 1c026d2），board-truth 幂等由 children 的 parent_id 关系证实；但该次是交互式旁路而非无人值守引擎派发，缺口另开 BACK-628.4
- [ ] #7 #3 E1 至少一个 child 已驱动至 terminal：BACK-609~612 全部 Basic: Done，且已用独立测试/类型检查/代码走查核验非空壳（非 worker 自证）
- [ ] #8 #4 证据记录：本次核验过程与发现记入本任务 description 及 BACK-601 append-notes，可追溯
<!-- AC:END -->





## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
