---
id: BACK-615
title: >-
  rename 'engine watch' → 'engine scan' (one-shot scan, not a long-running
  watcher)
assignee:
  - '@claude'
created_date: '2026-07-04 15:43'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 27000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
engine watch 是一次性扫描(--once 扫完即退),叫 watch 误导(像常驻)。改名 engine scan,与 interpreter.scan 同名、准确。机械改名:CLI 命令 watch→scan、src/engine/watch.ts→scan.ts、scan-loop.js 的 execSync 串、SKILL contracts not-grep、wiring/engine-watch 测试。不碰 node:fs.watch 等无关 watcher。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Committed to main (976c484). Renamed engine watch→engine scan (CLI cmd, src/engine/watch.ts→scan.ts, engine-watch.test.ts→engine-scan.test.ts, scan-loop.js execSync + engineWatchOnce→engineScanOnce, SKILL contract not-grep, wiring test assertions, comments). node:fs watchers untouched. Verified: engine scan --once emits basic-ready lines; 'engine watch' now unknown command; tsc PASS; affected tests green; biome exit 0.
<!-- SECTION:NOTES:END -->
