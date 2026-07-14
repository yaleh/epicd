
When you're working on a task, you should assign it yourself: -a @{your-name}

In addition to the rules above, please consider the following:
At the end of every task implementation, try to take a moment to see if you can simplify it. 
When you are done implementing, you know much more about a task than when you started.
At this point you can better judge retrospectively what can be the simplest architecture to solve the problem.
If you can simplify the code, do it.

## Simplicity-first implementation rules

- Prefer a single implementation for similar concerns. Reuse or refactor to a shared helper instead of duplicating.
- Keep APIs minimal. Favor load + upsert over load/save/update, and do not add unused methods.
- Avoid extra layers (services, normalizers, versioning) unless there is an immediate, proven need.
- Keep behavior consistent across similar stores (defaults, parse errors, locking). Divergence requires a clear reason.
- Don't add new exported helpers just to compute a path; derive from existing paths or add one shared helper only when reused.

## Task decomposition granularity

- A **Basic task ≈ one reviewable PR** — sized up to ~2000 lines of change, delivered through one worktree + one merge + one gate cycle.
- Structure a task's work **inside its plan** using two levels: **Phase** (a recoverable checkpoint) → **Stage** (informal sub-step). A ~2000-line change is organized as a few Phases with a few Stages each — not as many separate tasks.
- **Decompose an epic by deliverable, not by concern/file.** Do NOT create a separate task per field, per filter, or per small edit — fold related changes into one PR-sized Basic task. Over-decomposition turns coordination overhead (gates, worktrees, merges, reviews) into the dominant cost.
- **Confirm Epic status at plan time using this test — do not decompose unless both hold:**
  - (a) You can name **≥2 independently reviewable/mergeable deliverables**. A sequence of steps toward one deliverable (schema → engine wiring → CLI → web page for the same feature) is not multiple deliverables — it's Phases/Stages inside one Basic task's plan.
  - (b) The deliverables' combined size estimate has real margin over the ~2000-line ceiling — aim for **≥1.8-2x (≈3600+ lines)**, not a marginal overage. Splits that only clear the ceiling by 10-30% rarely pay for the fixed cost of extra gate/worktree/merge/review cycles; default those to a single Basic task.
  - Anchor size estimates to comparable past work instead of guessing: e.g. "new store + engine wiring + CLI + web integration" has historically run 4000-8000 lines; a single API extension or point fix has run 1000-1500 lines.
  - Red flag during decomposition: if any planned child is a trivial administrative/verification step (a marker file, a smoke-test stub, an audit-only note) rather than a real deliverable, that's concern-based over-decomposition — fold it back into its parent's Stages.
  - If you can't yet name a second deliverable, start as Basic. Only convert to an Epic mid-implementation if the actual scope demonstrably overruns Basic size — don't pre-split on a hunch.
- This applies to both human authoring and the engine's future dogfood decompose.

## Acceptance Criteria conventions when authoring a task

Acceptance Criteria are the single place that states what must be true when a task is done. **Do not add a separate "不动点" / "fixpoint" or "严格不改" section** — that framing repeatedly caused errors (it read as "a list of files to freeze" and the freeze-list ended up enshrining the very thing that was blocking the goal). Fold both of the things those sections used to capture into Acceptance Criteria, and keep un-checkable scope prose in a plain "改动范围 / 非目标" (scope / non-goals) note.

- **Convergence targets → machine-checkable ACs.** When a task's deliverable *is* a convergence mechanism, write the end-state as ACs a script/test verifies: what monotonically shrinks, the termination condition, and the exact command that goes green — not a prose claim that it terminates. This is ADR-019 integration-acceptance: the meter is *runnable*, not asserted.
- **Invariants ("X must not change") → negative ACs, each with its own check.** State the invariant as an AC whose verification names the concrete check (e.g. "MCP server name stays `backlog`; verify: `grep MCP_SERVER_NAME src/cli.ts`"). Every such AC must be literally true for this task's actual diff. If the task's own plan changes something you were tempted to freeze, it is **not** an invariant — describe it honestly under "改动范围" instead.
- **Do not use ACs to argue a change is safe.** State checkable facts, not rationalizations ("this is an extension, not a rewrite" is not an AC).
- If a sibling/parent task declares an invariant your task must break, reconcile that text (or split the work) — don't silently contradict it.
- **Trace the consumer before writing the AC.** If an AC claims a change is visible to an external tool/process/file-format consumer, name the exact field or code path that consumer actually reads or compares — verified by reading its real logic/schema — not just "the value appears in the file somewhere." A grep-for-string-presence check is not equivalent to a check against the consumer's real read path (e.g. a marketplace manifest can carry the same key name at two different JSON paths — a top-level schema-version field and a nested per-plugin version field — and only one of them is what the consuming tool compares).
- **Adversarially self-check each AC set before finalizing it.** Ask: "could every AC here go green while the task's actual goal is still unmet?" If yes, add the AC that closes that gap — don't leave it for the audit stage to discover. Any task whose goal is only observable outside this repo's own automated tests (an external tool's behavior, a sync that only takes effect on the next release cut, a downstream consumer's read path) must not skip the independent audit round on a "low risk" rationale — CI passing cannot verify that class of goal, so RiskGated(False) does not apply.

Note: "fixpoint" is still the correct name for the **engine's** Stage 2 self-host gate (a genuine fixed point: the driver rebuilds and reproduces itself). That mechanism keeps its name; only the task-authoring descriptor is retired.

## Commands

### Development

- `bun i` - Install dependencies
- `bun test --parallel` - Run all tests (file-level parallel; implies --isolate, requires bun >= 1.3.13)
- `bunx tsc --noEmit` - Type-check code
- `bun run check .` - Run all Biome checks (format + lint)
- `bun run build` - Build the CLI tool
- `bun run cli` - Uses the CLI tool directly

### Testing

- `bun test --parallel` - Run all tests in parallel worker processes (implies --isolate; requires bun >= 1.3.13)
- `bun test <filename>` - Run specific test file

### Configuration Management

- `bun run cli config list` - View all configuration values
- `bun run cli config get <key>` - Get a specific config value (e.g. defaultEditor)
- `bun run cli config set <key> <value>` - Set a config value with validation

## Core Structure

- **CLI Tool**: Built with Bun and TypeScript as a global npm package (`npm i -g backlog.md`)
- **Source Code**: Located in `/src` directory with modular TypeScript structure
- **Task Management**: Uses markdown files in `.epicd/` directory structure
- **Workflow**: Git-integrated with task IDs referenced in commits and PRs

## Agent POV

- Treat Backlog.md as a shipped CLI/MCP binary that may be used from other repositories where agents cannot inspect this source tree.
- Backlog.md is not a supported JavaScript or TypeScript library API for external consumers. Do not treat exported source symbols, classes, or methods in `/src` as stable public interfaces unless they are explicitly documented in shipped CLI/MCP/instruction surfaces.
- When you decide what another agent can rely on, use only the public surface: MCP workflow resources, MCP tool descriptions/schemas, CLI help, and instruction files shipped with the project.
- Do not assume external agents know internal implementation details, constants, or source-only conventions.
- When reviewing changes, do not ask for compatibility shims just because a source-level method exists or was removed. Only preserve compatibility for behavior that is part of the documented CLI, MCP, config, or instruction contract.
- If a convention matters for agent behavior, document it in the public MCP/instruction surface rather than relying on source-code discovery.

## Code Standards

- **Runtime**: Bun with TypeScript 5
- **Formatting**: Biome with tab indentation and double quotes
- **Linting**: Biome recommended rules
- **Testing**: Bun's built-in test runner
- **Pre-commit**: Husky + lint-staged automatically runs Biome checks before commits

The pre-commit hook automatically runs `biome check --write` on staged files to ensure code quality. If linting errors
are found, the commit will be blocked until fixed.

## Git Workflow

- **Branching**: Use feature branches when working on tasks (e.g. `tasks/back-123-feature-name`)
- **Committing**: Use the following format: `BACK-123 - Title of the task`
- **PR titles**: Use `{taskId} - {taskTitle}` (e.g. `BACK-123 - Title of the task`)
- **Github CLI**: Use `gh` whenever possible for PRs and issues

<!-- EPICD GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `epicd instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Use the detailed guides when needed:
- `epicd instructions task-creation` for creating or splitting tasks
- `epicd instructions task-execution` for planning and implementation workflow
- `epicd instructions task-finalization` for completion and handoff

Use `epicd <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `epicd` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- EPICD GUIDELINES END -->

## L0 Config

test-cmd: bun test
test-all: bun test
doc-path: docs
worktree-symlinks: node_modules
