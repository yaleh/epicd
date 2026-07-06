---
id: BACK-609
title: >-
  BACK-601.2 - field-registry core + 派生 parse/serialize/validate + role 派生 +
  引擎字段 reconcile + 搜索过滤 + refine_log 描述符
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-04 10:44'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
ordinal: 20000
pipeline_id: execution
phase: done
parent_id: BACK-601
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
引入唯一 FieldDescriptor 表（{yamlKey,tsName,type,parse,serialize,validate,mcpSchema,present?}），将 parseTask/serializeTask 改为由表生成；折入 roleOf 派生（叶⇒primitive/裸 Task、有子⇒compound/Epic）注册为 role 描述符；reconcile 已发布引擎字段（pipeline_id/phase/parent_id/dod/cap/role）为表中声明实例，parse/serialize 字节一致；NormalizedFilters 增 pipeline_id/phase 过滤；注册 refine_log 描述符；serialize 保留每描述符真值 presence 规则（D2）。Scope：src/markdown/parser.ts、serializer.ts、src/types/index.ts、src/core/field-registry.ts（新）、src/core/search-service.ts、ADR-005 文本。无依赖（基础）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Driven via correct monitor+Agent pattern (in-session Claude Code Agent in worktree, NOT claude subprocess). Worktree task/BACK-609; engine.completeTask owns DoD-reverify+merge (ENG-8).

Merged to main via engine.completeTask under merge-lock (ENG-8: DoD independently re-verified green in worktree before merge — tsc/biome/full suite 1615 tests 0 fail). Delivered via the CORRECT pattern: in-session monitor → background Claude Code Agent in worktree → sentinel → engine complete tail. NOT a claude subprocess. Merge commit 190478d.
<!-- SECTION:NOTES:END -->
