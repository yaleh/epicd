---
id: BACK-612
title: BACK-601.5 - 现存 task 文件就地幂等 backfill（M1 roadmap）
status: 'Basic: Proposal'
assignee: []
created_date: '2026-07-04 10:44'
labels: []
dependencies: []
ordinal: 23000
pipeline_id: execution
phase: ready
parent_id: BACK-601
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
对每个现存 backlog/tasks/*.md，由 registry default/derive 填空结构字段：pipeline_id/phase/parent_id/role（role 由树位置派生；phase 由现 status 经 registry parse(status)→裸 phase 映射）。dod/cap 不 backfill（声明式内容非结构默认）。就地、幂等、并行安全；不移动/改名文件；不得破坏旧 loop 读同批文件。CLI 子命令或一次性迁移。backfill 不得在旧 loop 与引擎同时持板时跑（guard#1 前置）。Scope：新 backfill 例程（用 601.1 的 list/upsert + 601.2 的 registry 默认）、迁移入口、幂等测试。依赖 601.2（A）+ 601.1（list/upsert）；不依赖 601.4（C）。最后跑。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
