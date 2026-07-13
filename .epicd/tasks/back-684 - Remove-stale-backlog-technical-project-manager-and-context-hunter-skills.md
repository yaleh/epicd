---
id: BACK-684
title: Remove stale backlog-technical-project-manager and context-hunter skills
assignee:
  - '@claude'
created_date: '2026-07-07 17:34'
updated_date: '2026-07-07 17:42'
labels: []
dependencies: []
ordinal: 94000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both skills were carried over from the old Backlog.md repo via BACK-666's migration and have never actually been invoked (0 Skill-tool uses across the project's session history). backlog-technical-project-manager's coordination role (multi-task lanes, worktree isolation, plan/finalization gates) is now covered by the engine-native fixpoint-convergence + epic-decompose + epic-evaluate skills, and its remaining content is dead: it clones into ../Backlog.md-copies/backlog-<taskId> and hardcodes the old upstream remote github.com/MrLesk/Backlog.md.git, which predates the BACK-681 backlog->epicd rename and the EnterWorktree/ExitWorktree tooling. context-hunter's pre-coding discovery role overlaps with authoring-refining and primitive-executor's Phase/TDD flow, and it contains a stale copy-pasted line referencing 'Nuxt + Vue + Tailwind 4.1 patterns' -- a tech stack epicd (a Bun/TypeScript CLI) does not use. Delete both skill directories and remove their entries and description mentions from plugin/.claude-plugin/plugin.json so the plugin manifest stays accurate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugin/skills/backlog-technical-project-manager/ and plugin/skills/context-hunter/ directories are removed
- [x] #2 plugin/.claude-plugin/plugin.json commands array no longer references either skill's SKILL.md, and its description text no longer names either skill
- [x] #3 make validate exits 0 (every remaining plugin/skills/*/SKILL.md is listed in plugin.json, no dead paths)
- [x] #4 grep -rl backlog-technical-project-manager or context-hunter under plugin/ returns no results
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. git rm -r plugin/skills/backlog-technical-project-manager plugin/skills/context-hunter
2. Edit plugin/.claude-plugin/plugin.json: remove both commands entries and the description mentions
3. make validate
4. Run DoD checks (bun test)
5. Commit on feature branch, open PR
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
audit skipped: RiskGated(False) — no src/ touched, no engine/core/security surface (plugin/ config + skill markdown only). bunx tsc --noEmit clean; bun run check . exits 0 (11 pre-existing warnings, unrelated). bun test --parallel: 1957 pass, 1 pre-existing flaky timeout in build.test.ts (CLI packaging, unrelated — not caused by this change, no src/ touched). make validate: OK all 13 skills covered. grep -rl for both skill names under plugin/ returns no results.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the two stale skills (backlog-technical-project-manager, context-hunter) carried over from the pre-rename Backlog.md repo via BACK-666's migration: deleted plugin/skills/backlog-technical-project-manager/ and plugin/skills/context-hunter/, and trimmed plugin/.claude-plugin/plugin.json's commands array and description to drop both. Verified: make validate (13/13 skills covered, no dead paths), grep -rl for either name under plugin/ empty, bunx tsc --noEmit clean, bun run check . exits 0, bun test --parallel 1957 pass (1 pre-existing unrelated flaky timeout in build.test.ts). Audit skipped per RiskGated(False): change confined to plugin/ config + markdown, no src/ or engine/security surface touched. Post-deletion /reload-skills confirms both are gone from the live skill registry.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
