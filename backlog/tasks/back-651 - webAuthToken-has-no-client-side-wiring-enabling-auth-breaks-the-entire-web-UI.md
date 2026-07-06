---
id: BACK-651
title: >-
  webAuthToken has no client-side wiring - enabling auth breaks the entire web
  UI
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-05 17:22'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:bug'
dependencies: []
ordinal: 71000
pipeline_id: authoring
phase: draft
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-647 added server-side bearer-token auth (src/server/auth.ts, checkBearerAuth) gating /api/tasks* and (per audit fix) /api/coordinator-claims. But no client code (src/web/lib/api.ts, TaskList.tsx, etc.) ever sends an Authorization header, and there is no login/token-input UI. If a user follows the documented 'backlog config set webAuthToken <token>' flow, every fetch from the web UI 401s -- the whole app breaks with no visible explanation. Found by first independent audit round of BACK-604 (2026-07-05); only existing auth test (server-auth-endpoint.test.ts) hits the raw HTTP server directly, so this browser-breaks-when-enabled gap is untested and undocumented.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either add minimal client-side token wiring (e.g. a config-driven header on every apiClient call) with a way for a human to supply the token in the browser, or explicitly document (README/CLI help) that webAuthToken is intended for non-browser/API-only consumers until client wiring exists, so enabling it doesn't silently break the web UI.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
