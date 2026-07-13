---
id: BACK-705
title: >-
  Fix CI: Windows build path bug, macOS milestone-clear race, and matrix
  fail-fast masking
assignee:
  - '@yale'
created_date: '2026-07-13 16:21'
updated_date: '2026-07-13 17:21'
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
- [x] #1 PRIMARY: a fresh push to main triggers the 'CI' GitHub Actions workflow (.github/workflows/ci.yml) and it completes with conclusion=success across every job/matrix leg (lint-and-unit-test x3 OS, compile-and-smoke-test x3 OS) — verified via 'gh run list --branch main --workflow CI --limit 1' / 'gh run view <id>' showing all-green, not merely local tsc/test passing
- [x] #2 PRIMARY: a fresh release tag triggers the release workflow (.github/workflows/release.yml) and it completes with conclusion=success across every job (build matrix, npm-publish, github-release, verify-platform-packages, install-sanity, sync-version) — verified via 'gh run view <id>' on the actual triggered run, not a local dry-run of the same steps
- [x] #3 package.json's build script (or a replacement helper) reads the version without depending on process cwd being correctly formed by the invoking shell
- [x] #4 scripts/package-plugin.sh reads the version the same cwd-independent way (no second/duplicate version-read implementation)
- [x] #5 src/test/mcp-milestones.test.ts's milestone-clear assertion passes reliably under repeated/stress execution, with the underlying milestone-clear code path (not just the test) fixed so the read-after-clear is not racy
- [x] #6 .github/workflows/ci.yml's lint-and-unit-test job sets fail-fast: false on its matrix
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against REAL GitHub Actions runs, not local proxies: CI run 29269380604 (commit 36f3f73a) — all 6 jobs green (lint-and-unit-test x3 OS, compile-and-smoke-test x3 OS). Release run 29269799425 (tag v1.48.15) — all 20 jobs green including sync-version; confirmed post-release origin/main has package.json/plugin.json/marketplace.json (.version and .plugins[0].version) all == 1.48.15. Root-caused a second independent Windows path bug in scripts/package-plugin.sh (its own node -p require() version read, untouched by round 1) that round-1's local-only verification missed — real CI (run 29267385774) caught it via the synthetic-repo test's bun run build. Fixed by reusing scripts/print-version.ts instead of duplicating the version-read logic.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
