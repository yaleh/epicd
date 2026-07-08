---
id: BACK-688
title: Rename shell completion scripts and docs from backlog to epicd
assignee:
  - '@claude'
created_date: '2026-07-08 16:09'
updated_date: '2026-07-08 17:52'
labels: []
dependencies:
  - BACK-681
ordinal: 101000
pipeline_id: execution
phase: implementing
dod:
  - text: bun test
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: >-
      git diff --name-only -z $(git merge-base HEAD main) HEAD -- .
      ':!backlog/tasks' | xargs -0 npx biome check --files-ignore-unknown=true
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-681 renamed the CLI bin entry from backlog to epicd, but the completions/ directory was out of its scope. The shell completion scripts still register and complete for the literal command name 'backlog' (e.g. '#compdef backlog', '_backlog()', 'complete -c backlog'), and completions/README.md and completions/EXAMPLES.md still show 'backlog completion install' and backlog-prefixed usage examples throughout. This is a functional rename, not just prose: the completion scripts must actually register against 'epicd' so 'epicd <TAB>' works after install. Scope widened after reading src/commands/completion.ts: getScriptFilename() maps shells to backlog.bash/_backlog/backlog.fish/backlog.ps1 filenames, getEmbeddedCompletionScript() duplicates the same 4 scripts as string literals (fallback for compiled binary, used when completions/ files aren't found on disk), and getInstallPaths() hardcodes backlog.fish-suffixed install paths (e.g. /usr/share/fish/vendor_completions.d/backlog.fish) and a PowerShell Register-ArgumentCompleter -CommandName backlog/backlog.exe block. All of these must rename in lockstep with the completions/ directory files, or an install from a compiled binary (embedded-script fallback path) would silently keep registering for 'backlog'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 grep -c 'backlog' completions/_backlog returns 0 CLI-command occurrences (script registers completion for epicd, e.g. #compdef epicd, _epicd())
- [ ] #2 grep -c 'backlog completion install' completions/README.md returns 0
- [ ] #3 grep -c 'backlog ' completions/EXAMPLES.md returns 0 CLI-invocation occurrences
- [ ] #4 bun test passes
- [ ] #5 grep -c 'backlog' completions/backlog.bash completions/backlog.fish completions/backlog.ps1 returns 0 CLI-command occurrences (or files are renamed to epicd.bash/epicd.fish/epicd.ps1 with getScriptFilename() in src/commands/completion.ts updated to match)
- [ ] #6 grep -c 'backlog' src/commands/completion.ts returns 0 CLI-command/filename occurrences: getScriptFilename() mapping, getEmbeddedCompletionScript()'s 4 embedded script literals, and getInstallPaths()'s install-path filenames/PowerShell CommandName list all reference epicd, not backlog (directory-path prose like '/etc/bash_completion.d/' stems may remain, only the backlog-specific suffix/name changes)
- [ ] #7 src/commands/completion.test.ts asserts (via installCompletion() with an injected homeDir, not the real $HOME) that installed completion script content for at least bash/zsh/fish registers the epicd command and contains no 'backlog' references, and that install path filenames use epicd naming; bun test src/commands/completion.test.ts passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Rename shell completion scripts and docs from backlog to epicd

## Phase A: completions/ directory files
### Tests (write first)
- N/A (shell-script/prose files, not covered by bun test); verification is grep-based, see DoD
### Implementation
- completions/_backlog -> rename content: `#compdef backlog` -> `#compdef epicd`, `_backlog()` -> `_epicd()`, trailing `compdef _epicd epicd` registration; keep filename `_backlog` only if zsh convention requires `_<cmd>` naming - rename file to `_epicd` to match zsh convention (`#compdef` line names the command, filename is the fpath entry).
- completions/backlog.bash -> completions/epicd.bash: `_backlog()` -> `_epicd()`, `complete -F _backlog backlog` -> `complete -F _epicd epicd`, invoked internal command `backlog completion __complete` -> `epicd completion __complete`.
- completions/backlog.fish -> completions/epicd.fish: same command-name substitution (registered complete -c backlog -> complete -c epicd, or fish-native equivalent already in file).
- completions/backlog.ps1 -> completions/epicd.ps1: `Register-ArgumentCompleter -Native -CommandName @("backlog","backlog.exe")` -> `@("epicd","epicd.exe")`.
- completions/README.md: `backlog completion install` -> `epicd completion install`, throughout.
- completions/EXAMPLES.md: all `backlog <verb>` CLI-invocation examples -> `epicd <verb>`.
### DoD
- [ ] `grep -c 'backlog' completions/_backlog` returns 0
- [ ] `grep -c 'backlog completion install' completions/README.md` returns 0
- [ ] `grep -c 'backlog ' completions/EXAMPLES.md` returns 0

## Phase B: src/commands/completion.ts (getScriptFilename, embedded fallback scripts, install paths) + test
### Tests (write first)
- src/commands/completion.test.ts: extend/confirm assertions (using `installCompletion(shell, { homeDir: tempDir })`, never the real $HOME) that installed bash/zsh/fish script content contains no `backlog` reference and registers the `epicd` command; assert install path filenames use epicd naming (e.g. `epicd.fish`, not `backlog.fish`). Write/extend this test first so it fails red against the current (unrenamed) completion.ts.
### Implementation
- `getScriptFilename()`: map shells to `epicd.bash` / `_epicd` / `epicd.fish` / `epicd.ps1`.
- `getEmbeddedCompletionScript()`: rename the 4 embedded string-literal scripts' command references in lockstep with Phase A's file renames (bash/zsh/fish/pwsh bodies).
- `getInstallPaths()`: `/usr/share/fish/vendor_completions.d/backlog.fish` -> `.../epicd.fish`, `~/.config/fish/completions/backlog.fish` -> `.../epicd.fish`, PowerShell `Register-ArgumentCompleter -CommandName @("backlog","backlog.exe")` block -> `@("epicd","epicd.exe")`.
- `getCompletionScript()`'s on-disk read path (`join(__dirname, "..", "..", "completions", getScriptFilename(shell))`) needs no change beyond Phase A's renames + this Phase's updated `getScriptFilename()` mapping.
- Installed-file success/log messages referencing "backlog CLI" (e.g. `install` action's console.log) -> "epicd CLI".
### DoD
- [ ] `bun test src/commands/completion.test.ts` passes (red before this Phase's Implementation, green after)
- [ ] `grep -c 'backlog' src/commands/completion.ts` returns 0

## Constraints
- Do not touch src/completions/helper.ts's `getCompletions()` dynamic-completion logic (task-ID/config-value completion) - only the shell registration scripts, their filenames, and their embedded copies are in scope.
- Do not touch the MCP server name, backlog:// URI scheme, or backlog/ task-storage directory name (unrelated to shell completions, same invariant as BACK-687).
- File renames must keep old-name breakage out of scope: no back-compat shim for a stale installed `backlog.bash`/`_backlog` script left over from a prior install - that's a one-time user re-install concern, not this task's problem.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/draft self-review: APPROVED after 1 round. Background states WHY (BACK-681's bin rename left completions/ out of scope, functional not just prose) grounded in an actual read of src/commands/completion.ts (getScriptFilename/getEmbeddedCompletionScript/getInstallPaths all hardcode backlog-suffixed names — this widened scope beyond the original draft, now reflected in Description + 7 machine-checkable ACs). Goals are the 7 ACs, each a concrete grep/test command. Non-goals: original AC#5's non-mechanical interactive-TAB claim removed and replaced with an installCompletion()-with-injected-homeDir test assertion (AC#7) so every AC is machine-checkable per assessAndDecompose(b).

authoring/refining review: APPROVED after 1 iteration. Goal coverage: Phase A covers AC#1/#2/#3/#5 (completions/ dir file renames+content), Phase B covers AC#6/#7 (completion.ts getScriptFilename/embedded scripts/install paths + completion.test.ts), Acceptance Gate covers AC#4 (bun test). TDD structure: Phase B has Tests-first (installCompletion with injected homeDir, not real $HOME) with bun test src/commands/completion.test.ts as first DoD item (red before Implementation, green after); Phase A is prose/script-only (no bun-test coverage possible) with grep-based DoD, same pattern accepted for BACK-687's doc-only phases. Acceptance Gate's first item is the full bun test suite. File paths confirmed to exist via a source read (completions/_backlog, completions/backlog.{bash,fish,ps1}, completions/README.md, completions/EXAMPLES.md, src/commands/completion.ts, src/commands/completion.test.ts).

Phase A: renamed completions/_backlog->_epicd, backlog.bash->epicd.bash, backlog.fish->epicd.fish, backlog.ps1->epicd.ps1; rewrote all command-name references (compdef/complete/Register-ArgumentCompleter/install invocations) to epicd; updated README.md, EXAMPLES.md, .gitkeep to match (kept 2 legitimate 'backlog' prose refs to the task-storage directory, out of scope per task description: 'CLI scans backlog directory for tasks' and 'Large number of tasks/documents in your backlog'). Phase B: getScriptFilename() now maps to epicd.bash/_epicd/epicd.fish/epicd.ps1; all 4 getEmbeddedCompletionScript() literals renamed in lockstep (function names _epicd/__epicd_complete/$__epicdCompletionScriptBlock, complete/compdef/Register-ArgumentCompleter registrations); getInstallPaths() renamed all install path filenames (bash/zsh/fish system+user paths, pwsh profile-relative epicd-completion.ps1) and PowerShell CommandName list to @("epicd","epicd.exe"); install-command console.log message and manual-install error instructions updated to epicd. Extended completion.test.ts (TDD: added failing assertions first) with new bash/fish/zsh installCompletion() tests using injected homeDir (never real $HOME) asserting installed script content has no 'backlog' reference and registers epicd, plus install-path filename checks; existing pwsh/zsh tests updated to assert epicd naming and absence of 'backlog'. Deviation: AC#3's literal 'grep -c backlog completions/EXAMPLES.md' returns 1, not 0 - the sole remaining match is the legitimate out-of-scope 'backlog directory' (task-storage) reference on line 67, not a CLI-invocation; verified 0 CLI-invocation occurrences via grep -cE 'backlog (task|doc|board|config|completion|<TAB>|nonexistent)' instead, per the AC's own parenthetical intent. All DoD gates green: bun test (2068 pass/2 skip/0 fail), bunx tsc --noEmit (clean), biome check on the touched files (clean).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
