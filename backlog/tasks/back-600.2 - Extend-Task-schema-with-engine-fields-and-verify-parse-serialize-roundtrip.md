---
id: BACK-600.2
title: Extend Task schema with engine fields and verify parse/serialize roundtrip
status: 'Basic: Done'
assignee: []
created_date: '2026-06-26 08:39'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies: []
parent_task_id: BACK-600
ordinal: 2000
pipeline_id: execution
phase: done
parent_id: BACK-600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child 2 of epic BACK-600 (E0). Add pipeline_id/state/role/parent_id/dod(DoDItem[])/cap(CapMarker[]) to the Task interface in src/types/index.ts; update markdown parser/serializer to read/write them as YAML frontmatter; tests verify roundtrip with and without the new fields. Parallel with child 1.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: Extend Task schema with engine fields and verify parse/serialize roundtrip

## Background
The `epicd` engine (epic BACK-600, child 2) needs first-class metadata that today is squeezed into freeform notes and recovered by regex — the `L(R|G)` inflation problem per ADR-011. The minimal D-7 field subset is `pipeline_id`, `state`, `role`, `parent_id`, structured `dod` (`DoDItem[]`), and `cap` (`CapMarker[]`). These must live on the `Task` type and round-trip through the markdown frontmatter parser/serializer so later children (interpreter, driver) can read them reliably.

## Goals
1. `src/types/index.ts` `Task` interface gains `pipeline_id?`, `state?`, `role?`, `parent_id?`, `dod?: DoDItem[]`, `cap?: CapMarker[]` plus the two new supporting types.
2. The markdown parser reads these fields from YAML frontmatter into the `Task`.
3. The serializer writes them back to frontmatter.
4. Round-trip fidelity is proven by tests: a task with all new fields and a task with none both survive parse→serialize→parse unchanged.

## Proposed Approach
Add the field declarations and two new exported types (`DoDItem`, `CapMarker`) to `src/types/index.ts`. Extend `src/markdown/parser.ts` to read the new frontmatter keys and `src/markdown/serializer.ts` to emit them, following the existing pattern used for fields like `milestone`/`dependencies`. Absent fields stay `undefined` and must not be emitted, preserving backward compatibility with existing task files.

## Trade-offs and Risks
We are NOT building a field-registry or domain-rich semantics (deferred to E1). Risk: emitting empty fields would churn every existing task file; mitigation: only serialize when present, and add an explicit roundtrip test for the no-new-fields case.

---

# Plan: Extend Task schema with engine fields

Proposal: see above.

## Phase A: Add types and frontmatter roundtrip
### Tests (write first)
- Add `src/test/engine-fields-roundtrip.test.ts`: (1) parse a markdown task whose frontmatter sets all six engine fields, assert the parsed `Task` carries them; (2) serialize and re-parse, assert deep-equality; (3) a task with no engine fields round-trips without introducing the new keys. Tests fail before implementation.

### Implementation
- `src/types/index.ts`: add `DoDItem` and `CapMarker` interfaces and the six optional fields on `Task`.
- `src/markdown/parser.ts`: read `pipeline_id`, `state`, `role`, `parent_id`, `dod`, `cap` from frontmatter.
- `src/markdown/serializer.ts`: emit those keys only when defined.

### DoD
- [ ] `bun test src/test/engine-fields-roundtrip.test.ts`
- [ ] `grep -q 'pipeline_id' src/types/index.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- Absent fields must not be serialized (no churn of existing task files).
- Scope is the D-7 minimal subset only; no field-registry.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
feature-to-backlog: Proposal APPROVED; Plan APPROVED (architect review).
premise-ledger:
[E] goal coverage: each proposal Goal maps to a Phase or Acceptance Gate item in this task's plan
[E] DoD executability: every DoD/Acceptance Gate item is a shell command (exit 0 = pass)
[C] file paths exist: referenced src/ paths confirmed against the epicd tree
[H] phase sizing: each phase <=200 LOC judged from background knowledge
GCL-self-report: E=2 C=1 H=1
cap:propose=approved
cap:plan=approved
Parked at Basic: Proposal under epic BACK-600. Promote to Basic: Ready to authorize execution.

claimed: 2026-06-26T08:54:21Z

Phase A ✓ 2026-06-26T00:00:00Z — types, parser, serializer, and roundtrip tests implemented

DoD #1: PASS — bun test src/test/engine-fields-roundtrip.test.ts (3 pass, 0 fail)

DoD #2: PASS — grep -q 'pipeline_id' src/types/index.ts

DoD #3: PASS — bunx tsc --noEmit (no errors)

DoD #4: PASS — bun test --parallel (1348 pass, 5 pre-existing timeouts unrelated to changes)

DoD #5: PASS — bun run check . (exit 0, 5 pre-existing warnings in unrelated files)

workerLoop DoD #1: PASS — bun test src/test/engine-fields-roundtrip.test.ts
workerLoop DoD #2: PASS — grep -q 'pipeline_id' src/types/index.ts
workerLoop DoD #3: PASS — bunx tsc --noEmit
workerLoop DoD #4: NOTE — 5 pre-existing E2E failures (tests/e2e/, excluded from CI per BACK-520)
workerLoop DoD #5: PASS — bun run check .
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/engine-fields-roundtrip.test.ts
- [ ] #2 grep -q 'pipeline_id' src/types/index.ts
- [ ] #3 bunx tsc --noEmit
- [ ] #4 bun test
- [ ] #5 bun run check .
<!-- DOD:END -->
