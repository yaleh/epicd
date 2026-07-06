---
id: BACK-652
title: >-
  multi-lane-board.spec.ts mutates real repo task data instead of a sandboxed
  fixture
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-05 17:22'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:bug'
dependencies: []
ordinal: 72000
pipeline_id: authoring
phase: draft
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/e2e/multi-lane-board.spec.ts (BACK-648) runs playwright.config.ts's webServer against the real project's backlog CLI/data on port 6455, creating real task IDs (observed BACK-650-653 range during a Playwright run in the first independent audit round of BACK-604, 2026-07-05) and leaving artifacts in the working tree. The suite's own afterAll cleanup is functionally idempotent per its doc-comment, but it still mutates real repo state on every run rather than using an isolated fixture project dir (the pattern most unit tests in this repo already use, e.g. createUniqueTestDir/safeCleanup in src/test/test-utils.ts). This is a real risk if this suite is ever wired into CI against a shared/production project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Playwright e2e suite runs against an isolated/tmp backlog project fixture (mirroring createUniqueTestDir conventions) instead of the real repo's backlog/ data, so repeated/parallel/CI runs cannot create or leak real task IDs.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
