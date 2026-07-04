---
id: BACK-618
title: >-
  epicd-run daemon script fails under root package.json type:module (CJS require
  in .js)
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-04 17:04'
updated_date: '2026-07-04 17:08'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 30000
phase: done
dod:
  - text: >-
      bun test src/test/epicd-run-assets.test.ts
      src/test/epicd-run-wiring.test.ts
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Root cause (found while checking item-4 real-monitor readiness): plugin/scripts/scan-loop.js
(epicd's own crystallized copy, BACK-605.8/614) is a CommonJS script (require()/module.exports).
epicd's root package.json declares "type": "module", so Node treats every .js file as ESM by
default — running the exact command the epicd-run SKILL.md specifies
(`node plugin/scripts/scan-loop.js --loop`) crashes immediately:
"ReferenceError: require is not defined in ES module scope".

baime (the origin repo this was crystallized from) has no package.json at all, so Node
defaults to CommonJS there — the breakage is specific to epicd's own repo and was never
caught because the existing asset tests (epicd-run-assets.test.ts, epicd-run-wiring.test.ts)
only check file presence/text content, never actually execute the script.

Fix: rename plugin/scripts/scan-loop.js -> plugin/scripts/scan-loop.cjs (the .cjs extension
forces CommonJS regardless of package.json "type"), and update every reference: the Monitor
command in .codex/skills/epicd-run/SKILL.md, and the path assertions in
src/test/epicd-run-assets.test.ts / src/test/epicd-run-wiring.test.ts. No behavior change to
the script's logic itself.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: BACK-618 — rename scan-loop.js to .cjs so it runs under root package.json type:module

## Phase A: rename + fix all references

### Tests (write first)
Extend `src/test/epicd-run-assets.test.ts`:
- "scan-loop.cjs exists and is non-empty at plugin/scripts/scan-loop.cjs" (replaces the .js path assertion)
- "plugin/scripts/scan-loop.js no longer exists (renamed to .cjs)"
- "scan-loop.cjs actually executes under node (--scan-once, empty tasks dir) without a require/ESM error"
  — spawn `node plugin/scripts/scan-loop.cjs --scan-once --tasks-dir <empty temp dir>` via
  `Bun.spawn`/`node:child_process`, assert exit code 0 and stderr contains no "ReferenceError".
  This is the regression test: it would have caught the type:module breakage immediately.

Update `src/test/epicd-run-wiring.test.ts`: change every `"plugin/scripts/scan-loop.js"` /
`"scan-loop.js --loop"` string assertion to the `.cjs` equivalent (mechanical rename, same assertions).

### Implementation
- `git mv plugin/scripts/scan-loop.js plugin/scripts/scan-loop.cjs` (no content changes to the
  script's logic — only the filename changes).
- `.codex/skills/epicd-run/SKILL.md`: update the Monitor `command` field from
  `"node plugin/scripts/scan-loop.js --loop"` to `"node plugin/scripts/scan-loop.cjs --loop"`.
- `src/cli.ts:4525`: update the doc-comment reference from "scan-loop.js daemon" to
  "scan-loop.cjs daemon" (cosmetic, keeps the comment accurate).
- `src/engine/scan.ts`: update the doc-comment reference the same way.

### DoD
- [ ] `bun test src/test/epicd-run-assets.test.ts src/test/epicd-run-wiring.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- No change to scan-loop.js's internal logic, exports, or CLI flags — pure rename + reference updates.
- Do not touch baime's own copy (/home/yale/work/baime/...) — that repo has no package.json and is unaffected.
- Do not rewrite historical docs/adr or docs/proposals mentions of scan-loop.js — those are
  point-in-time historical records, not live contracts.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
