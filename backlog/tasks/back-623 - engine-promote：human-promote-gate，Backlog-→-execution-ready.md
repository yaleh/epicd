---
id: BACK-623
title: engine promote：human promote gate，Backlog → execution/ready
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 01:07'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 24000
pipeline_id: execution
phase: done
dod:
  - text: bun test src/test/engine-promote.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

The design (`docs/uml/workitem-lifecycle-state.puml`, `docs/uml/use-case-model.md`, `docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md` §4.4) defines a specific cross-pipeline edge: `authoring.done ──promote──▶ execution.ready`, triggered by a **human promote gate** — "由 promote gate（人）触发，不自动越界... 是一次数据写入（写 pipeline_id/phase + provenance）". `backlog/config.yml` already declares `"Basic: Backlog"` / `"Epic: Backlog"` as valid statuses (the authoring-lane terminal state per the state diagram), but no code path exists today to move a task from that boundary into `pipeline_id: execution, phase: ready`.

Separately, investigation this session (2026-07-05) confirmed neither `bun run cli task create --help` nor `task edit --help` expose any `--pipeline-id`/`--phase` flags, and no call site in `src/cli.ts` sets these fields for manually-authored tasks. The only code path that currently produces a `phase: ready` task is `src/harness/decomposer.ts`'s internal `createTaskFromInput` call (epic decompose children) — there is no way, through the sanctioned CLI surface, to get a manually-created task picked up by the `basic-ready` daemon channel.

A generic `--pipeline-id`/`--phase` edit flag would let any caller jam a task into any phase, bypassing the four-axis model's designed invariants (role-derivation, actor rules, the single `label()` projection). The design already names the specific, narrow transition that should exist instead: the promote gate.

## Goals

1. A new `engine promote <id>` CLI command implements exactly the `Backlog → Ready` edge from `workitem-lifecycle-state.puml` — a human-triggered, single data write (`pipeline_id`, `phase`, `status`), not a general-purpose field editor.
2. The command only accepts tasks currently at the authoring-lane boundary (`status` is `"Basic: Backlog"` or `"Epic: Backlog"`); anything else is rejected with a clear error, preserving the "no auto cross-pipeline jump" invariant.
3. After promote, `status` is derived via the same `label(roleOf(task), phase)` projection `completeTask`/`decomposer.ts` use — one status↔phase sync mechanism, not a new one.
4. A regression test proves: promote succeeds from `Backlog` and sets `pipeline_id: execution, phase: ready`; promote is rejected from any other status; a promoted task is reported by `engine scan --once` as `basic-ready:<id>`.
5. `authoringPipeline` exists as a first-class `Pipeline` value in `src/engine/pipeline.ts` (mirroring the already-shipped `executionPipeline`), giving the Authoring lane in the state diagram a real code counterpart — Draft/Refining (actor: machine) and Backlog (actor: human), matching the diagram exactly.

## Proposed Approach

Add `authoringPipeline` to `src/engine/pipeline.ts` next to `executionPipeline`, same `Pipeline`/`PipelineState` shape. Add `engine promote <id>` under the existing `engineCmd` in `src/cli.ts` (alongside `engine scan`/`engine complete`/`engine backfill`), reusing `Core`/`makeBoardStore` the same way `engine complete` does. The command reads the task, checks `status` against the two accepted Backlog strings, and calls `core.updateTask` with `pipeline_id: "execution"`, `phase: "ready"`, `status: label(roleOf(task), "ready")` — mirroring the exact pattern `completeTask` (`src/engine/complete.ts`) already uses for its own phase/status pairs.

## Trade-offs and Risks

- Not building the full Authoring lane driver (Draft→Refining automation, RefineStrategy dispatch, architect-reviewer fan-out) — that's E7 (BACK-608, `Epic: Proposal`), a much larger effort. This task only adds the pipeline's data shape and the one promote edge needed to compliantly hand a task to the execution lane; Draft/Refining remain manually-authored statuses with no automated driver yet, same as today.
- Reusing the existing legacy `promote <taskId>` command name is not possible — that command already exists and does directory-based draft promotion (a different, older mechanism per the terminology drift table in `use-case-model.md`). `engine promote` is deliberately namespaced under `engine` to avoid colliding with it.
- Not adding `provenance` tracking (mentioned in the driver-supervisor proposal as part of the promote write) — no `provenance` field exists on `Task` yet and no other engine code path writes one; out of scope until a real need surfaces elsewhere.

## Implementation Plan

# Plan: engine promote — human promote gate, Backlog → execution/ready (BACK-623)

## Phase A: authoringPipeline + engine promote command + tests

### Tests (write first)
- `src/test/engine-promote.test.ts` (new, real temp-project fixture pattern used in `src/test/engine-driver-board.test.ts`):
  - "promotes a Basic: Backlog task to pipeline_id execution, phase ready, status Basic: Ready"
  - "promotes an Epic: Backlog task to pipeline_id execution, phase ready, status Epic: Ready"
  - "rejects promote when status is not a Backlog status" — e.g. task at `Basic: Proposal` → command exits non-zero, task unchanged
  - "promoted task is reported by engine scan --once as basic-ready:<id>"
- `src/test/pipeline.test.ts` (existing suite for `executionPipeline`, or new `src/test/authoring-pipeline.test.ts` if none exists — search first): "authoringPipeline declares Draft/Refining as actor:machine and Backlog as actor:human, matching workitem-lifecycle-state.puml"

### Implementation
- `src/engine/pipeline.ts`: add and export `authoringPipeline: Pipeline` with `id: "authoring"`, states `[{name: "draft", actor: "machine"}, {name: "refining", actor: "machine"}, {name: "backlog", actor: "human"}]`.
- `src/cli.ts`: add `engineCmd.command("promote").argument("<id>", ...).action(...)` — loads the task via `Core`/`makeBoardStore` (same pattern as `engine complete`), validates `status` is `"Basic: Backlog"` or `"Epic: Backlog"` (reject otherwise with a clear stderr message and non-zero exit), then `core.updateTask({...task, pipeline_id: "execution", phase: "ready", status: label(roleOf(task), "ready", core's configured statuses)}, false)`. Print `engine promote: <id> → execution/ready`.

### DoD
- [ ] `bun test src/test/engine-promote.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints

- `engine promote` only ever writes `pipeline_id`, `phase`, `status` — no other field changes, no new provenance mechanism.
- Do not touch or rename the existing legacy `promote <taskId>` (directory-draft) command.
- Reuse `label()`/`roleOf()` from `src/core/field-registry.ts`/`src/types/index.ts` exactly as `completeTask` does — no second projection function.
- `authoringPipeline`'s Draft/Refining states are declared but have no driver/handler wired yet — that automation is out of scope (E7/BACK-608).

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-05T01:08:09Z
<!-- SECTION:NOTES:END -->
