---
id: BACK-620
title: >-
  handle-basic-ready.sh claims via stale global backlog CLI, silently drops
  engine structural fields
assignee:
  - '@claude'
created_date: '2026-07-05 00:09'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 32000
pipeline_id: execution
phase: done
dod:
  - text: bun test src/test/handle-basic-ready-wiring.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background

`handle-basic-ready.sh` (`plugin/scripts/handle-basic-ready.sh:28`) claims a task by calling the bare `backlog` binary on `$PATH`:

```
backlog task edit "$TASK_ID" --status "Basic: In Progress" --append-notes "claimed: ..."
```

That resolves to the **globally installed npm package** (`/home/yale/.nvm/.../bin/backlog`, `v1.45.0`), not this repo's dev build (`bun run cli`, currently `1.47.1`-in-progress). The global v1.45.0 CLI predates the engine's structural fields (`pipeline_id`, `phase`, `parent_id`, `dod`) — its `task edit --help` has no `--dod-gate`/pipeline flags, and its frontmatter schema doesn't know these keys exist. When it reads a task file and rewrites it, it silently drops every field its own schema doesn't recognize.

Found empirically on BACK-612 (2026-07-05): the task was decompose-created with `pipeline_id: execution`, `phase: ready`, `parent_id: BACK-601`, and 3 `dod:` gates. After `handle-basic-ready.sh BACK-612` claimed it (status → `Basic: In Progress`), all four fields vanished from the file — only `status`/`assignee`/`updated_date`/notes survived. This is silent and destructive: a claimed task loses its DoD gates (so `engine complete` will always route it to `needs-human` via the ENG-8 empty-dod rule) and loses `pipeline_id`/`phase` (so the daemon's `scanReadyLines` can no longer recognize it as an execution-pipeline task at all after any subsequent scan). The corruption was only caught because it was accidentally swept into an unrelated commit and inspected by hand — see BACK-621 for the sweep bug that surfaced it.

## Goals

1. Claiming a task via the `epicd-run` dispatch path (`handle-basic-ready.sh`) never loses `pipeline_id`/`phase`/`parent_id`/`dod` or any other structural field already present on the task file.
2. The fix does not depend on operators having a specific global `backlog` version installed — the dispatch script must not be silently version-skewed against the repo it's driving.
3. A regression test proves that claiming a task with pre-set structural fields preserves them byte-for-byte (aside from the intended `status`/`assignee`/`updated_date`/notes changes).

## Proposed Approach

Point `handle-basic-ready.sh` at the repo's own dev CLI (`bun run cli` from `$REPO_ROOT`, or `bun "$REPO_ROOT/src/cli.ts"`) instead of the bare `backlog` on `$PATH`, mirroring how every other engine-facing call in this codebase already invokes the dev build (`bun run cli engine complete`, `bun run cli task edit --dod-gate`, etc. — see `src/cli.ts`'s `engine complete` command and this session's manual DoD-gate/status edits, all issued via `bun run cli`). This removes the version-skew hazard structurally: the claim path and the completion path always run the same schema.

## Trade-offs and Risks

- Switching to `bun run cli` inside the script adds a `bun run build:css` + tailwind step to every claim (visible in this session's `bun run cli` output) — slightly slower than the global binary, but correctness matters more than the claim's few-hundred-ms latency, and every other engine call already pays this cost.
- Not doing: patching the global npm package's schema, or writing a field-preserving merge shim in the global CLI — that CLI is a separately versioned, externally shipped artifact (per this repo's "Agent POV" convention) and is out of scope to modify from here.
- Not doing: a generic "always prefer local dev build over $PATH" resolution rule for arbitrary scripts — scoped to this one identified call site; revisit only if the same skew is found elsewhere.

## Implementation Plan

# Plan: handle-basic-ready.sh claims via the repo's own dev CLI, not a version-skewed global binary (BACK-620)

## Phase A: switch the claim call to the local dev CLI + regression test

### Tests (write first)
- `src/test/handle-basic-ready-wiring.test.ts` (new): read `plugin/scripts/handle-basic-ready.sh` as text and assert the claim line invokes the local dev CLI (e.g. matches `bun run cli task edit` or `bun "$REPO_ROOT"...cli.ts`) and does NOT contain a bare `backlog task edit` invocation.
- `src/test/engine-fields-backfill.test.ts` or a new `src/test/handle-basic-ready-claim.test.ts` using a real temp git repo fixture (same helper pattern as `src/test/engine-merge.test.ts`): create a task file with `pipeline_id`/`phase`/`parent_id`/`dod` pre-set, run `handle-basic-ready.sh` against it, and assert all four fields are unchanged in the resulting file while `status`/`assignee` reflect the claim.

### Implementation
- `plugin/scripts/handle-basic-ready.sh`: replace the `backlog task edit ...` claim invocation with a call through the repo's dev CLI entry point, using `$REPO_ROOT` (already resolved at the top of the script via `git rev-parse --show-toplevel`) so it works from any worktree.

### DoD
- [ ] `bun test src/test/handle-basic-ready-wiring.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints

- Do not modify the globally installed `backlog` npm package or its schema — out of scope (external, separately versioned artifact).
- The fix must not change `handle-basic-ready.sh`'s existing exec-lock, worktree-creation, or cap-token behavior — only the claim's edit invocation changes.
- No new field-preserving merge/migration layer — the fix is "call the CLI that actually knows about these fields," not "make the old CLI safe to call."

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
claimed: 2026-07-05T00:17:08Z
<!-- SECTION:NOTES:END -->
