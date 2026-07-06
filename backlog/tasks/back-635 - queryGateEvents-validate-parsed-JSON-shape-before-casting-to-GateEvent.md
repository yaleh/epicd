---
id: BACK-635
title: 'queryGateEvents: validate parsed JSON shape before casting to GateEvent'
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-05 09:54'
updated_date: '2026-07-06 09:16'
labels: []
dependencies: []
ordinal: 53000
pipeline_id: authoring
phase: draft
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: bun test src/test/gate-event-store.test.ts
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/core/gate-event-store.ts queryGateEvents does JSON.parse(line) as GateEvent with zero shape validation (found in BACK-602 fresh-context audit). A malformed or foreign-schema line (e.g. accidental cross-write, manual edit, future format drift) silently coerces into a GateEvent with undefined core fields instead of failing loudly. Add a minimal runtime shape check (required string fields: id, item_id, pipeline_id, gate, actor, verdict, timestamp) and skip malformed lines rather than throw — keep it minimal, no schema library.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
