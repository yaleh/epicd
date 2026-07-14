---
id: BACK-671
title: Improve decisions readme with generic example and CLI command reference
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
Refine `.epicd/decisions/readme.md` with a generic decision log example and a CLI command reference. Note: paths/commands have moved since this task was written — the decisions dir is now `.epicd/decisions/` (renamed from `.backlog/decisions/` by BACK-700), and the CLI is `epicd` (renamed from `backlog` by BACK-681/691). Also `decision list` no longer exists as a subcommand (`epicd decision --help` shows only `create`); listing/browsing decisions goes through `epicd search --type decision`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generic decision example included
- [ ] #2 `backlog decision` command descriptions added (`create`, `list`)
- [ ] #3 Task committed to repository
- [ ] #4 Generic decision example included,epicd decision command reference added (create, plus epicd search --type decision for listing),Task committed to repository
<!-- AC:END -->
