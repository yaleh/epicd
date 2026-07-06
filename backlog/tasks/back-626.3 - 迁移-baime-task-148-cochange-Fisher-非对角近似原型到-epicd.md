---
id: BACK-626.3
title: 迁移 baime task-148 cochange/Fisher 非对角近似原型到 epicd
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 03:42'
updated_date: '2026-07-06 03:46'
labels: []
dependencies:
  - BACK-626.1
  - BACK-626.2
documentation:
  - >-
    /home/yale/work/baime/backlog/tasks/task-148 -
    Epic-skill-库本征维度度量原型（cochange-依赖图近似-Fisher-非对角结构）.md
parent_task_id: BACK-626
ordinal: 39000
pipeline_id: execution
phase: done
parent_id: BACK-626
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 baime 项目中 backlog/tasks/task-148（"Epic-skill-库本征维度度量原型（cochange-依赖图近似-Fisher-非对角结构）"，路径：/home/yale/work/baime/backlog/tasks/task-148 - Epic-skill-库本征维度度量原型（cochange-依赖图近似-Fisher-非对角结构）.md）中已经想清楚的 cochange 近似算法，迁移/移植到 epicd，作为"分解正交性检查清单"的第二层信号（比 BACK-626.2 的声明式 touches 交集检查更强，能发现历史上经常一起变化但本次分解未声明重叠的文件对）。

背景：BACK-626.1 的 ADR/方法论文档已经为这一信号定义了输入输出契约（不需要重新设计契约，只需查阅该文档并实现）。本任务先去 baime 仓库读 task-148 的具体设计（算法、数据结构、是否已有部分实现代码），评估其成熟度，再决定是直接搬运代码，还是仅参考设计重新实现（因为两个仓库的语言/运行时/文件布局可能不同，需要 harness 目录下的一次调研确认可复用范围）。

依赖：BACK-626.1（契约定义）。可与 BACK-626.2 并行开发（两层信号相互独立，仅在最终展示报告时合并），但需在 BACK-626.2 落地的 touches 数据结构基础上对齐，因此建议在 BACK-626.2 完成后再开始，避免返工。

实现要点：
- 调研 baime task-148 的设计和现状（是否已有可运行原型代码），确认可复用部分
- 用 git log --name-only 按 commit 聚合文件共变频次，构造稀疏的文件×文件共变矩阵（近似 Fisher 信息矩阵非对角结构）
- 在 epic 分解流程中查询该矩阵：对 BACK-626.2 声明的 touches 文件对，若历史共变频次超过阈值，追加到同一份非阻塞提示报告中
- 明确该信号的性能边界（如仓库历史很长时的计算成本），必要时做缓存或增量计算
- 补充测试覆盖矩阵构造和阈值判定逻辑
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 完成对 baime task-148 设计与现状的调研，在任务记录中说明可复用范围和迁移决定（直接搭运代码 vs 参考设计重写）
- [x] #2 实现基于 git log --name-only 的文件共变频次统计，构造稀疏共变矩阵
- [x] #3 分解流程中对 touches 文件对查询该矩阵，共变频次超过阈值时追加到同一份非阻塞提示报告
- [x] #4 输入输出契约与 BACK-626.1 文档定义一致
- [x] #5 新增测试覆盖矩阵构造和阈值判定逻辑
- [x] #6 说明大仓库历史下的性能边界（是否需缓存或增量计算）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
调研结论（AC#1）：baime task-148 是未开工的 Epic（status: Epic: Proposal，创建于 2026-06-22），仅有设计草图，仓库内无 scripts/skill-intrinsic-dim.* 或任何可运行代码（find 确认仅有任务文件本身和一个 worktree 副本，无实现）。因此本任务不是代码搬运，而是根据 ADR-016 D3 已经收窄过的契约（成对耦合分值+阈值判定，不需要 task-148 设计中的谱分析/本征维度估计部分——那解决的是不同的问题，库级别本征维度，而非单次分解的成对重叠）从零实现，仅参考 task-148 的 git log --name-only 计数思路。

实现（AC#2/#3/#4）：新增 src/harness/cochange.ts：realGitLog 实迪（Bun.spawn git log --pretty=format:%ct%x00 --name-only -z，仅读本地历史，无外部依赖）+ 可注入的 GitLogPrimitive 类型（与 decomposer.ts 的 SpawnPrimitive 风格一致，便于测试隔离真实 git）；findCochangeOverlaps(children, repoPath, {threshold, gitLog}) 对所有带 touches 的兄弟对，仅在声明集合内的跨子任务文件对上统计共变频次，达阈值则标记。decomposer.ts 的 makeDecomposer 新增可选 opts:{gitLog,cochangeThreshold}，在步骤 2b 同时计算 D1(声明式)与 D2(历史共变) 两类 overlap，合并写入同一份 advisory 报告（formatOverlapReport 扩展为接受两个参数，分别标注“声明式重叠”与“历史强耦合”）。与 ADR-016 D3 契约一致：输入=仓库路径+按子任务分组的 touches 文件列表，输出=文件对耦合分值+阈值判定结果，阈值可配置（默认 3，未固定具体数值）。D2/D2 同文件对避免重复：已在 D1 声明重叠的文件对（fileA===fileB 情况不发生，因为是跨 child 比较）不重复计入 D2。

性能边界（AC#6）：每次 decompose 调用只跑一次完整 git log --name-only 历史扫描（单次 spawn，O(commits)），且 pairwise 计数仅限定在声明 touches 的文件并集内（不随仓库总文件数增长）。不做缓存/增量更新——ADR-016 D3 明确将缓存策略留给本任务决定，decompose 每 epic 只跑一次，当前规模下单次全历史扫描可接受；若仓库历史增长到成为瓶颈，修复方式是加缓存/增量更新（明确留待后续，不在本任务预先实现，符合简单性优先原则——无已证实需求）。

测试（AC#5）：新增 src/test/harness-cochange.test.ts（5 个单元测试，假 GitLogPrimitive，不依赖真实 git 历史）：无 touches 时返回 []、达阈值标记、低于阈值不标记、与声明集合无关的共变不计入、同一 child 内部文件对不计入（D2 只管跨兄弟耦合）。engine-decompose.test.ts 新增 1 个集成测试：未声明直接交集但历史共变达阈值的兄弟 touches → advisory 报告含“历史强耦合”。全部 23 个相关测试通过（54 expect()）。bun test --parallel 全量跑出的 9 fail+4 error 均在 cli-milestone-management/cli-help-schemas/cli-init-no-git 等与本次改动无关的文件，隔离重跑确认 21 pass 0 fail，为既有 flaky。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
按 ADR-016 D2/D3 实现历史 cochange advisory 信号，作为 BACK-626.2 声明式 touches 交集检查（D1）之外的第二层耦合信号。

调研结论：baime task-148 是未开工的 Epic（无代码，仅设计草图），因此本任务不是代码迁移，而是根据 ADR-016 D3 已收窄的契约（成对耦合分值+阈值，而非 task-148 设想的库级谱分析/本征维度估计）从零实现，仅参考其 git log --name-only 计数思路。

新增 src/harness/cochange.ts：realGitLog（Bun.spawn 本地 git log，无外部依赖）+ 可注入 GitLogPrimitive + findCochangeOverlaps(children, repoPath, {threshold, gitLog}) —— 仅对声明了 touches 的跨兄弟文件对统计历史共变频次，达阈值（默认 3，可配置）即标记。decomposer.ts 的 makeDecomposer 新增可选 opts:{gitLog, cochangeThreshold}，在计算 D1 声明式重叠的同时计算 D2 历史共变重叠，合并写入同一份 epic advisory 报告（区分"声明式重叠"与"历史强耦合"两类标注），advisory-only，不阻塞分解/dispatch。

性能边界：每次 decompose 一次完整 git log 扫描（O(commits)），pairwise 统计仅限声明 touches 的文件并集，不随仓库总文件数增长；不做缓存/增量（ADR-016 D3 明确留给未来，当前规模下单次全量扫描可接受）。

新增测试：src/test/harness-cochange.test.ts（5 单元测试，假 GitLogPrimitive）+ engine-decompose.test.ts 新增 1 个集成测试（未声明直接交集但历史强耦合→advisory 报告含"历史强耦合"）。全部 23 个相关测试通过（54 expect()）。bun test --parallel 全量跑出的 9 fail+4 error 与本次改动文件无关，隔离重跑确认是既有 flaky。
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
