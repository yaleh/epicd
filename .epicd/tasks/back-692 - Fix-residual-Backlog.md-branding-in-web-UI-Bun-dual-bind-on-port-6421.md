---
id: BACK-692
title: Fix residual Backlog.md branding in web UI + Bun dual-bind on port 6421
assignee:
  - '@claude'
created_date: '2026-07-12 15:46'
updated_date: '2026-07-12 15:55'
labels: []
dependencies: []
priority: medium
ordinal: 105000
pipeline_id: execution
phase: done
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-691 renamed 'Backlog.md' branding to 'epicd' across src/**/*.ts but its own AC grep used --include='*.ts', which silently skips .tsx files. Three .tsx spots still show 'Backlog.md': Navigation.tsx:21, SideNavigation.tsx:781, App.tsx:192. Separately, live investigation of stale /api/search data on a manda epicd-browser instance found two independent 'epicd browser --port 6421' processes both LISTENing on the same port with no EADDRINUSE. Root-caused via a bisected minimal Bun.serve repro: passing the literal boolean 'development: false' (vs omitting the key or passing true) makes Bun silently allow a second process to bind the same port. Current code computes development: process.env.NODE_ENV === "development", which evaluates to the literal false in normal CLI usage, hitting this. Verified fix: adding reusePort: false to serveOptions in src/server/index.ts restores EADDRINUSE on the second process (3/3 reproducible runs).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 grep -rn 'Backlog\.md' src --include='*.tsx' | grep -v node_modules returns 0 lines
- [x] #2 src/server/index.ts serveOptions includes reusePort: false
- [x] #3 bun test and bunx tsc --noEmit pass
- [x] #4 A test exercises Bun.serve directly with development: false (mirroring src/server/index.ts's serveOptions) and asserts a second bind on the same port throws EADDRINUSE only when reusePort: false is included -- documenting the exact Bun defect found (development:false without reusePort:false silently allows dual-bind) without invoking BacklogServer.start(), which calls process.exit(1) on EADDRINUSE and would abort the test runner
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Branding (TDD): grep for existing web tests asserting 'Backlog.md' banner text; write/adjust a failing test asserting 'epicd' appears instead in Navigation, SideNavigation, App banner/version string. Then edit Navigation.tsx:21, SideNavigation.tsx:781, App.tsx:192 to say epicd. Run tests green.
2. reusePort (TDD): add a test in src/test/ that starts two BacklogServer instances (via Bun.serve directly or via BacklogServer.start) on the same free port and asserts the second one throws/rejects (EADDRINUSE). Confirm it fails against current code (reproduces the bug). Add reusePort: false to serveOptions in src/server/index.ts. Confirm test passes.
3. Run bun test --parallel and bunx tsc --noEmit, check ACs.
4. Prepare (not submit) a minimal Bun repro + issue write-up for the development:false dual-bind bug as a scratch artifact; ask user before filing externally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Branding fix done via TDD: added src/test/web-branding.test.ts asserting no 'Backlog.md' string in Navigation.tsx/SideNavigation.tsx/App.tsx (RED confirmed), then edited the 3 lines to say 'epicd' (GREEN).

reusePort fix done via TDD: added src/test/server-reuseport.test.ts. Test 1 proves reusePort:false prevents dual-bind at the Bun.serve level; test 2 documents the underlying Bun defect (development:false alone allows dual bind); test 3 asserts src/server/index.ts's serveOptions literally contains reusePort:false (RED before edit, GREEN after adding the line to serveOptions).

Full verification: bun test --parallel = 2073 pass/0 fail/2 skip across 270 files; bunx tsc --noEmit clean; biome check limited to touched non-test files clean (project-wide 'bun run check .' has 1 pre-existing unrelated error in search-service.ts, not touched by this task -- see BACK-689 for the separate worktree biome-scope issue).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
