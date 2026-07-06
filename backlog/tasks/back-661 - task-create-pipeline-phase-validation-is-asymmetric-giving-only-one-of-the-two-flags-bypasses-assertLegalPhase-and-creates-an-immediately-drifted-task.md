---
id: BACK-661
title: >-
  task create --pipeline/--phase validation is asymmetric: giving only one of
  the two flags bypasses assertLegalPhase and creates an immediately-drifted
  task
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-06 09:19'
labels:
  - 'kind:bug'
  - 'area:engine'
dependencies: []
priority: medium
ordinal: 79000
pipeline_id: authoring
phase: draft
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during BACK-655 fresh-context audit. src/core/backlog.ts createTaskFromInput only calls assertLegalPhase when input.phase is a string, and src/cli.ts's task-create action doesn't fill in the missing half of the (pipeline, phase) pair when only one flag is given. Repro: `task create X --pipeline authoring` (no --phase) creates a task with pipeline_id=authoring, no phase field, status=To Do — immediately flagged by 'engine drift-lint' as drifted. Fix should make task create validate/complete the pair symmetrically (mirroring task edit), or default the missing half instead of skipping validation entirely.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
