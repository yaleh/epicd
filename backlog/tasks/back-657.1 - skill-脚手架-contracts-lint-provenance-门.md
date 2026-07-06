---
id: BACK-657.1
title: skill 脚手架 + contracts-lint + provenance 门
status: Done
assignee:
  - '@claude'
created_date: '2026-07-06 14:44'
updated_date: '2026-07-06 15:16'
labels:
  - 'kind:basic'
dependencies: []
parent_task_id: BACK-657
priority: high
ordinal: 86000
pipeline_id: execution
phase: done
parent_id: BACK-657
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-657 child 1（infra，先行，其余 skill child 的公共依赖）。

在 epicd 仓库内建立：
- 共享 SKILL 结构范式（λ-spec + contracts: frontmatter + finalise 写回约定，参照 feature-to-backlog 收敛为 epicd-native 最小形态），住 plugin/skills/
- plugin/scripts/skill-lint.sh（contracts 自检，L1 结构门）
- src/test/skill-contracts.test.ts
- src/test/phase-skill-coverage.test.ts —— 从 src/engine/pipeline.ts 读出全部 actor==="machine" 的 phase，断言每个要么有已发布+已登记的 skill 目录，要么显式标注 experiment-pending 并指向其 methodology-bootstrapping 实验
- src/test/skill-provenance.test.ts —— 每个已发布 skill 必须声明 provenance:，extract 类须 cite 可解析的源实验/方法论，mechanical 类须声明"无方法论"
- (pipeline_id,phase)→skill 的代码 registry（与 phase→skill 覆盖 manifest 同一份，单一真值）

本 child 只是脚手架/lint/覆盖门本身；不要求交付任何实际的 phase skill 内容（那是 child 2/3/4 的范围）——本 child 完成后，phase-skill-coverage 门应能运行但对 6 个 machine phase 全部报告"缺 skill 且非 experiment-pending"（红），这是预期的：它是覆盖门的落地，不是覆盖本身。

收敛信号：bun scripts/fixpoint-back665.ts 的 phase-skill-coverage check 应转绿（该 check 只要求 src/test/phase-skill-coverage.test.ts 文件存在并可运行，不要求覆盖率达标）。

参考：BACK-657 plan（child 1）、docs/task-lifecycle-model.md §3/§6、/home/yale/work/baime/plugin/skills/feature-to-backlog/SKILL.md（结构范式参考，不是要复制的目标——产出必须是 epicd-native）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: plugin/skills/README.md (SKILL contract convention doc), plugin/skills/phase-coverage.json (single (pipeline_id,phase)->skill registry manifest), plugin/scripts/skill-lint.sh (L1 contract lint, single-skill + --all modes, graceful skip of legacy skills), src/engine/skill-registry.ts (TS registry/coverage helper reused by tests + future monitor), src/test/skill-contracts.test.ts, src/test/skill-provenance.test.ts, src/test/phase-skill-coverage.test.ts + fixtures under src/test/fixtures/skill-lint*. phase-coverage.json registers exploration/spike -> experiment-pending -> BACK-658; the other 5 machine phases are left unregistered (expected gap for BACK-657.2/.3/.4). Full-coverage invariant test uses it.failing() so bun test stays green while still red-testing the real gap. Fixed a real conflict: had to keep plugin/ shipped files free of the literal external-framework name to satisfy the pre-existing epicd-plugin-synthetic-repo.test.ts zero-mentions check; skill-lint.sh's runtime-independence check is framework-agnostic (generic /vendor:skill invocation pattern) instead. bunx tsc --noEmit, bun run check ., bun test (sequential) all green; bun test --parallel green except known pre-existing flaky timeouts (build.test.ts, cli-help-schemas.test.ts under heavy parallel load -- pass in isolation). bun scripts/fixpoint-back665.ts: phase-skill-coverage is green.
<!-- SECTION:NOTES:END -->
