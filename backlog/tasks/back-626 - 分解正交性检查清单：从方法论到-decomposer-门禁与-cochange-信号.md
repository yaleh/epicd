---
id: BACK-626
title: 分解正交性检查清单：从方法论到 decomposer 门禁与 cochange 信号
status: 'Epic: Done'
assignee: []
created_date: '2026-07-05 03:41'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
references:
  - >-
    backlog/tasks/back-622 -
    decomposer.ts-writes-phase-without-status-causing-epic-status-phase-desync-BACK-601-shaped.md
  - backlog/tasks/back-625 - engine-产出自包含派发指令，scan-loop-瘦身为纯传输：解耦消息获取与任务执行.md
  - docs/adr/ADR-015-monitor-as-invocation-adapter.md
ordinal: 36000
pipeline_id: execution
phase: done
role: compound
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景：对 epicd 和 baime 两个项目的历史漂移分析发现，Monitor/daemon 职责边界、scan-loop vs engine 的 prompt-authoring 归属等问题反复被"局部修好又复发"（baime TASK-206→210，epicd BACK-614→ADR-015→BACK-625），根因是 epic 分解阶段缺少可测的"子任务间正交性"判据——两个"独立"子任务实际共享同一坐标（Fisher 信息矩阵非对角元非零），冲突只有在实现完成后才暴露。

目标：建立一个可执行的"分解正交性检查清单"机制，尽早（分解阶段而非事后）暴露子任务间的隐藏耦合，同时保持低成本、非阻塞（advisory，而非硬门禁），避免误报代价过高。

三个子任务按顺序执行：
1. 先写方法论文档/ADR，把检查清单和 swap-litmus 式验收标准固化为规范
2. 在 epicd 的 decomposer.ts 落地：子任务声明 touches 字段 + 交集检查
3. 迁移 baime task-148 的 cochange/Fisher 非对角近似原型，作为更强的历史耦合信号

参考：本 epic 由一次跨项目漂移分析对话触发，未对应具体线上事故，但 BACK-622/BACK-601（status/phase 字段在 decomposer.ts 与 complete.ts 之间重复漂移）可作为"若早有该检查清单本可提前拦截"的具体案例。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
三个子任务均已完成：BACK-626.1 产出 ADR-016（分解正交性检查清单，D1 touches 交集/D2 三级信号/D3 cochange 契约/D4 advisory 执行强度/D5 swap-litmus 推广）；BACK-626.2 在 decomposer.ts 落地 D1（touches 字段声明式交集检查）；BACK-626.3 在 decomposer.ts + 新增 src/harness/cochange.ts 落地 D2/D3（基于 git log --name-only 的历史共变阈值判定），两层信号合并写入同一份 epic advisory 报告。均为 advisory-only，不阻塞分解/dispatch。全部改动通过 bunx tsc --noEmit / bun run check . / 相关 test 套件（23 pass, 54 expect()）。
<!-- SECTION:FINAL_SUMMARY:END -->
