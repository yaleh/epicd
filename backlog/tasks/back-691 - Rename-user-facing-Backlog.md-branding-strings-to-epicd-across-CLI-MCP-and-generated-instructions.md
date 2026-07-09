---
id: BACK-691
title: >-
  Rename user-facing 'Backlog.md' branding strings to epicd across CLI, MCP, and
  generated instructions
assignee:
  - '@claude'
created_date: '2026-07-09 02:51'
updated_date: '2026-07-09 03:25'
labels: []
dependencies:
  - BACK-688
ordinal: 104000
pipeline_id: execution
phase: adjudicating
dod:
  - text: bun test
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: >-
      git diff --name-only -z $(git merge-base HEAD main) HEAD -- .
      ':!backlog/tasks' | xargs -0 npx biome check --files-ignore-unknown=true
    checked: false
  - text: >-
      test -z "$(grep -rn 'Backlog\.md' src --include='*.ts' | grep -v
      'github.com/MrLesk/Backlog.md')"
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Background
BACK-681/687/688 renamed the CLI bin entry, CLI-invocation examples, and shell completions from `backlog` to `epicd`, but each explicitly scoped product-name prose out as a non-goal. ~63 non-test occurrences of the literal string "Backlog.md" remain as user-facing branding baked into src/**/*.ts: CLI prompts/errors, the UI banner, MCP tool descriptions, the workflow-guides/instructions overview text, and critically the generated CLAUDE.md scaffolding block. This produced a real bug: a fresh `epicd init --agent-instructions claude` run in another project (manda) generated a CLAUDE.md whose guidelines block still reads "Backlog.md Overview (CLI)" and "This project uses Backlog.md", and `epicd instructions overview` prints the same branding at runtime — contradicting the renamed `epicd` binary and confusing agents about which command name is authoritative.

## Goals
1. `grep -rn 'Backlog\.md' src --include='*.ts' | grep -v 'github.com/MrLesk/Backlog.md'` returns 0 lines.
2. `epicd init --agent-instructions claude --defaults` in a scratch directory produces a CLAUDE.md guidelines block that reads "epicd" branding, not "Backlog.md".
3. `epicd instructions overview` output contains no "Backlog.md" branding string.
4. `bun test` and `bunx tsc --noEmit` pass, with the 11 affected test files under src/test/*.test.ts updated in lockstep with the renamed strings they assert on.

## Approach
Mechanical rename of the product's display name from "Backlog.md" to "epicd" across ~20 non-test files: CLI prompts/errors in src/cli.ts, the UI banner in src/ui/root-entry.ts, MCP tool descriptions under src/mcp/tools/**, workflow-guides/instructions text in src/mcp/workflow-guides.ts and src/commands/instructions.ts, the CLAUDE.md scaffolding block in src/agent-instructions.ts, export headers in src/board.ts, and log lines in src/server/index.ts and src/commands/mcp.ts — plus the 11 test files that assert on the old strings. String-literal changes only; no logic changes.

## Non-Goals / Trade-offs
- `MCP_SERVER_NAME` constant value "backlog" — unchanged (external protocol identifier consumers already depend on).
- The `backlog://` MCP URI scheme — unchanged.
- The `backlog/` task-storage directory name — unchanged (renaming would break every existing repo's on-disk layout).
- optionalDependencies platform package names (e.g. `backlog.md-linux-x64`) — unchanged (npm package identity, separate from CLI branding).
- The upstream attribution URL `github.com/MrLesk/Backlog.md` — unchanged (points at a real external repo this project forked from, not something this project controls).
- Trade-off: this leaves "Backlog.md" as this repo's own historical origin/attribution while the live product surface (prompts, banners, generated docs) reads "epicd" — accepted as the continuation of the BACK-681/687/688 rename direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 grep -c "MCP_SERVER_NAME" src/cli.ts src/mcp/server.ts still resolves to the literal value "backlog" (unchanged) and grep -rc "backlog://" src/mcp/*.ts sums > 0 (unchanged)
- [ ] #2 grep -rn "backlog/" src/core/init.ts | grep -i "task-storage\|rootConfigPath\|backlogDir" shows the storage directory name is still "backlog" (unchanged)
- [ ] #3 bun test passes
- [ ] #4 bunx tsc --noEmit passes
- [ ] #5 grep -rn 'Backlog\.md' src --include='*.ts' | grep -v 'github.com/MrLesk/Backlog.md' returns 0 lines (github.com/MrLesk/Backlog.md upstream attribution URL in src/cli.ts and src/core/init.ts is the sole allowed exception)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Rename user-facing 'Backlog.md' branding strings to epicd across CLI, MCP, and generated instructions

## Phase A: agent-instructions.ts (CLAUDE.md scaffolding — root cause of the manda bug)
### Tests (write first)
- src/test/agent-instructions.test.ts: update assertions that check the generated/managed guidelines block content to expect "epicd" branding instead of "Backlog.md" (comment text, marker-adjacent prose). This makes the file red against current src/agent-instructions.ts.
### Implementation
- src/agent-instructions.ts: rename the "Backlog.md guidelines" comments/prose (lines ~57, 65, 176) and the guidelines block text itself to read "epicd".
### DoD
- [ ] `bun test src/test/agent-instructions.test.ts`
- [ ] `grep -c 'Backlog\.md' src/agent-instructions.ts` returns 0

## Phase B: instructions overview + workflow-guides text (epicd instructions overview output)
### Tests (write first)
- src/test/cli-instructions.test.ts: update assertions on `epicd instructions overview`/`epicd instructions <guide>` output text to expect "epicd" branding, not "Backlog.md".
### Implementation
- src/commands/instructions.ts: rename "Backlog.md instructions" / "Backlog.md workflow guides" / "show Backlog.md workflow instructions" strings.
- src/mcp/workflow-guides.ts: rename "How to initialize Backlog.md in this directory" and any other Backlog.md-branded guide text.
- src/mcp/tools/workflow/index.ts: rename "Retrieve Backlog.md workflow guidance..." tool description.
### DoD
- [ ] `bun test src/test/cli-instructions.test.ts`
- [ ] `grep -rc 'Backlog\.md' src/commands/instructions.ts src/mcp/workflow-guides.ts src/mcp/tools/workflow/index.ts | awk -F: '{s+=$2} END{print s+0}'` returns 0

## Phase C: CLI prompts/errors + UI banner
### Tests (write first)
- src/test/cli-init.test.ts: update assertions on init-flow prompt/error text (e.g. "How should Backlog.md initialize this project?", "No Backlog.md project found") to expect epicd branding.
- src/test/cli-root-entry.test.ts: update assertions on the root banner text ("Backlog.md v...", "This directory is not initialized for Backlog.md.") to expect epicd branding.
- src/test/cli-agents.test.ts: update assertions on agent-nudge command descriptions ("Backlog.md CLI nudge") to expect epicd branding.
### Implementation
- src/cli.ts: rename all "Backlog.md" prompt/error/help strings except `mcpGuideUrl` (github.com/MrLesk/Backlog.md, kept per Non-Goals) and the `MCP_SERVER_NAME`/`backlog://` literals (kept per Non-Goals).
- src/ui/root-entry.ts: rename the banner/uninitialized-directory strings.
- src/commands/advanced-config-wizard.ts: rename "Install Claude Code Backlog.md agent?" prompt.
- src/utils/find-backlog-root.ts: rename doc-comment prose (non-functional, but part of the branding sweep).
- src/core/init.ts: rename doc-comment prose; keep `MCP_GUIDE_URL` value unchanged per Non-Goals.
### DoD
- [ ] `bun test src/test/cli-init.test.ts src/test/cli-root-entry.test.ts src/test/cli-agents.test.ts`
- [ ] `grep -rn 'Backlog\.md' src/cli.ts | grep -v 'github.com/MrLesk/Backlog.md'` returns 0 lines

## Phase D: MCP tool descriptions + server strings
### Tests (write first)
- src/test/mcp-fallback.test.ts, src/test/mcp-server.test.ts, src/test/mcp-stdio-exit.test.ts, src/test/mcp-roots-discovery.test.ts: update assertions on MCP tool/resource description text and server startup/log strings to expect epicd branding.
### Implementation
- src/mcp/tools/documents/index.ts, src/mcp/tools/tasks/index.ts, src/mcp/resources/init-required/index.ts, src/mcp/tools/definition-of-done/handlers.ts: rename tool/resource description strings and error messages.
- src/mcp/server.ts: rename doc-comment prose and the session-start instructions string (line ~56) — keep `MCP_SERVER_NAME` value "backlog" unchanged per Non-Goals.
- src/commands/mcp.ts: rename doc-comment and the "Backlog.md MCP server started" console message.
### DoD
- [ ] `bun test src/test/mcp-fallback.test.ts src/test/mcp-server.test.ts src/test/mcp-stdio-exit.test.ts src/test/mcp-roots-discovery.test.ts`
- [ ] `grep -rc 'Backlog\.md' src/mcp/tools/documents/index.ts src/mcp/tools/tasks/index.ts src/mcp/resources/init-required/index.ts src/mcp/tools/definition-of-done/handlers.ts src/mcp/server.ts src/commands/mcp.ts | awk -F: '{s+=$2} END{print s+0}'` returns 0

## Phase E: board export headers + browser server banner
### Tests (write first)
- src/test/cli-docs-board.test.ts, src/test/board.test.ts: update assertions on Kanban board export header text ("powered by Backlog.md") to expect epicd branding.
### Implementation
- src/board.ts: rename the two export header strings (lines ~78, ~264).
- src/server/index.ts: rename the "🚀 Backlog.md browser interface running..." console message.
### DoD
- [ ] `bun test src/test/cli-docs-board.test.ts src/test/board.test.ts`
- [ ] `grep -c 'Backlog\.md' src/board.ts src/server/index.ts` returns 0

## Constraints
- Do not touch `MCP_SERVER_NAME` value "backlog", the `backlog://` URI scheme, the `backlog/` task-storage directory name, optionalDependencies platform package names, or the `github.com/MrLesk/Backlog.md` attribution URL — all unchanged per the task's Non-Goals.
- String-literal renames only; no behavior/logic changes.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `grep -rn 'Backlog\.md' src --include='*.ts' | grep -v 'github.com/MrLesk/Backlog.md'` returns 0 lines
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/draft self-review: APPROVED after 1 round (background states the manda-bug motivation; all 4 goals are runnable checks; approach matches file survey already done; non-goals carried forward from BACK-687/688 precedent, corrected to exclude the upstream attribution URL)

authoring/refining review: APPROVED after 1 iteration (5 phases, each grouping a test file with its corresponding src file for genuine red-green since string-literal changes flip existing test assertions; Acceptance Gate leads with full bun test; all goals covered; no forward phase dependencies)
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
