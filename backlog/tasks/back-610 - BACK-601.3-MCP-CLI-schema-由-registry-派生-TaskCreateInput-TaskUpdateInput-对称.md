---
id: BACK-610
title: BACK-601.3 - MCP/CLI schema 由 registry 派生 + TaskCreateInput/TaskUpdateInput 对称
status: 'Basic: Done'
assignee: []
created_date: '2026-07-04 10:44'
updated_date: '2026-07-04 17:29'
labels: []
dependencies: []
ordinal: 21000
phase: done
dod:
  - text: >-
      bun test src/test/field-registry.test.ts
      src/test/mcp-schema-generators.test.ts src/test/mcp-tasks.test.ts
      src/test/cli-task-view-edit.test.ts src/test/engine-child-create.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
使 generateTaskCreateSchema/generateTaskEditSchema 由表的 mcpSchema 派生（取代 ~360 行手写）；扩 TaskCreateInput/TaskUpdateInput + createTaskFromInput/updateTaskFromInput 使 registry 字段（含引擎字段）在 create 与 update 两侧一致接受，收口 create/update 不对称。Scope：src/mcp/utils/schema-generators.ts、src/mcp/tools/tasks/*、src/types/index.ts（TaskUpdateInput 引擎字段）、src/core/backlog.ts（updateTaskFromInput 对称）。依赖 601.2（A）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: MCP/CLI schema derives from field-registry + TaskCreateInput/TaskUpdateInput engine-field symmetry (BACK-610 / BACK-601.3)

## Context (from research)

- `src/core/field-registry.ts` (`FIELD_DESCRIPTORS`, from BACK-609/BACK-601.2) currently has no `mcpSchema` on `FieldDescriptor`, even though ADR-011 D-5 specifies `FieldDescriptor := { yamlKey, tsName, type, parse, serialize, validate, mcpSchema }`. BACK-609 shipped everything except `mcpSchema`. This task finishes that piece.
- Concrete asymmetry in `src/core/backlog.ts`: `createTaskFromInput` (line 976) reads `input.pipeline_id`, `input.phase`, `input.parent_id`, `input.dodGates` and writes them into the new task (lines 1069-1076). `applyTaskUpdateInput` (line 1136) has zero handling for `pipeline_id`/`phase`/`parent_id`/`dod`. There is no way to set/change these through the update path today.
- `TaskUpdateInput` (`src/types/index.ts` line 182) has no `pipeline_id`/`phase`/`parent_id`/`dodGates`; `TaskCreateInput` (line 148) has all four.
- The MCP surface is also asymmetric independently: `generateTaskCreateSchema`/`generateTaskEditSchema` (`src/mcp/utils/schema-generators.ts`) expose neither side's engine fields, and `src/mcp/tools/tasks/handlers.ts` (`TaskCreateArgs`, `createTask()`) don't pass these fields through to `core.createTaskFromInput` even though the core API already accepts them.
- `reporter`, `cap`, `role`, `refine_log` are equally absent from both Create/Update inputs today — not an asymmetry to close; out of scope.
- ~360 lines of hand-written schema duplication across create/edit exist for: `labels`, `assignee`, `dependencies`, `references`(+add/remove), `documentation`(+add/remove), `modifiedFiles`. `status`, `milestone`, `ordinal`, `id`, `title` have genuinely different create-vs-edit semantics and stay hand-written.
- No `schema-generators.test.ts` exists yet. `src/test/mcp-tasks.test.ts` asserts schema shape end-to-end. `src/test/field-registry.test.ts` is the existing unit suite for descriptors.

## Phase A: Registry-driven `mcpSchema` + schema-generators derivation (shape only, no new fields yet)

### Tests (write first)
- `src/test/field-registry.test.ts`: add cases asserting `FIELD_DESCRIPTORS.find(d => d.tsName === "labels").mcpSchema` (and `assignee`, `dependencies`, `references`, `documentation`, `modifiedFiles`) return a JSON-Schema fragment matching today's hand-written shapes exactly (read current values from `schema-generators.ts`). Assert descriptors that must stay MCP-invisible (`id`, `created_date`, `updated_date`, `subtasks`, `role`, `cap`, `refine_log`, `reporter`) have `mcpSchema === undefined`.
- New file `src/test/mcp-schema-generators.test.ts`:
  - `"generateTaskCreateSchema derives labels/assignee/dependencies/references/documentation/modifiedFiles from FIELD_DESCRIPTORS"` — assert each property deep-equals the corresponding descriptor's `mcpSchema`.
  - `"generateTaskEditSchema derives the same base field shapes as create, plus add/remove variants reusing the field's item schema"` — assert `editSchema.properties.addReferences.items` deep-equals `editSchema.properties.references.items`.
  - `"status/milestone/ordinal/id/title schema fragments are unchanged by the refactor"` — snapshot today's exact literal shapes to guard against accidental behavior change.
- `src/test/mcp-tasks.test.ts`: keep existing `"exposes ordinal in task schemas"`/`"exposes status enums..."` tests unmodified (must still pass).

### Implementation
- `src/core/field-registry.ts`: add `mcpSchema?: JsonSchema` (import `JsonSchema` from `../mcp/validation/validators.ts`) and `mcpKey?: string` to `FieldDescriptor`. Populate `mcpSchema` on `labels`, `assignee`, `dependencies`, `references`, `documentation`, `modifiedFiles` — copying exact constraints currently hand-written in `schema-generators.ts`. Leave unset on the rest for now.
- `src/mcp/utils/schema-generators.ts`: add `propertiesFromRegistry(): Record<string, JsonSchema>` iterating `FIELD_DESCRIPTORS`, skipping descriptors without `mcpSchema`, keyed by `d.mcpKey ?? d.tsName`. Rewrite `generateTaskCreateSchema`/`generateTaskEditSchema` to spread `propertiesFromRegistry()` and keep hand-written blocks only for fields with genuinely different create/edit semantics; for add/remove variants, reuse the spread base property's `items` instead of re-declaring.
- No behavior change to `handlers.ts`/`backlog.ts` in this phase.

### DoD
- [ ] `bun test src/test/field-registry.test.ts src/test/mcp-schema-generators.test.ts src/test/mcp-tasks.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: Engine-field symmetry (`pipeline_id`/`phase`/`parent_id`/`dod`) across create and update, both core and MCP

### Tests (write first)
- `src/test/field-registry.test.ts`: extend to assert `pipeline_id`/`phase`/`parent_id` descriptors expose `mcpSchema: { type: "string" }`-shaped fragments, and `dod` exposes `mcpKey: "dodGates"` with an array-of-string `mcpSchema`.
- `src/test/mcp-schema-generators.test.ts`: add test asserting `createSchema.properties.pipeline_id` deep-equals `editSchema.properties.pipeline_id` (and same for `phase`, `parent_id`, `dodGates`).
- `src/test/mcp-tasks.test.ts`: add `"accepts and round-trips engine fields (pipeline_id, phase, parent_id, dodGates) through task_create and task_edit"` — create via `pipeline_id`/`phase`/`parent_id`/`dodGates`, assert via `task_view`; edit with a different `dodGates` list and assert full replacement (not append).
- `src/test/cli-task-view-edit.test.ts`: add `"updateTaskFromInput sets pipeline_id/phase/parent_id and replaces dod via dodGates"` — create a task, `core.updateTaskFromInput(id, { pipeline_id: "execution", phase: "ready", parent_id: "task-1", dodGates: ["echo ok"] }, false)`, reload from disk, assert persistence; call again with a different `dodGates` array and assert full replacement.
- `src/test/engine-child-create.test.ts`: add a case proving `TaskCreateArgs` including `pipeline_id`/`phase`/`parent_id`/`dodGates` through `TaskHandlers.createTask` produces a task with them set (the MCP handler-forwarding gap, distinct from the already-tested direct `core.createTaskFromInput` path).

### Implementation
- `src/core/field-registry.ts`: set `mcpSchema`/`mcpKey` for `pipeline_id`, `phase`, `parent_id`, `dod` as tested above.
- `src/types/index.ts`: add `pipeline_id?: string; phase?: string; parent_id?: string; dodGates?: string[];` to `TaskUpdateInput` (mirroring `TaskCreateInput`; full-replace semantics for `dodGates`, no add/remove variants).
- `src/core/backlog.ts` (`applyTaskUpdateInput`, ~line 1136): reuse the existing `applyStringField` helper for `pipeline_id`/`phase`/`parent_id`. Add a `dodGates` block mirroring `createTaskFromInput`'s transform (`text => ({ text, checked: false })`), replacing `task.dod` wholesale, setting `mutated = true` on change.
- `src/mcp/tools/tasks/handlers.ts`: add the four fields to `TaskCreateArgs`, pass through in `createTask()`'s call to `core.createTaskFromInput`.
- `src/types/task-edit-args.ts`: add the same four optional fields to `TaskEditArgs`.
- `src/utils/task-edit-builder.ts` (`buildTaskUpdateInput`): add pass-through mapping for the four fields (same style as existing `ordinal`/`milestone` mapping).
- No changes to `src/mcp/tools/tasks/index.ts` — it already calls the schema generators, which now include these fields.

### DoD
- [ ] `bun test src/test/field-registry.test.ts src/test/mcp-schema-generators.test.ts src/test/mcp-tasks.test.ts src/test/cli-task-view-edit.test.ts src/test/engine-child-create.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints

- Deliberately out of scope: `reporter`, `cap`, `role`, `refine_log` (no asymmetry to close today — adding them is new capability); `parentTaskId` reparenting via `TaskUpdateInput` (has knock-on `subtasks` effects, needs dedicated move semantics, not a descriptor mirror).
- `dodGates` update semantics are full-replace only — no `addDodGates`/`removeDodGates` (CLAUDE.md: favor load + upsert over add/remove APIs).
- `status`, `milestone`, `ordinal`, `id`, `title` keep their existing hand-written schema fragments unchanged.
- `FieldDescriptor.mcpSchema` describes the accepted input shape, which may diverge from the internal serialized type (e.g. `dod: DoDItem[]` internally vs `dodGates: string[]` MCP input) — document this on the `dod` descriptor with a short comment, per ADR-011 D-5; not a bug to unify.
- No new abstraction layer (no SchemaBuilder class) — a single `propertiesFromRegistry` helper is sufficient.
- Any literal-equality assertions on `ordinal`/`status`/`milestone` schema text in `mcp-tasks.test.ts` must remain passing unmodified.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-04T17:13:50Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
