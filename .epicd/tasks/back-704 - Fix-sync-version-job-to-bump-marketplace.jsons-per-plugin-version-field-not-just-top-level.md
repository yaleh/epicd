---
id: BACK-704
title: >-
  Fix sync-version job to bump marketplace.json's per-plugin version field, not
  just top-level
assignee:
  - '@yale'
created_date: '2026-07-13 16:08'
updated_date: '2026-07-13 16:10'
labels: []
dependencies: []
ordinal: 117000
pipeline_id: execution
phase: done
dod:
  - text: 'jq -e ''.plugins[0].version == "1.48.14"'' .claude-plugin/marketplace.json'
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-703's release.yml sync-version job runs jq ".version = $TAG" against .claude-plugin/marketplace.json, which only sets the marketplace-schema top-level .version field. The field claude plugin update actually compares against the installed plugin manifest is the nested .plugins[0].version, which stays hardcoded at 1.0.0 forever. Confirmed after the v1.48.14 release: origin/main's marketplace.json shows top-level version 1.48.14 but plugins[0].version still 1.0.0. This means the original bug (claude plugin update silently no-op'ing on stale version equality) is NOT fixed for marketplace-driven installs, despite BACK-703 passing two independent audit rounds — both rounds checked package.json/plugin.json version-string presence via grep-style checks that didn't catch the nested field.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 release.yml's sync-version job's jq command for marketplace.json sets both the top-level .version and every entry in .plugins[].version to the release tag
- [x] #2 a fresh release tag results in marketplace.json's .plugins[0].version matching plugin/.claude-plugin/plugin.json's .version (both equal to package.json's version)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed release.yml sync-version job: jq now sets both top-level .version and .plugins[].version. Also patched the already-shipped marketplace.json on trunk directly (v1.48.14 released before this fix landed) so current state is consistent without waiting for next tag. Verified: git show origin/main:.claude-plugin/marketplace.json shows plugins[0].version == 1.48.14. package-plugin.sh's sed-based approach was already correct (line-based, not JSON-path-based) — only the CI jq path needed the fix.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
