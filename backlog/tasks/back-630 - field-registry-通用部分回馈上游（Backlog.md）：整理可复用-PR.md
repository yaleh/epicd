---
id: BACK-630
title: field-registry 通用部分回馈上游（Backlog.md）：整理可复用 PR
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-05 06:19'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:chore'
dependencies:
  - BACK-601
priority: low
ordinal: 45000
pipeline_id: authoring
phase: draft
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E1(BACK-601) AC#4 遗留项：field-registry（src/core/field-registry.ts 的 parse/serialize/validate 表驱动机制,不含 pipeline_id/phase/role/dod/cap 等 epicd 专属字段)是通用改进,可回馈 upstream Backlog.md。本任务从 E1 拆出,不阻塞 E1 收口(非核心交付、可独立排期)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 识别 field-registry.ts 中与 epicd 引擎字段(pipeline_id/phase/role/dod/cap/refine_log)正交、可通用化的部分
- [ ] #2 整理为一个可读的 PR 描述或 patch,面向 Backlog.md upstream
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
