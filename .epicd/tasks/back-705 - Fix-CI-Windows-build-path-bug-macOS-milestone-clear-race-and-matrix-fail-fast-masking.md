---
id: BACK-705
title: >-
  Fix CI: Windows build path bug, macOS milestone-clear race, and matrix
  fail-fast masking
assignee:
  - '@yale'
created_date: '2026-07-13 16:21'
updated_date: '2026-07-13 17:09'
labels: []
dependencies: []
ordinal: 118000
pipeline_id: execution
phase: implementing
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
- [ ] #1 PRIMARY: a fresh push to main triggers the 'CI' GitHub Actions workflow (.github/workflows/ci.yml) and it completes with conclusion=success across every job/matrix leg (lint-and-unit-test x3 OS, compile-and-smoke-test x3 OS) — verified via 'gh run list --branch main --workflow CI --limit 1' / 'gh run view <id>' showing all-green, not merely local tsc/test passing
- [ ] #2 PRIMARY: a fresh release tag triggers the release workflow (.github/workflows/release.yml) and it completes with conclusion=success across every job (build matrix, npm-publish, github-release, verify-platform-packages, install-sanity, sync-version) — verified via 'gh run view <id>' on the actual triggered run, not a local dry-run of the same steps
- [ ] #3 package.json's build script (or a replacement helper) reads the version without depending on process cwd being correctly formed by the invoking shell
- [ ] #4 scripts/package-plugin.sh reads the version the same cwd-independent way (no second/duplicate version-read implementation)
- [ ] #5 src/test/mcp-milestones.test.ts's milestone-clear assertion passes reliably under repeated/stress execution, with the underlying milestone-clear code path (not just the test) fixed so the read-after-clear is not racy
- [ ] #6 .github/workflows/ci.yml's lint-and-unit-test job sets fail-fast: false on its matrix
<!-- AC:END -->





## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Round 1 marked done prematurely on local-only verification (tsc/test/grep), never on the actual GitHub Actions run. Real push (run 29267385774, commit 6c0e28e5) still failed: a SECOND, independent version-read bug in scripts/package-plugin.sh (VERSION=$(node -p "require('${REPO_ROOT}/package.json').version")) hits the identical Windows path-mangling failure as AC#1's original bug, in a file BACK-705's first pass never touched. AC set rewritten per AGENTS.md's new 'trace the consumer' + 'adversarial self-check' rules: the primary AC is now the real GitHub Actions run's conclusion, not a local proxy for it. Reopening to implementing to fix package-plugin.sh (reuse scripts/print-version.ts instead of duplicating a second version-read implementation) and iterate against real CI until green.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
