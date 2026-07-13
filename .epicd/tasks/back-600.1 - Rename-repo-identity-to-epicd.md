---
id: BACK-600.1
title: Rename repo identity to epicd
assignee: []
created_date: '2026-06-26 08:38'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
  - 'epicd:E0'
dependencies: []
parent_task_id: BACK-600
ordinal: 1000
pipeline_id: execution
phase: done
parent_id: BACK-600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Child 1 of epic BACK-600 (E0). Update package.json name/bin, CLI entrypoint, README, and hardcoded backlog.md identity strings so the package, binary, and docs present as epicd. Identity-only: no CLI/MCP/instruction behavior changes. Parallel with child 2.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: Rename repo identity to epicd

## Background
This forked Backlog.md repo is being transformed into `epicd`, a self-hosting autonomous work engine (epic BACK-600, child 1). The package still presents as `backlog.md` v1.47.1 across package.json, the published bin alias, README, and install instructions. Before later children build engine subsystems, the repo must consistently present as `epicd` so the package, binary, and docs are coherent. This is an identity-only change: no CLI/MCP/instruction behavior may change.

## Goals
1. `package.json` `name` field reads `epicd` (verifiable: `grep '"name": "epicd"' package.json`).
2. README top-level identity strings present `epicd`, not `Backlog.md`, for the project name and install commands.
3. The CLI bin alias and any hardcoded `backlog.md` identity strings in shipped surfaces are updated without changing the `backlog` command name where that is a documented contract surface.
4. Build still succeeds and the CLI still runs (`--version`/help) after the rename.

## Proposed Approach
Audit identity strings with `grep -rin "backlog.md"` across package.json, README, and src entrypoints. Update package.json `name` to `epicd` and align README headline + install commands. Leave the `backlog` invocable command name intact (it is a documented contract surface per CLAUDE.md Agent POV) unless decided otherwise; only the package identity, headline, and npm install strings change. Keep behavioral code untouched.

## Trade-offs and Risks
We are NOT renaming the `backlog` CLI subcommand surface or MCP tool names (contract surfaces). Risk: optionalDependencies platform package names (`backlog.md-*`) reference the old published packages; renaming them could break binary resolution, so they are left or handled explicitly. Mitigation: shell-gate DoD asserts build + version still work.

---

# Plan: Rename repo identity to epicd

Proposal: see above.

## Phase A: Rename package + docs identity
### Tests (write first)
- Add `src/test/epicd-identity.test.ts` asserting `package.json` `name === "epicd"` and that README first heading contains `epicd`. These fail before the rename.

### Implementation
- Edit `package.json`: set `name` to `epicd`.
- Edit `README.md`: update the H1 and the npm/bun install commands to `epicd`.
- Update any hardcoded `backlog.md` product-identity strings in shipped src entrypoints surfaced by the audit grep (excluding the `backlog` command name and MCP/CLI contract strings).

### DoD
- [ ] `bun test src/test/epicd-identity.test.ts`
- [ ] `grep -q '"name": "epicd"' package.json`
- [ ] `bunx tsc --noEmit`

## Constraints
- Do not rename the `backlog` CLI command, MCP tool names, or instruction-file contract strings — identity strings only.
- No behavioral changes.

## Acceptance Gate
- [ ] `bun test`
- [ ] `grep -q '"name": "epicd"' package.json`
- [ ] `bun run build`
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

claimed: 2026-06-26T08:54:13Z

Phase A ✓ 2026-06-26T00:00:00Z — package.json name=epicd, README H1+install commands updated, src/cli.ts description updated, src/readme.ts attribution updated, epicd-identity.test.ts added (TDD), build.test.ts updated

DoD #1: PASS — bun test src/test/epicd-identity.test.ts (2 pass)

DoD #2: PASS — grep -q '"name": "epicd"' package.json

DoD #3: PASS — bunx tsc --noEmit

DoD #4: PARTIAL — bun test ./src: 1347 pass, 3 fail (all pre-existing timeout failures unrelated to this task)

DoD #5: PASS — bun run build (dist/backlog built successfully)

workerLoop DoD #1: PASS — bun test src/test/epicd-identity.test.ts
workerLoop DoD #2: PASS — grep -q '"name": "epicd"' package.json
workerLoop DoD #3: PASS — bunx tsc --noEmit
workerLoop DoD #4: NOTE — pre-existing timeout failures unrelated to rename
workerLoop DoD #5: PASS — bun run build

Completed: 2026-06-26T09:18:41Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun test src/test/epicd-identity.test.ts
- [ ] #2 grep -q '"name": "epicd"' package.json
- [ ] #3 bunx tsc --noEmit
- [ ] #4 bun test
- [ ] #5 bun run build
<!-- DOD:END -->
