---
id: BACK-705
title: >-
  Fix CI: Windows build path bug, macOS milestone-clear race, and matrix
  fail-fast masking
assignee:
  - '@yale'
created_date: '2026-07-13 16:21'
updated_date: '2026-07-13 16:40'
labels: []
dependencies: []
ordinal: 118000
pipeline_id: execution
phase: done
dod:
  - text: 'grep -n ''fail-fast: false'' .github/workflows/ci.yml'
    checked: false
  - text: bun test src/test/mcp-milestones.test.ts
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three CI failures surfaced across runs 29264589417/29265231392/29265245349, analyzed via session-history audit (see BACK-704 follow-on conversation):
(1) Windows: package.json's build script computes VER=$(bun -e 'console.log(require("./package.json").version)') — on windows-latest CI this resolves to a malformed path (D:a/epicd/epicd/package.json, missing separator after drive letter) and MODULE_NOT_FOUND fails the build. New bug, not previously seen in session history.
(2) macOS: src/test/mcp-milestones.test.ts:133 (expect(cleared?.milestone).toBeUndefined()) has now failed twice at the identical assertion/line on macos-latest only (once earlier this session, once in run 29264589417), returning a stale milestone id instead of undefined after clearing. Previously dismissed as flaky and re-run past without a code fix — recurrence at the same line suggests a real race (cache/mtime-based invalidation not settling before the read) rather than pure randomness.
(3) .github/workflows/ci.yml's lint-and-unit-test matrix has no fail-fast: false, so the macOS failure in run 29264589417 cancelled the independent windows-latest job, masking signal from an otherwise-passing platform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json's build script (or a replacement helper) reads the version without depending on process cwd being correctly formed by the invoking shell — verified by a green windows-latest compile-and-smoke-test/lint-and-unit-test run building successfully
- [ ] #2 src/test/mcp-milestones.test.ts's milestone-clear assertion (currently line ~133) passes reliably under repeated/stress execution (e.g. bun test run multiple times or in a loop) with no stale-id race, OR the underlying milestone-clear code path (not just the test) is fixed so the read-after-clear is not racy
- [ ] #3 .github/workflows/ci.yml's lint-and-unit-test job sets fail-fast: false on its matrix so one platform's failure does not cancel other platforms' independent jobs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-13T16:23:16Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
