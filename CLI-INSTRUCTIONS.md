# CLI Reference

Full command reference for Backlog.md. For getting started, see [README.md](README.md).

## Project Setup

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Initialize project | `epicd init [project-name]` (creates backlog structure with a minimal interactive flow) |
| Re-initialize | `epicd init` (preserves existing config, allows updates) |
| Advanced settings wizard | `epicd config` (no args) — launches the full interactive configuration flow |

`epicd init` keeps first-run setup focused on the essentials:
- **Project name** – identifier for your backlog (defaults to the current directory on re-run).
- **Backlog folder** – choose `backlog/`, `.backlog/`, or a custom project-relative path.
- **Config location** – for built-in folders, choose folder-local `config.yml` or root `backlog.config.yml`; custom paths use root `backlog.config.yml`.
- **Integration choice** – decide whether your AI tools use **CLI instructions** (recommended), the optional **MCP connector**, or no AI setup.
- **Instruction files (CLI path)** – the CLI setup writes a short nudge to AGENTS.md by default in non-interactive setup. Interactive setup lets you choose CLAUDE.md, AGENTS.md, GEMINI.md, Copilot instructions, or skip.
- **Advanced settings prompt** – default answer "No" finishes init immediately; choosing "Yes" jumps straight into the advanced wizard documented in [ADVANCED-CONFIG.md](ADVANCED-CONFIG.md).

The advanced wizard includes interactive Definition of Done defaults editing (add/remove/reorder/clear), so project checklist defaults can be managed without manual YAML edits.

You can rerun the wizard anytime with `epicd config`. All existing CLI flags (for example `--defaults`, `--agent-instructions`) continue to provide fully non-interactive setups, and init also supports `--backlog-dir <path>` plus `--config-location <folder|root>` for scripted configuration.

Humans and agents can run `epicd instructions` for workflow guides and `epicd instructions overview` for the overview.

## Documentation

- Document IDs are global across all subdirectories under `backlog/docs`. You can organize files in nested folders (e.g., `backlog/docs/guides/`), and `epicd doc list` and `epicd doc view <id>` work across the entire tree.
- Use `epicd doc create "New Guide" -p guides` to create a document in a docs subdirectory. The created output includes the persisted docs-relative file path, such as `backlog/docs/guides/doc-1 - New-Guide.md`.
- Use `epicd doc update doc-1 --content "Updated markdown"` to update document content. Add `--title`, `-t/--type`, `--tags`, or `-p/--path` to update metadata or move the document while preserving omitted fields.
- Use `epicd doc search "query"` for scoped document search with plain text output that includes document IDs and follow-up `epicd doc view <docId>` commands. Use `--limit <number>` to cap results.
- Document paths are always relative to the docs directory. Absolute paths and traversal segments such as `..` are rejected.

## Task Management

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create task | `epicd task create "Add OAuth System"`                    |
| Create with description | `epicd task create "Feature" -d "Add authentication system"` |
| Create with assignee | `epicd task create "Feature" -a @sara`           |
| Create with status | `epicd task create "Feature" -s "In Progress"`    |
| Create with labels | `epicd task create "Feature" -l auth,backend`     |
| Create with priority | `epicd task create "Feature" --priority high`     |
| Create with plan | `epicd task create "Feature" --plan "1. Research\n2. Implement"`     |
| Create with AC | `epicd task create "Feature" --ac "Must work,Must be tested"` |
| Add DoD items on create | `epicd task create "Feature" --dod "Run tests"` |
| Create without DoD defaults | `epicd task create "Feature" --no-dod-defaults` |
| Create with notes | `epicd task create "Feature" --notes "Started initial research"` |
| Create with final summary | `epicd task create "Feature" --final-summary "Completion summary"` |
| Create with deps | `epicd task create "Feature" --dep task-1,task-2` |
| Create with refs | `epicd task create "Feature" --ref https://docs.example.com --ref src/api.ts` |
| Create with docs | `epicd task create "Feature" --doc https://design-docs.example.com --doc docs/spec.md` |
| Create sub task | `epicd task create -p 14 "Add Login with Google"`|
| Create (all options) | `epicd task create "Feature" -d "Description" -a @sara -s "To Do" -l auth --priority high --ac "Must work" --notes "Initial setup done" --dep task-1 --ref src/api.ts --doc docs/spec.md -p 14` |
| List tasks  | `epicd task list [-s <status>] [-a <assignee>] [-p <parent>] [--labels <labels>] [--search <query>] [--limit <n>]` |
| List filtered | `epicd task list --labels frontend,bug --search "login" --limit 10 --plain` |
| List by parent | `epicd task list --parent 42` or `epicd task list -p task-42` |
| View detail | `epicd task 7` (interactive UI, press 'E' to edit in editor) |
| View (AI mode) | `epicd task 7 --plain`                           |
| Edit        | `epicd task edit 7 -a @sara -l auth,backend`       |
| Add plan    | `epicd task edit 7 --plan "Implementation approach"`    |
| Add AC      | `epicd task edit 7 --ac "New criterion" --ac "Another one"` |
| Add DoD     | `epicd task edit 7 --dod "Ship notes"` |
| Remove AC   | `epicd task edit 7 --remove-ac 2` (removes AC #2)      |
| Remove multiple ACs | `epicd task edit 7 --remove-ac 2 --remove-ac 4` (removes AC #2 and #4) |
| Check AC    | `epicd task edit 7 --check-ac 1` (marks AC #1 as done) |
| Check DoD   | `epicd task edit 7 --check-dod 1` (marks DoD #1 as done) |
| Check multiple ACs | `epicd task edit 7 --check-ac 1 --check-ac 3` (marks AC #1 and #3 as done) |
| Uncheck AC  | `epicd task edit 7 --uncheck-ac 3` (marks AC #3 as not done) |
| Uncheck DoD | `epicd task edit 7 --uncheck-dod 3` (marks DoD #3 as not done) |
| Mixed AC operations | `epicd task edit 7 --check-ac 1 --uncheck-ac 2 --remove-ac 4` |
| Mixed DoD operations | `epicd task edit 7 --check-dod 1 --uncheck-dod 2 --remove-dod 4` |
| Add notes   | `epicd task edit 7 --notes "Completed X, working on Y"` (replaces existing) |
| Append notes | `epicd task edit 7 --append-notes "New findings"` |
| Add comment | `epicd task edit 7 --comment "Question for review" --comment-author @sara` |
| Add final summary | `epicd task edit 7 --final-summary "Completion summary"` |
| Append final summary | `epicd task edit 7 --append-final-summary "More details"` |
| Clear final summary | `epicd task edit 7 --clear-final-summary` |
| Add deps    | `epicd task edit 7 --dep task-1 --dep task-2`     |
| Archive     | `epicd task archive 7`                             |

Task comments are append-only discussion entries with optional author labels. Use comments for review questions and collaboration notes; use implementation notes for execution progress and final summary for PR-ready completion notes.

### Multi-line input (description/plan/notes/comments/final summary)

The CLI preserves input literally — `\n` sequences are not auto-converted. Use one of the following forms (recommended order for AI agents):

**1. Repeat `--append-*` for each line (works in every shell, including Claude Code / Codex / agent sandboxes):**

```bash
epicd task edit 7 --notes "First line"
epicd task edit 7 --append-notes "Second line"
epicd task edit 7 --append-notes "Third line"
```

**2. Real newlines inside double quotes (single command):**

```bash
epicd task create "Feature" --desc "Line1
Line2

Final paragraph"
```

The same shape works for `--plan`, `--notes`, `--comment`, `--final-summary`, and the `--append-*` variants.

**3. Shell-specific shorthand (interactive shells only — rejected by tree-sitter-based agent sandboxes, see [#595](https://github.com/MrLesk/Backlog.md/issues/595)):**

- **Bash/Zsh (ANSI-C quoting)**

  ```bash
  epicd task edit 7 --notes $'Line1\nLine2'
  ```

- **POSIX sh (printf substitution)**

  ```bash
  epicd task create "Feature" --desc "$(printf 'Line1\nLine2\n\nFinal paragraph')"
  ```

- **PowerShell (backtick-n)**

  ```powershell
  epicd task create "Feature" --desc "Line1`nLine2`n`nFinal paragraph"
  ```

## Milestone Management

Milestones are managed through milestone files. Use CLI commands instead of editing milestone markdown directly so IDs, filenames, task references, and archive state stay consistent.

| Action | Example |
|--------|---------|
| List milestones | `epicd milestone list --plain` |
| List completed milestones too | `epicd milestone list --show-completed --plain` |
| Add milestone | `epicd milestone add "Release 1.0"` |
| Add with description | `epicd milestone add "Beta" --description "Beta scope"` |
| Rename and update tasks | `epicd milestone rename "Release 1.0" "Release 2.0"` |
| Rename without task updates | `epicd milestone rename m-1 "Release 2.0" --no-update-tasks` |
| Remove and clear task milestones | `epicd milestone remove "Release 1.0"` |
| Remove and keep task values | `epicd milestone remove "Release 1.0" --task-handling keep` |
| Remove and reassign tasks | `epicd milestone remove "Release 1.0" --task-handling reassign --reassign-to "Release 2.0"` |
| Archive milestone | `epicd milestone archive m-1` |

`milestone remove` task handling modes are `clear` (default), `keep`, and `reassign`. `--reassign-to` is required when using `--task-handling reassign`, and the target must be an active milestone file.

## Search

Find tasks, documents, and decisions across your entire backlog with fuzzy search:

| Action             | Example                                              |
|--------------------|------------------------------------------------------|
| Search tasks       | `epicd search "auth"`                        |
| Filter by status   | `epicd search "api" --status "In Progress"`   |
| Filter by priority | `epicd search "bug" --priority high`        |
| Combine filters    | `epicd search "web" --status "To Do" --priority medium` |
| Plain text output  | `epicd search "feature" --plain` (for scripts/AI) |

**Search features:**
- **Fuzzy matching** -- finds "authentication" when searching for "auth"
- **Interactive filters** -- refine your search in real-time with the TUI
- **Live filtering** -- see results update as you type (no Enter needed)

## Draft Workflow

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create draft | `epicd task create "Feature" --draft`             |
| Draft flow  | `epicd draft create "Spike GraphQL"` → `epicd draft promote 3.1` |
| Demote to draft| `epicd task demote <id>` |

## Dependency Management

Manage task dependencies to create execution sequences and prevent circular relationships:

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Add dependencies | `epicd task edit 7 --dep task-1 --dep task-2`     |
| Add multiple deps | `epicd task edit 7 --dep task-1,task-5,task-9`    |
| Create with deps | `epicd task create "Feature" --dep task-1,task-2` |
| View dependencies | `epicd task 7` (shows dependencies in task view)  |
| Validate dependencies | Use task commands to automatically validate dependencies |

**Dependency Features:**
- **Automatic validation**: Prevents circular dependencies and validates task existence
- **Flexible formats**: Use `task-1`, `1`, or comma-separated lists like `1,2,3`
- **Visual sequences**: Dependencies create visual execution sequences in board view
- **Completion tracking**: See which dependencies are blocking task progress

## Board Operations

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Kanban board      | `epicd board` (interactive UI, press 'E' to edit in editor) |
| Export board | `epicd board export [file]` (exports Kanban board to markdown) |
| Export with version | `epicd board export --export-version "v1.0.0"` (includes version in export) |

## Statistics & Overview

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Project overview | `epicd overview` (interactive TUI showing project statistics) |

## Web Interface

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Web interface | `epicd browser` (launches web UI on port 6420) |
| Web custom port | `epicd browser --port 8080 --no-open` |

To keep the Web UI running in the background with auto-start on boot, see [Running Backlog.md as a Service](backlog/docs/doc-003%20-%20Running-Backlog-Browser-as-a-Service.md).

## Documentation

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create doc | `epicd doc create "API Guidelines"` |
| Create with path | `epicd doc create "Setup Guide" -p guides/setup` |
| Create with type | `epicd doc create "Architecture" -t guide` |
| Update content | `epicd doc update doc-1 --content "Updated markdown"` |
| Update metadata/path | `epicd doc update doc-1 --title "Setup Handbook" -t guide --tags setup,runbook -p guides` |
| List docs | `epicd doc list` |
| Search docs | `epicd doc search "architecture" --limit 5` |
| View doc | `epicd doc view doc-1` |

## Decisions

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create decision | `epicd decision create "Use PostgreSQL for primary database"` |
| Create with status | `epicd decision create "Migrate to TypeScript" -s proposed` |

## Agent Instructions

| Action                                          | Example                                              |
|-------------------------------------------------|------------------------------------------------------|
| Open the local CLI documentation entry point | `epicd` |
| List workflow guides | `epicd instructions` |
| Required first read for task workflow | `epicd instructions overview` |
| Read a detailed workflow guide | `epicd instructions task-execution` |
| Update CLI agent instruction files | `epicd agents --update-instructions` (updates CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md) |

## Maintenance

| Action      | Example                                                                                      |
|-------------|----------------------------------------------------------------------------------------------|
| Cleanup done tasks | `epicd cleanup` (move old completed tasks to completed folder to cleanup the kanban board) |

Full help: `epicd --help`

---

## Sharing & Export

### Board Export

Export your Kanban board to a clean, shareable markdown file:

```bash
# Export to default Backlog.md file
epicd board export

# Export to custom file
epicd board export project-status.md

# Force overwrite existing file
epicd board export --force

# Export to README.md with board markers
epicd board export --readme

# Include a custom version string in the export
epicd board export --export-version "v1.2.3"
epicd board export --readme --export-version "Release 2024.12.1-beta"
```

Perfect for sharing project status, creating reports, or storing snapshots in version control.

---

## Shell Tab Completion

Backlog.md can install tab completion for bash, zsh, fish, and PowerShell.

**Quick Installation:**
```bash
# Auto-detect and install for your current shell
epicd completion install

# Or specify shell explicitly
epicd completion install --shell bash
epicd completion install --shell zsh
epicd completion install --shell fish
epicd completion install --shell pwsh
```

**What you get:**
- Command completion: `epicd <TAB>` → shows all commands
- Dynamic task IDs: `epicd task edit <TAB>` → shows actual task IDs from your backlog
- Smart flags: `--status <TAB>` → shows configured status values
- Context-aware suggestions for priorities, labels, and assignees

Full documentation: See [completions/README.md](completions/README.md) for detailed installation instructions, troubleshooting, and examples.
