---
id: BACK-673
title: Improve drafts readme with generic example and CLI command reference
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-09'
updated_date: '2026-07-14 01:53'
labels: []
dependencies: []
pipeline_id: authoring
phase: drafting
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update `.epicd/drafts/readme.md` to show a generic draft task example and document available draft commands. Note: paths/commands have moved since this task was written — the drafts dir is now `.epicd/drafts/` (renamed from `.backlog/drafts/` by BACK-700), and there is no more standalone `backlog draft` command group (confirmed via `epicd draft --help`, which does not exist as a subcommand). Drafts are now ordinary tasks on the authoring pipeline (`pipeline_id: authoring`, phase one of drafting/refining/backlog) — created with `epicd task create`, refined in place, and moved forward with `epicd task edit --phase <phase>`. The readme should document that model instead of the old create/archive/promote command group.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generic draft task example added
- [ ] #2 `backlog draft` command descriptions added (`create`, `archive`, `promote`)
- [ ] #3 Task committed to repository
- [ ] #4 Generic draft task example added (as an authoring-pipeline task),Documented how drafts move through drafting/refining/backlog phases via epicd task create/edit --phase,Task committed to repository
<!-- AC:END -->
