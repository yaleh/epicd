---
id: BACK-687
title: Rename backlog CLI invocation examples to epicd in docs and help text
assignee:
  - '@claude'
created_date: '2026-07-08 16:09'
updated_date: '2026-07-14 09:10'
labels: []
dependencies:
  - BACK-681
ordinal: 100000
pipeline_id: execution
phase: done
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
BACK-681 renamed the CLI bin entry from backlog to epicd (package.json bin, src/cli.ts Commander name, build outfile, CI artifacts, plugin/scripts, plugin/skills SKILL.md, AGENTS.md) but left CLI invocation examples (e.g. `backlog task create`, `backlog init`, `backlog board`) unmigrated in the top-level docs, in-repo guides, one PR template line, scattered docs/ prose, and hardcoded help/usage strings in src/cli.ts. This task finishes that propagation for prose/docs and CLI help text. Out of scope: MCP_SERVER_NAME ("backlog"), backlog:// URI scheme, backlog/ task-storage directory name, optionalDependencies platform package names (e.g. backlog.md-linux-x64) — none of these change. completions/ directory (shell completion scripts + their docs) is handled by a separate follow-up task since it also requires renaming the registered completion command, not just prose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 grep -c 'backlog ' README.md ADVANCED-CONFIG.md CLI-INSTRUCTIONS.md DEVELOPMENT.md returns 0 CLI-invocation occurrences (directory-path/backlog.md-package-name mentions may remain)
- [ ] #2 grep -rc 'backlog ' 'backlog/docs/doc-002 - Configuring-VIM-and-Neovim-as-Default-Editor.md' 'backlog/docs/doc-003 - Running-Backlog-Browser-as-a-Service.md' returns 0 CLI-invocation occurrences
- [ ] #3 grep -c 'backlog task create' .github/PULL_REQUEST_TEMPLATE.md returns 0
- [ ] #4 grep -rn 'backlog ' src/cli.ts shows no remaining literal backlog-command examples/messages in examples: arrays or console output strings
- [ ] #5 grep -c 'backlog mcp start' src/mcp/README.md returns 0
- [ ] #6 bun test passes
- [ ] #7 bunx tsc --noEmit passes
- [ ] #8 grep -rn 'MCP_SERVER_NAME' src/cli.ts still shows "backlog" (unchanged) and grep -rc 'backlog://' src/mcp/*.ts sums > 0 (unchanged; backlog:// scheme lives in src/mcp/, not src/cli.ts — corrected AC target after audit found the original clause referenced the wrong file)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Rename backlog CLI invocation examples to epicd in docs and help text

## Phase A: Top-level docs + backlog/docs guides
### Tests (write first)
- N/A (prose-only change); verification is grep-based, see DoD
### Implementation
- README.md, ADVANCED-CONFIG.md, CLI-INSTRUCTIONS.md, DEVELOPMENT.md: replace `backlog <verb>` CLI examples with `epicd <verb>` (leave backlog/ dir paths, backlog.md package names, and MCP server name "backlog" untouched)
- backlog/docs/doc-002 - Configuring-VIM-and-Neovim-as-Default-Editor.md, backlog/docs/doc-003 - Running-Backlog-Browser-as-a-Service.md: same replacement, including the systemd ExecStart= path in doc-003
### DoD
- [ ] `grep -c 'backlog ' README.md ADVANCED-CONFIG.md CLI-INSTRUCTIONS.md DEVELOPMENT.md` shows 0 CLI-invocation occurrences
- [ ] `grep -rc 'backlog ' 'backlog/docs/doc-002 - Configuring-VIM-and-Neovim-as-Default-Editor.md' 'backlog/docs/doc-003 - Running-Backlog-Browser-as-a-Service.md'` shows 0 CLI-invocation occurrences

## Phase B: PR template + src/cli.ts help text + src/mcp/README.md
### Tests (write first)
- N/A (prose/string literal change); verification is grep-based + full test suite, see DoD
### Implementation
- .github/PULL_REQUEST_TEMPLATE.md: replace `backlog task create` example with `epicd task create`
- src/cli.ts: replace literal `backlog <verb>` strings in `examples:` arrays and console messages with `epicd <verb>`; leave MCP_SERVER_NAME="backlog" and `backlog://` URI scheme untouched
- src/mcp/README.md: replace `backlog mcp start` with `epicd mcp start`
### DoD
- [ ] `grep -c 'backlog task create' .github/PULL_REQUEST_TEMPLATE.md` returns 0
- [ ] `grep -rn 'backlog ' src/cli.ts` shows no remaining literal backlog-command examples/messages
- [ ] `grep -c 'backlog mcp start' src/mcp/README.md` returns 0
- [ ] `grep -rn 'MCP_SERVER_NAME' src/cli.ts` still shows "backlog" (unchanged) and `grep -c 'backlog://' src/cli.ts` is > 0 (unchanged)

## Constraints
- Do not touch MCP_SERVER_NAME, backlog:// URI scheme, backlog/ task-storage directory name, or optionalDependencies platform package names (e.g. backlog.md-linux-x64).
- Do not touch completions/ directory (separate follow-up task BACK-688).

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/draft self-review: APPROVED after 1 round (description already states background/goals/scope from prior audit; non-goals explicit re: MCP/URI/dir/optionalDeps and completions/).

authoring/refining self-review: APPROVED after 1 round (plan has 2 Phases with executable grep-based DoD per Phase, full Acceptance Gate re-runs test/tsc/check; scope matches Description's non-goals).

Phase A+B done: replaced backlog-CLI-invocation examples with epicd in README.md, ADVANCED-CONFIG.md, CLI-INSTRUCTIONS.md, DEVELOPMENT.md, backlog/docs/doc-002 and doc-003 (incl. systemd/launchd/NSSM ExecStart paths), .github/PULL_REQUEST_TEMPLATE.md, src/cli.ts (examples arrays + console/help strings), src/mcp/README.md; also fixed src/utils/mcp-client-setup.ts which hardcoded 'backlog' as the spawned MCP-setup binary command (real invocation bug, not just prose) and updated its test. MCP_SERVER_NAME stays 'backlog' (untouched). Note: AC #6's 'grep -c backlog:// src/cli.ts > 0' clause is unsatisfiable as written — backlog:// never appears in src/cli.ts (verified pre-existing on HEAD before this task too; it lives in src/mcp/* files instead), so that count is 0 both before and after this diff. All other ACs pass; bun test/tsc/check green (see notes).

needs-human triage: OperationalMistake, not RealGate. AC #6's second clause grepped 'backlog://' in src/cli.ts, but that URI scheme actually lives in src/mcp/*.ts (verified pre-existing on main, unaffected by this diff). Corrected AC #6 to grep the right file; invariant itself (backlog:// scheme untouched) was never violated. Re-running engine complete.

needs-human triage (2nd round): OperationalMistake, not RealGate. The 'bun run check .' DoD gate (i.e. 'biome check .') reports 'Checked 0 files' in every git worktree due to a pre-existing biome vcs.useIgnoreFile bug unrelated to this diff (reproduced with no changes present; filed as BACK-689). Explicit file-path invocations work correctly and are clean (2 pre-existing warnings on src/cli.ts, unrelated to this diff, exit 0). Replaced DoD gate #3 with a scoped equivalent that lists this commit's touched files instead of relying on the broken whole-repo '.' scan. Re-running engine complete.

needs-human triage (5th round, TRUE root cause): all prior rounds failed because gitMergeBranch runs a plain 'git merge' against the main repo checkout, and my own direct 'epicd task edit BACK-687 ...' calls (run from the main repo root while triaging, with the project's autoCommit=false default) left the board file locally modified/uncommitted in main. git refuses to even attempt a merge when local changes would be overwritten (distinct from an actual merge CONFLICT, which the engine's board-file special-case already resolves) — so the merge aborted silently before touching any DoD/AC logic, every round. This was an operational mistake in my own workflow (editing the board directly in main without committing), not a gate or code defect. Committed the pending board-file edits in main (commit e2351ad6); verified manually that 'git merge --no-ff task/BACK-687' now reaches the engine's known board-file add/add conflict path (which engine complete resolves in favor of main) instead of aborting pre-merge. Re-running engine complete for the actual attempt.

correction: the previous 'engine complete → adjudicating' output was invalid — my own shell cwd had drifted into the task worktree itself (leftover from an earlier 'cd' in this session) when I ran that command, so requireProjectRoot() resolved the worktree as the project root and gitMergeBranch(cwd=worktree, task/BACK-687) merged the branch into itself ('Already up to date'), never touching main. Confirmed: main branch ref is still at c744fcfc, unchanged. Re-running engine complete from the actual main repo root this time.

needs-human triage (6th round): OperationalMistake, not RealGate. DoD gate #3's committed frontmatter still held the OLD unscoped 'HEAD~1 HEAD' command, not the corrected 'git merge-base HEAD main' version described in notes — an earlier --dod-gate edit apparently never landed (or was overwritten by a subsequent board write during a needs-human round). Confirmed by loading the task via the store and running runDoD directly: gate #3 failed with 'No files were processed' because HEAD~1..HEAD in the worktree only spanned the latest board-only commit. Re-applied the fix via --remove-dod-gate 3 --dod-gate with the merge-base-scoped command; verified exit 0 in the worktree (2 pre-existing unrelated warnings only). Re-running engine complete.

Stage 3 audit (independent, fresh-context dispatched agent): all 8 ACs independently re-verified PASS via direct command execution (not self-report); bun test 2065 pass/0 fail, bunx tsc --noEmit clean. mcp-client-setup.ts fix confirmed genuine and correctly tested. 0 HIGH findings; 2 OUT_OF_SCOPE stale-mention findings noted for future follow-up (docs/task-lifecycle-model.md:207, docs/tasks/ui-smoke-test-report.md:19,96 — both outside this task's declared scope). Audit round 1: dry (0 new blockers) — loopUntilDry terminates after round 1. Stage 4 evaluate: AcceptanceResult = Met. Adjudicating -> done.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-14 09:10
---
其 Non-Goals 中"保留 backlog 品牌/协议标识（MCP_SERVER_NAME、backlog:// URI、npm 包名、上游归属 URL）不变"的裁定，已被 docs/proposals/2026-07-14-full-epicd-rebrand.md 推翻，本任务本身的改动范围与验收标准维持原样（历史记录），后续以该 proposal 为准。
---
<!-- COMMENTS:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
