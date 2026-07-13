---
id: BACK-658
title: spike 探索方法论 methodology-bootstrapping 实验（收敛后再提取 exploration/spike skill）
assignee:
  - '@claude'
created_date: '2026-07-06 07:44'
updated_date: '2026-07-06 18:20'
labels:
  - 'kind:experiment'
  - 'area:engine'
  - 'epicd:exploration'
dependencies: []
references:
  - BACK-657
  - BACK-641
  - docs/task-lifecycle-model.md
priority: medium
ordinal: 78000
pipeline_id: exploration
phase: done
parent_id: BACK-665
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-657（phase 执行 skill 集）按 extract/mechanical/experiment 三分建 skill。exploration/spike 因**没有已验证的探索方法论**（「怎么 timeboxed 探索 + 怎么做 kill/promote 判断」从未经实验收敛），被显式拆出 BACK-657：不能 hand-write 一个 spike skill 再用 contracts-lint 冒充验证（那正是反模式）。本条目就是那个拆出去的实验。

## 目标

用 /baime:methodology-bootstrapping（OCA：Observe→Codify→Automate + V_instance/V_meta 收敛）**发展并验证** exploration/spike 的执行方法论，然后再用 /baime:knowledge-extractor 提取成随 epicd 发布的 exploration/spike skill（那时才回到 BACK-657 那类「extract」形态，并登记进 phase→skill 覆盖 manifest）。

## 实验范围（要收敛出的方法论）

- 如何界定并 timebox 一个 spike（何时开、给多少预算、产出什么）。
- kill vs promote 的判据：spike 结束时如何判断「杀掉」还是「promote 成一个 execution 任务」（promote 时经 provenance.spawned_from 派生，kill 时不派生；两种结局都 adjudicate 到 exploration 自己的终态 done，不教引擎 core 新词汇——见 src/engine/pipeline.ts explorationPipeline 注释）。
- 收敛判据：达到 methodology-bootstrapping 的 V_instance/V_meta 阈值（方法论完整、有效、可迁移、经验证）。

## 产出

1. 一个收敛的 spike 方法论（含价值函数证据、迭代记录），可溯源。
2. 收敛后：一个 exploration/spike 执行 skill（extract 自本实验），住 epicd plugin/skills/，声明 provenance=本实验，登记进 phase→skill 覆盖 manifest——这一步可作为本条目的后续或回并 BACK-657 覆盖门。

## 非目标

- 不 hand-write spike skill 再用 lint 收口（这正是被拆出的原因）。
- 不做 exploration 的生产 transport 接线（BACK-641）。
- 不改引擎 core / adjudicate / pipeline-as-data。

## 参考

- BACK-657（skill 集 epic；本条目是其 spike 拆出项）
- BACK-641（exploration 生产 transport 接线，独立前置）
- src/engine/pipeline.ts（explorationPipeline：spike→done，kill/promote 的数据+handler 边界注释）
- docs/task-lifecycle-model.md §3（exploration pipeline）
- /baime:methodology-bootstrapping、/baime:knowledge-extractor（实验与提取工具）
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-06: 启动 BAIME methodology-bootstrapping 实验，目录 docs/experiments/back-658-spike-methodology/。

Skill extraction complete: converged methodology from docs/experiments/back-658-spike-methodology/ (results.md) published as plugin/skills/exploration-spike/ (SKILL.md + contract.json, creation_path=extract, provenance=docs/experiments/back-658-spike-methodology/results.md). plugin/skills/phase-coverage.json's exploration/spike entry updated from experiment-pending/BACK-658 to status=skill/skill=exploration-spike. src/test/phase-skill-coverage.test.ts updated to match (registers exploration/spike as a skill test); full suite + tsc + biome check green. Known limitations (harder ceiling sub-branch untested, effectiveness's strongest form unobserved, self-referential validation, reusability hypothetical-only) carried into the skill's own 'Known limitations' section verbatim, not smoothed over.
<!-- SECTION:NOTES:END -->
