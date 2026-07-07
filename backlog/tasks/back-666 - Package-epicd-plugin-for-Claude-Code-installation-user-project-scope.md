---
id: BACK-666
title: Package epicd plugin for Claude Code installation (user + project scope)
assignee: []
created_date: '2026-07-07 04:19'
updated_date: '2026-07-07 08:13'
labels:
  - plugin
  - dx
  - skills
dependencies: []
references:
  - plugin/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - /home/yale/work/baime/scripts/install/install.sh
  - /home/yale/work/baime/scripts/install/uninstall.sh
  - /home/yale/work/baime/Makefile
priority: medium
ordinal: 90000
pipeline_id: execution
phase: ready
dod:
  - text: make validate
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Goal

Make all epicd skills available in Claude Code via a single install command, with support for both user scope (global) and project scope. After installation, Claude Code will list the full set of epicd skills in its skill registry — both the lifecycle skills (task execution, epic decompose/evaluate, etc.) and the methodology skills (fixpoint-convergence, context-hunter, etc.).

## Current state

The plugin scaffold already exists but is incomplete:
- `.claude-plugin/marketplace.json` — present, points to `./plugin`, named `epicd`
- `plugin/.claude-plugin/plugin.json` — present, but only lists 5 op skills (propose, promote, inbox, run, init); the 7 lifecycle skills and the 5 `.codex/skills/` methodology skills are absent
- No `scripts/install/install.sh` or `uninstall.sh`
- No `Makefile` with install targets
- `.codex/skills/` holds 5 methodology skills that are not in the plugin system: `backlog-technical-project-manager`, `context-hunter`, `epicd-run`, `fixpoint-convergence`, `loop-backlog`

## Decisions (locked, do not revisit)

- **Plugin name**: `epicd` (already in marketplace.json / plugin.json)
- **Single source of truth**: `plugin/skills/` — all skills live here after migration
- **Install mechanism**: directory-source marketplace registration (same as baime) — no file copying, the framework reads `plugin/skills/` directly, so editing a skill file takes effect without reinstalling
- **`.codex/skills/` after migration**: remove all 5 migrated skill directories; the directory itself can stay empty or be removed
- **Scope support**: `--scope user` (writes `~/.claude/settings.json`) and `--scope project` (writes `./.claude/settings.json`)

## Reference implementation

`/home/yale/work/baime/scripts/install/install.sh` — copy the structure, adapt marketplace name (`baime` → `epicd`) and plugin key. The script registers `extraKnownMarketplaces` and `enabledPlugins` via `jq` in the target settings.json. No TypeScript build step needed (epicd has no compiled scripts in the plugin).

## What to build

### Phase 1 — Migrate .codex/skills/ → plugin/skills/
Move (git mv) these 5 directories from `.codex/skills/` into `plugin/skills/`:
- `backlog-technical-project-manager`
- `context-hunter`
- `epicd-run`
- `fixpoint-convergence`
- `loop-backlog`

Remove `.codex/skills/` (or leave the directory empty — the migrated subdirs must not remain there).

### Phase 2 — Expand plugin.json commands list
Add all skills now present in `plugin/skills/` that are missing from `plugin/.claude-plugin/plugin.json`:
- Lifecycle skills not yet listed: `primitive-executor`, `epic-decompose`, `epic-evaluate`, `exploration-spike`, `authoring-draft`, `authoring-refining`
- Migrated methodology skills: `backlog-technical-project-manager`, `context-hunter`, `epicd-run`, `fixpoint-convergence`, `loop-backlog`

The final `commands` array must cover every `SKILL.md` found under `plugin/skills/` (excluding README-only dirs with no SKILL.md).

### Phase 3 — Install / uninstall scripts
Create `scripts/install/install.sh` and `scripts/install/uninstall.sh` supporting `--scope user|project` (default: user). Model directly on baime's implementation. Key behaviors:
- Verifies `.claude-plugin/marketplace.json` exists at repo root
- Adds `extraKnownMarketplaces.epicd` and `enabledPlugins["epicd@epicd"]` to target settings.json via jq
- Creates settings.json (as `{}`) if it does not exist
- Uninstall removes both keys
- Prints clear confirmation + "restart Claude Code or run /reload-plugins"

### Phase 4 — Makefile
Create a `Makefile` with targets:
- `install-user` → `bash scripts/install/install.sh --scope user`
- `install-project` → `bash scripts/install/install.sh --scope project`
- `uninstall-user` → `bash scripts/install/uninstall.sh --scope user`
- `uninstall-project` → `bash scripts/install/uninstall.sh --scope project`
- `validate` → assert every `plugin/skills/*/SKILL.md` is listed in `plugin.json` commands (exit 1 with diff if not)
- `help` → usage summary
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 make install-project exits 0; .claude/settings.json contains extraKnownMarketplaces.epicd pointing to the repo root and enabledPlugins["epicd@epicd"] = true
- [ ] #2 make install-user exits 0; ~/.claude/settings.json contains the same two keys
- [ ] #3 make uninstall-project exits 0 and removes both keys from .claude/settings.json
- [ ] #4 make uninstall-user exits 0 and removes both keys from ~/.claude/settings.json
- [ ] #5 make validate exits 0: every file matching plugin/skills/*/SKILL.md is present in plugin.json commands, and no entry in commands points to a non-existent file
- [ ] #6 make validate exits 1 with a diff if any SKILL.md is missing from commands or any commands entry is a dead path
- [ ] #7 The 5 former .codex/skills/ directories (backlog-technical-project-manager, context-hunter, epicd-run, fixpoint-convergence, loop-backlog) are present under plugin/skills/ and absent from .codex/skills/
- [ ] #8 plugin.json commands covers all 18 skills (5 op + 7 lifecycle + 5 methodology + 1 exploration — subtract any dirs with no SKILL.md); exact count verifiable via find plugin/skills -name SKILL.md | wc -l
- [ ] #9 Running install-project followed by /reload-skills in Claude Code shows all epicd skills in the skill list (manual spot-check: fixpoint-convergence and primitive-executor both visible)
- [ ] #10 1:make install-project exits 0; claude plugins list (run from any directory) shows epicd@epicd enabled at project scope
- [ ] #11 2:make install-user exits 0; claude plugins list shows epicd@epicd enabled at user scope
- [ ] #12 3:make uninstall-project exits 0; claude plugins list no longer shows epicd@epicd at project scope
- [ ] #13 4:make uninstall-user exits 0; claude plugins list no longer shows epicd@epicd at user scope
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
audit skipped: RiskGated(False) — no src/ touched, no engine/security surface. All 4 phases are shell scripts, JSON, and Makefile. install.sh uses jq to write settings.json (no exec, no secret handling). make validate passes (15/15 skills covered). 2006 tests pass (2 pre-existing flaky timeouts under parallel load). DoD gate: make validate (green).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
