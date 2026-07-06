---
id: BACK-650
title: 'BACK-604 AC#8 follow-up: self-observation feedback loop demo never executed'
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 17:22'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:bug'
dependencies: []
ordinal: 70000
pipeline_id: execution
phase: proposal
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-604's decompose (5 children, BACK-644-648) never assigned AC#8 (self-observation feedback loop: an agent observes the running board via web API + Playwright, auto-files a backlog task for detected anomalies like status/phase desync, stale claim, or orphaned worktree, with at least one real detect->file-task demo) to any child. First independent audit round of BACK-604 (2026-07-05) confirmed zero evidence anywhere (no self_observed_anomaly_ticketed event, no such task trail) -- AC#8 is simply unaddressed, not under-evidenced. This is a decompose-completeness gap: the pre-decompose survey/AC-concretization step (per context-isolation-plan.md) should have either assigned AC#8 to an explicit child or flagged it as descoped before decompose-apply ran.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either: (a) a new child task implements and demonstrates the self-observation loop with a real detect->file-task trail, or (b) AC#8 is explicitly descoped from BACK-604 with a documented rationale (e.g. deferred to a future epic pending the LLM-driven decompose-proposal step, mirroring AC#9's own precedent).
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
