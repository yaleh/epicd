---
id: BACK-636
title: >-
  One-shot migrate legacy docs/research/gcl-events.jsonl rows into GateEvent
  store
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 09:54'
labels: []
dependencies: []
ordinal: 54000
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-602/633 originally scoped a one-shot migration of the 18 pre-existing baime-GCL-schema rows in docs/research/gcl-events.jsonl into the new GateEvent store, so E4/BACK-604's gate-inbox has a single source of truth instead of two files with two schemas. BACK-635-adjacent audit fix (BACK-602 fresh-context audit) resolved the writer collision by pointing engine stage2-gate's default --record path to a new docs/research/gate-events.jsonl, leaving the legacy file untouched and unread by any current code path — so this migration is no longer required to prevent data corruption, only to fully honor the epic's original consolidation intent. Decide scope with fresh eyes: either (a) write a small one-shot script/CLI subcommand that reads the legacy rows and appends them to gate-events.jsonl as GateEvent objects (mapping gate_type->gate, task_id->item_id, wrapping E/C/H/GCL/reviewer_model/etc into payload verbatim), or (b) close as won't-do if no consumer needs the historical rows through the new read API. Do not delete or rewrite the legacy file in place regardless.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
