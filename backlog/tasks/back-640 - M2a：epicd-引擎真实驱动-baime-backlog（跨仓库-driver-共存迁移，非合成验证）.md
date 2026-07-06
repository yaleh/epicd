---
id: BACK-640
title: M2a：epicd 引擎真实驱动 baime backlog（跨仓库 driver 共存迁移，非合成验证）
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-05 11:15'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:epic'
  - 'epicd:M2a'
dependencies:
  - BACK-605.9
ordinal: 60000
pipeline_id: authoring
phase: draft
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
BACK-605（E5）已把可移植性验收显式拆成两半：M1 合成空 repo 验证（归 BACK-605.9，便宜、无风险、优先做）与 **M2a 真实 baime 迁移**（本 epic）。605 自己的文字已经写明二者不可互相冒充：'M1 内的合成验收 ≠ M2 真实验收'。

实测（2026-07-05）：/home/yale/work/baime **不是空 repo**——它有自己独立的 .claude-plugin/marketplace.json + plugin/（~22 个方法论 skill + 自己的 scan-loop.js/monitor-poll.ts，刚做过通用化 TASK-250）。指向 baime 不是'装进真空'，是'和一个正在跑的竞争 driver 共存/替换'——这与 BACK-628.1 解决的单活跃 driver 问题同类但更难：不是同进程内两个 (sourceId,pipeline_id) 场，而是**两个独立进程、两个独立仓库**的 driver 互不知道对方存在。

## 做什么（先设计，再迁移）
1. **跨仓库 driver 共存设计**：baime 现有 scan-loop/plugin 与 epicd 引擎驱动 baime backlog 时，如何避免同时 advance 同一批 task 文件、如何界定接管边界（全量切换 vs 逐 pipeline 灰度）。产出设计文档，明确共存/切换协议，而非直接动手迁移。
2. **迁移程序**（呼应 605 plan §9'按 §9 迁移切驱动器'）：baime 侧标记 loop-backlog 相关组件 deprecated 的时机与顺序；epicd 插件（BACK-605.9 产出）在 baime 仓库安装、以真实 baime backlog 任务驱动至 Done 的可重复步骤。
3. **真实可移植性验收**：baime 的真实任务（非合成）被 epicd 引擎自治驱动至 Done，零 epicd 仓库特定硬编码路径命中；baime 原有 scan-loop 在切换后如何降级/停用有明确记录。
4. **回滚安全**：迁移过程中若 epicd 引擎行为异常，baime 原有 driver 可安全恢复，不丢失/不损坏 baime 的 board 状态。

## 非目标（本轮不做，本 epic 后续 plan 时再定范围）
- 不预设具体迁移时间表——这是本 epic 自己 plan 阶段要定的。
- 不要求一次性全量切换——605 骨架已提示可'逐 pipeline 灰度'。

## 前置
- BACK-605.9（插件打包 + 合成 M1 验证）须先 Done——先证明机制本身通用，再谈迁移到活仓库的风险动作。

参考：BACK-605 Epic Plan（child5 M2a 退役）· BACK-605.9 · ADR-012 ENG-6（场身份，本 epic 需扩展到跨仓库场景）· docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §6.4（外化到更广项目的困难：载体碎片化）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 跨仓库 driver 共存/切换设计文档产出，明确 baime scan-loop 与 epicd 引擎驱动 baime backlog 期间如何不互相破坏 board 状态
- [ ] #2 baime 的真实任务（非合成空 repo）被 epicd 引擎自治驱动至 Done，零 epicd 仓库特定硬编码路径命中
- [ ] #3 迁移程序含回滚路径：若 epicd 引擎行为异常，可安全恢复 baime 原有 driver，不丢失/损坏 board 状态
- [ ] #4 baime 原有 scan-loop/plugin 组件的降级或停用时机与顺序有明确记录
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
