---
id: BACK-657.2
title: execution/ready -> primitive-executor skill (keystone)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-06 15:31'
updated_date: '2026-07-07 11:35'
labels: []
dependencies: []
parent_task_id: BACK-657
priority: high
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
为 execution/ready 机器 phase 建立 extract 类执行 skill，把 src/engine/dispatch.ts 现有内联的 LFDD 原语执行方法论（读任务 Description 的 Phase plan -> 每 phase 先写测试后实现 -> 跑该 phase 的结构化 DoD -> checkpoint）打包成 plugin/skills/primitive-executor/ 下随 epicd 发布的独立可 invoke skill。复用 BACK-657.1 的 SKILL 合同/lint/registry/coverage 基础设施，不新建机制。creation_path=extract，provenance 引用本仓库 LFDD 实践（CLAUDE.md 工作流描述 + src/engine/dispatch.ts 的 renderBasicReadyDispatch）。在 phase-coverage.json 注册 execution/ready -> primitive-executor，并翻转 phase-skill-coverage.test.ts 中 execution/ready 的覆盖断言为绿。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugin/skills/primitive-executor/SKILL.md 与 contract.json 存在，遵循 plugin/skills/README.md 约定
- [x] #2 phase-coverage.json 注册 execution/ready -> primitive-executor (extract)
- [x] #3 phase-skill-coverage.test.ts 反映 execution/ready 已覆盖
- [x] #4 skill-contracts.test.ts / skill-provenance.test.ts 覆盖新 skill 并通过
- [x] #5 plugin/scripts/skill-lint.sh --all 通过；plugin/ 树下零出现字面量 baime
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: plugin/skills/primitive-executor/{SKILL.md,contract.json} (creation_path=extract, provenance=src/engine/dispatch.ts — extracting the LFDD primitive-execution methodology already inlined in renderBasicReadyDispatch: read task Phase plan -> TDD each Phase -> run Phase DoD -> checkpoint via bun run cli engine complete). Registered execution/ready -> primitive-executor in plugin/skills/phase-coverage.json. Updated src/test/phase-skill-coverage.test.ts: added a positive-control test for execution/ready (mirrors the existing exploration/spike one) and tightened the 'remaining uncovered' assertion from 5 to 4 phases (authoring/draft, authoring/refining, execution/decomposing, execution/evaluating); the it.failing() full-coverage invariant is untouched and correctly stays red (4 real gaps remain, expected for .3/.4). No changes to src/engine/dispatch.ts or any engine mechanics. Verification: bunx tsc --noEmit clean; bunx biome check on touched files clean (bun run check ./bun run check . itself is broken pre-existing in this worktree even on a clean stash — biome vcs.useIgnoreFile reports 0 files processed regardless of changes, confirmed unrelated to this task); bun test (sequential, full suite) 2007 pass/2 skip/0 fail; bun test --parallel ./src 2006 pass/1 fail — the 1 failure (has-children-indicator.test.ts) is the documented pre-existing parallel-only flake, confirmed passing in isolation; plugin/scripts/skill-lint.sh --all exits 0 (primitive-executor passes, 5 legacy skills skip gracefully); grep -ri baime plugin/ returns zero matches; bun scripts/fixpoint-back665.ts unchanged at 7/10, phase-skill-coverage check still green with no regression. Note: BACK-657.2 task itself had to be created (did not pre-exist) and its pipeline_id/phase corrected from the create-time default (authoring/draft) to execution/ready via task edit --pipeline-id/--phase before finalizing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted the LFDD primitive-execution methodology from src/engine/dispatch.ts's renderBasicReadyDispatch into an independently-invokable skill at plugin/skills/primitive-executor/, registered execution/ready -> primitive-executor in phase-coverage.json, and updated phase-skill-coverage.test.ts so execution/ready is now asserted covered (4 machine phases remain, down from 5). Reused BACK-657.1's contract schema/lint/registry unchanged; no engine mechanics touched.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
