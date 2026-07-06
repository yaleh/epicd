---
id: BACK-656
title: >-
  complete-task.sh DoD gate parsing is not robust against adversarial
  section-name spoofing or embedded newlines
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-06 05:19'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:bug'
  - 'area:engine'
dependencies: []
priority: low
ordinal: 76000
pipeline_id: authoring
phase: draft
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fresh-context audit of BACK-654 (2026-07-06) found two latent, pre-existing fragilities in plugin/scripts/complete-task.sh's DoD gate re-verification that BACK-654 did not introduce and was not scoped to fix:

1. plugin/scripts/complete-task.sh:69 — the awk section-anchor does a naive full-text scan for the literal line "DoD Gates:" anywhere in `backlog task view --plain` output, including inside the free-form Description section (which renders before the real DoD Gates section). A task description containing a fabricated "DoD Gates:\n---\n- #N <cmd>" block causes complete-task.sh to extract and execute that fabricated line via bash -c, in addition to (or instead of) the real structured gates. Demonstrated reproducible in the audit.

2. plugin/scripts/complete-task.sh:75,84 — line-based command extraction (awk/grep/sed) splits a single task.dod[].text gate containing an embedded newline that mimics the "- #N" line format into multiple independently-executed shell commands, with gates_found silently overcounting.

Both mirror the same class of fragility the pre-BACK-654 prose-based scan already had (line-scanning free-form/human-authored text with awk/grep/sed and executing matches as shell). Severity: low-medium — same trust boundary as task.dod authorship (whoever authors task.dod already has an equivalent trust level), but concretely reproducible, not previously documented as closed.

Suggested direction (not decided): anchor the awk scan on a delimiter guaranteed not to collide with free-form prose (e.g. a fixed marker line that can't appear in Description), or move the gate hand-off off line-scanned CLI text entirely onto a structured machine-readable emission (e.g. `backlog task view --json` or a dedicated `--dod-gates-only` output mode) that a shell script parses without regex-scanning human-authored sections.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
