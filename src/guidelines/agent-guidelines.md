# Instructions for the usage of epicd CLI Tool

## epicd: Comprehensive Project Management Tool via CLI

### Assistant Objective

Efficiently manage all project tasks, status, and documentation using the epicd CLI, ensuring all project metadata
remains fully synchronized and up-to-date.

### Core Capabilities

- ✅ **Task Management**: Create, edit, assign, prioritize, and track tasks with full metadata
- ✅ **Search**: Fuzzy search across tasks, documents, and decisions with `epicd search`
- ✅ **Acceptance Criteria**: Granular control with add/remove/check/uncheck by index
- ✅ **Definition of Done checklists**: Per-task DoD items with add/remove/check/uncheck
- ✅ **Board Visualization**: Terminal-based Kanban board (`epicd board`) and web UI (`epicd browser`)
- ✅ **Git Integration**: Automatic tracking of task states across branches
- ✅ **Dependencies**: Task relationships and subtask hierarchies
- ✅ **Documentation & Decisions**: Structured docs and architectural decision records
- ✅ **Export & Reporting**: Generate markdown reports and board snapshots
- ✅ **AI-Optimized**: `--plain` flag provides clean text output for AI processing

### Why This Matters to You (AI Agent)

1. **Comprehensive system** - Full project management capabilities through CLI
2. **The CLI is the interface** - All operations go through `epicd` commands
3. **Unified interaction model** - You can use CLI for both reading (`epicd task 1 --plain`) and writing (
   `epicd task edit 1`)
4. **Metadata stays synchronized** - The CLI handles all the complex relationships

### Key Understanding

- **Tasks** live in `backlog/tasks/` as `task-<id> - <title>.md` files
- **You interact via CLI only**: `epicd task create`, `epicd task edit`, etc.
- **Use `--plain` flag** for AI-friendly output when viewing/listing
- **Never bypass the CLI** - It handles Git, metadata, file naming, and relationships

---

# ⚠️ CRITICAL: NEVER EDIT TASK FILES DIRECTLY. Edit Only via CLI

**ALL task operations MUST use the epicd CLI commands**

- ✅ **DO**: Use `epicd task edit` and other CLI commands
- ✅ **DO**: Use `epicd task create` to create new tasks
- ✅ **DO**: Use `epicd task edit <id> --check-ac <index>` to mark acceptance criteria
- ❌ **DON'T**: Edit markdown files directly
- ❌ **DON'T**: Manually change checkboxes in files
- ❌ **DON'T**: Add or modify text in task files without using CLI

**Why?** Direct file editing breaks metadata synchronization, Git tracking, and task relationships.

---

## 1. Source of Truth & File Structure

### 📖 **UNDERSTANDING** (What you'll see when reading)

- Markdown task files live under **`backlog/tasks/`**
- Files are named: `task-<id> - <title>.md` (e.g., `task-42 - Add GraphQL resolver.md`)
- Project documentation is in **`backlog/docs/`**
- Project decisions are in **`backlog/decisions/`**

### 🔧 **ACTING** (How to change things)

- **All task operations MUST use the epicd CLI tool**
- This ensures metadata is correctly updated and the project stays in sync
- **Always use `--plain` flag** when listing or viewing tasks for AI-friendly text output
- Create and update project docs through epicd APIs so frontmatter and paths stay valid. For CLI users, run `epicd doc create "Title" -p guides/setup` or `epicd doc update doc-1 --content "Updated markdown"`; MCP users should use `document_create` / `document_update`.
- Document paths are relative to `backlog/docs/`; absolute paths and `..` traversal are rejected.

---

## 2. Common Mistakes to Avoid

### ❌ **WRONG: Direct File Editing**

```markdown
# DON'T DO THIS:

1. Open backlog/tasks/task-7 - Feature.md in editor
2. Change "- [ ]" to "- [x]" manually
3. Add notes, comments, or final summary directly to the file
4. Save the file
```

### ✅ **CORRECT: Using CLI Commands**

```bash
# DO THIS INSTEAD:
epicd task edit 7 --check-ac 1  # Mark AC #1 as complete
epicd task edit 7 --notes "Implementation complete"  # Add notes
epicd task edit 7 --comment "Review question" --comment-author @agent-k  # Add comment
epicd task edit 7 --final-summary "PR-style summary"  # Add final summary
epicd task edit 7 -s "In Progress" -a @agent-k  # Multiple commands: change status and assign the task when you start working on the task
```

---

## 3. Understanding Task Format (Read-Only Reference)

⚠️ **FORMAT REFERENCE ONLY** - The following sections show what you'll SEE in task files.
**Never edit these directly! Use CLI commands to make changes.**

### Task Structure You'll See

```markdown
---
id: task-42
title: Add GraphQL resolver
status: To Do
assignee: [@sara]
labels: [backend, api]
modified_files:
  - src/server/api.ts
  - src/web/components/TaskList.tsx
---

## Description

Brief explanation of the task purpose.

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 First criterion
- [x] #2 Second criterion (completed)
- [ ] #3 Third criterion

<!-- AC:END -->

## Definition of Done

<!-- DOD:BEGIN -->

- [ ] #1 Tests pass
- [ ] #2 Docs updated

<!-- DOD:END -->

## Implementation Plan

1. Research approach
2. Implement solution

## Implementation Notes

Progress notes captured during implementation.

## Comments

Task discussion, review questions, and collaboration notes.

## Final Summary

PR-style summary of what was implemented.
```

### How to Modify Each Section

| What You Want to Change | CLI Command to Use                                       |
|-------------------------|----------------------------------------------------------|
| Title                   | `epicd task edit 42 -t "New Title"`                    |
| Status                  | `epicd task edit 42 -s "In Progress"`                  |
| Assignee                | `epicd task edit 42 -a @sara`                          |
| Labels                  | `epicd task edit 42 -l backend,api`                    |
| Description             | `epicd task edit 42 -d "New description"`              |
| Add AC                  | `epicd task edit 42 --ac "New criterion"`              |
| Add DoD                 | `epicd task edit 42 --dod "Ship notes"`                |
| Check AC #1             | `epicd task edit 42 --check-ac 1`                      |
| Check DoD #1            | `epicd task edit 42 --check-dod 1`                     |
| Uncheck AC #2           | `epicd task edit 42 --uncheck-ac 2`                    |
| Uncheck DoD #2          | `epicd task edit 42 --uncheck-dod 2`                   |
| Remove AC #3            | `epicd task edit 42 --remove-ac 3`                     |
| Remove DoD #3           | `epicd task edit 42 --remove-dod 3`                    |
| Add Plan                | `epicd task edit 42 --plan "1. Step one\n2. Step two"` |
| Add Notes (replace)     | `epicd task edit 42 --notes "What I did"`              |
| Append Notes            | `epicd task edit 42 --append-notes "Another note"` |
| Add Comment             | `epicd task edit 42 --comment "Review question" --comment-author @agent` |
| Add Final Summary       | `epicd task edit 42 --final-summary "PR-style summary"` |
| Append Final Summary    | `epicd task edit 42 --append-final-summary "Another detail"` |
| Clear Final Summary     | `epicd task edit 42 --clear-final-summary` |

---

## 4. Defining Tasks

### Creating New Tasks

**Always use CLI to create tasks:**

```bash
# Example
epicd task create "Task title" -d "Description" --ac "First criterion" --ac "Second criterion"
```

### Title (one liner)

Use a clear brief title that summarizes the task.

### Description (The "why")

Provide a concise summary of the task purpose and its goal. Explains the context without implementation details.

### Acceptance Criteria (The "what")

**Understanding the Format:**

- Acceptance criteria appear as numbered checkboxes in the markdown files
- Format: `- [ ] #1 Criterion text` (unchecked) or `- [x] #1 Criterion text` (checked)

**Managing Acceptance Criteria via CLI:**

⚠️ **IMPORTANT: How AC Commands Work**

- **Adding criteria (`--ac`)** accepts multiple flags: `--ac "First" --ac "Second"` ✅
- **Checking/unchecking/removing** accept multiple flags too: `--check-ac 1 --check-ac 2` ✅
- **Mixed operations** work in a single command: `--check-ac 1 --uncheck-ac 2 --remove-ac 3` ✅

```bash
# Examples

# Add new criteria (MULTIPLE values allowed)
epicd task edit 42 --ac "User can login" --ac "Session persists"

# Check specific criteria by index (MULTIPLE values supported)
epicd task edit 42 --check-ac 1 --check-ac 2 --check-ac 3  # Check multiple ACs
# Or check them individually if you prefer:
epicd task edit 42 --check-ac 1    # Mark #1 as complete
epicd task edit 42 --check-ac 2    # Mark #2 as complete

# Mixed operations in single command
epicd task edit 42 --check-ac 1 --uncheck-ac 2 --remove-ac 3

# ❌ STILL WRONG - These formats don't work:
# epicd task edit 42 --check-ac 1,2,3  # No comma-separated values
# epicd task edit 42 --check-ac 1-3    # No ranges
# epicd task edit 42 --check 1         # Wrong flag name

# Multiple operations of same type
epicd task edit 42 --uncheck-ac 1 --uncheck-ac 2  # Uncheck multiple ACs
epicd task edit 42 --remove-ac 2 --remove-ac 4    # Remove multiple ACs (processed high-to-low)
```

### Definition of Done checklist (per-task)

Definition of Done items are a second checklist in each task. Defaults come from `definition_of_done` in the project config file (`.epicd/config.yml`, `backlog/config.yml`, `.backlog/config.yml`, or `backlog.config.yml`) or from Web UI Settings, and can be disabled per task.

**Managing Definition of Done via CLI:**

```bash
# Add DoD items (MULTIPLE values allowed)
epicd task edit 42 --dod "Run tests" --dod "Update docs"

# Check/uncheck DoD items by index (MULTIPLE values supported)
epicd task edit 42 --check-dod 1 --check-dod 2
epicd task edit 42 --uncheck-dod 1

# Remove DoD items by index
epicd task edit 42 --remove-dod 2

# Create without defaults
epicd task create "Feature" --no-dod-defaults
```

**Key Principles for Good ACs:**

- **Outcome-Oriented:** Focus on the result, not the method.
- **Testable/Verifiable:** Each criterion should be objectively testable
- **Clear and Concise:** Unambiguous language
- **Complete:** Collectively cover the task scope
- **User-Focused:** Frame from end-user or system behavior perspective

Good Examples:

- "User can successfully log in with valid credentials"
- "System processes 1000 requests per second without errors"
- "CLI preserves literal newlines in description/plan/notes/comments/final summary; `\\n` sequences are not auto-converted"

Bad Example (Implementation Step):

- "Add a new function handleLogin() in auth.ts"
- "Define expected behavior and document supported input patterns"

### Task Breakdown Strategy

1. Identify foundational components first
2. Create tasks in dependency order (foundations before features)
3. Ensure each task delivers value independently
4. Avoid creating tasks that block each other

### Task Requirements

- Tasks must be **atomic** and **testable** or **verifiable**
- Each task should represent a single unit of work for one PR
- **Never** reference future tasks (only tasks with id < current task id)
- Ensure tasks are **independent** and don't depend on future work

---

## 5. Implementing Tasks

### 5.1. First step when implementing a task

The very first things you must do when you take over a task are:

* set the task in progress
* assign it to yourself

```bash
# Example
epicd task edit 42 -s "In Progress" -a @{myself}
```

### 5.2. Review Task References and Documentation

Before planning, check if the task has any attached `references` or `documentation`:
- **References**: Related code files, GitHub issues, or URLs relevant to the implementation
- **Documentation**: Design docs, API specs, or other materials for understanding context

These are visible in the task view output. Review them to understand the full context before drafting your plan.

### 5.3. Create an Implementation Plan (The "how")

Previously created tasks contain the why and the what. Once you are familiar with that part you should think about a
plan on **HOW** to tackle the task and all its acceptance criteria. This is your **Implementation Plan**.
First do a quick check to see if all the tools that you are planning to use are available in the environment you are
working in.
When you are ready, write it down in the task so that you can refer to it later.

```bash
# Example
epicd task edit 42 --plan "1. Research codebase for references\n2Research on internet for similar cases\n3. Implement\n4. Test"
```

## 5.4. Implementation

Once you have a plan, you can start implementing the task. This is where you write code, run tests, and make sure
everything works as expected. Follow the acceptance criteria one by one and MARK THEM AS COMPLETE as soon as you
finish them.

### 5.5 Implementation Notes (Progress log)

Use Implementation Notes to log progress, decisions, and blockers as you work.
Append notes progressively during implementation using `--append-notes`:

```
epicd task edit 42 --append-notes "Investigated root cause" --append-notes "Added tests for edge case"
```

```bash
# Example
epicd task edit 42 --notes "Initial implementation done; pending integration tests"
```

### 5.6 Final Summary (PR description)

When you are done implementing a task you need to prepare a PR description for it.
Because you cannot create PRs directly, write the PR as a clean summary in the Final Summary field.

**Quality bar:** Write it like a reviewer will see it. A one‑liner is rarely enough unless the change is truly trivial.
Include the key scope so someone can understand the impact without reading the whole diff.

```bash
# Example
epicd task edit 42 --final-summary "Implemented pattern X because Reason Y; updated files Z and W; added tests"
```

**IMPORTANT**: Do NOT include an Implementation Plan when creating a task. The plan is added only after you start the
implementation.

- Creation phase: provide Title, Description, Acceptance Criteria, and optionally labels/priority/assignee.
- When you begin work, switch to edit, set the task in progress and assign to yourself
  `epicd task edit <id> -s "In Progress" -a "..."`.
- Think about how you would solve the task and add the plan: `epicd task edit <id> --plan "..."`.
- After updating the plan, share it with the user and ask for confirmation. Do not begin coding until the user approves the plan or explicitly tells you to skip the review.
- Append Implementation Notes during implementation using `--append-notes` as progress is made.
- Add Final Summary only after completing the work: `epicd task edit <id> --final-summary "..."` (replace) or append using `--append-final-summary`.

## Phase discipline: What goes where

- Creation: Title, Description, Acceptance Criteria, labels/priority/assignee.
- Implementation: Implementation Plan (after moving to In Progress and assigning to yourself) + Implementation Notes (progress log, appended as you work).
- Wrap-up: Final Summary (PR description), verify AC and Definition of Done checks.

**IMPORTANT**: Only implement what's in the Acceptance Criteria. If you need to do more, either:

1. Update the AC first: `epicd task edit 42 --ac "New requirement"`
2. Or create a new follow up task: `epicd task create "Additional feature"`

---

## 6. Typical Workflow

```bash
# 1. Identify work
epicd task list -s "To Do" --plain

# 2. Read task details
epicd task 42 --plain

# 3. Start work: assign yourself & change status
epicd task edit 42 -s "In Progress" -a @myself

# 4. Add implementation plan
epicd task edit 42 --plan "1. Analyze\n2. Refactor\n3. Test"

# 5. Share the plan with the user and wait for approval (do not write code yet)

# 6. Work on the task (write code, test, etc.)

# 7. Mark acceptance criteria as complete (supports multiple in one command)
epicd task edit 42 --check-ac 1 --check-ac 2 --check-ac 3  # Check all at once
# Or check them individually if preferred:
# epicd task edit 42 --check-ac 1
# epicd task edit 42 --check-ac 2
# epicd task edit 42 --check-ac 3

# 8. Add Final Summary (PR Description)
epicd task edit 42 --final-summary "Refactored using strategy pattern, updated tests"

# 9. Mark task as done
epicd task edit 42 -s Done
```

---

## 7. Definition of Done (DoD)

A task is **Done** only when **ALL** of the following are complete:

### ✅ Via CLI Commands:

1. **All acceptance criteria checked**: Use `epicd task edit <id> --check-ac <index>` for each
2. **All Definition of Done items checked**: Use `epicd task edit <id> --check-dod <index>` for each
3. **Final Summary added**: Use `epicd task edit <id> --final-summary "..."`
4. **Status set to Done**: Use `epicd task edit <id> -s Done`

### ✅ Via Code/Testing:

5. **Tests pass**: Run test suite and linting
6. **Documentation updated**: Update relevant docs if needed
7. **Code reviewed**: Self-review your changes
8. **No regressions**: Performance, security checks pass

⚠️ **NEVER mark a task as Done without completing ALL items above**

---

## 8. Finding Tasks and Content with Search

When users ask you to find tasks related to a topic, use the `epicd search` command with `--plain` flag:

```bash
# Search for tasks about authentication
epicd search "auth" --plain

# Search only in tasks (not docs/decisions)
epicd search "login" --type task --plain

# Search with filters
epicd search "api" --status "In Progress" --plain
epicd search "bug" --priority high --plain

# Find tasks that modified a project file path
epicd search --modified-file src/server/api.ts --plain
```

**Key points:**
- Uses fuzzy matching - finds "authentication" when searching "auth"
- Searches task titles, descriptions, and content
- Also searches `modified_files`; `--modified-file` applies a case-insensitive path substring filter
- Also searches documents and decisions unless filtered with `--type task`
- Always use `--plain` flag for AI-readable output

---

## 9. Quick Reference: DO vs DON'T

### Viewing and Finding Tasks

| Task         | ✅ DO                        | ❌ DON'T                         |
|--------------|-----------------------------|---------------------------------|
| View task    | `epicd task 42 --plain`   | Open and read .md file directly |
| List tasks   | `epicd task list --plain` | Browse backlog/tasks folder     |
| Check status | `epicd task 42 --plain`   | Look at file content            |
| Find by topic| `epicd search "auth" --plain` | Manually grep through files |

### Modifying Tasks

| Task          | ✅ DO                                 | ❌ DON'T                           |
|---------------|--------------------------------------|-----------------------------------|
| Check AC      | `epicd task edit 42 --check-ac 1`  | Change `- [ ]` to `- [x]` in file |
| Add notes     | `epicd task edit 42 --notes "..."` | Type notes into .md file          |
| Add comment   | `epicd task edit 42 --comment "..." --comment-author @agent` | Type comment into .md file |
| Add final summary | `epicd task edit 42 --final-summary "..."` | Type summary into .md file |
| Change status | `epicd task edit 42 -s Done`       | Edit status in frontmatter        |
| Add AC        | `epicd task edit 42 --ac "New"`    | Add `- [ ] New` to file           |

---

## 10. Complete CLI Command Reference

### Task Creation

| Action           | Command                                                                             |
|------------------|-------------------------------------------------------------------------------------|
| Create task      | `epicd task create "Title"`                                                       |
| With description | `epicd task create "Title" -d "Description"`                                      |
| With AC          | `epicd task create "Title" --ac "Criterion 1" --ac "Criterion 2"`                 |
| With final summary | `epicd task create "Title" --final-summary "PR-style summary"`                 |
| With references  | `epicd task create "Title" --ref src/api.ts --ref https://github.com/issue/123`   |
| With documentation | `epicd task create "Title" --doc https://design-docs.example.com`               |
| With modified files | `epicd task create "Title" --modified-file src/api.ts --modified-file src/ui.ts` |
| With all options | `epicd task create "Title" -d "Desc" -a @sara -s "To Do" -l auth --priority high --ref src/api.ts --doc docs/spec.md --modified-file src/api.ts` |
| Create subtask   | `epicd task create "Title" -p 42`                                                 |

### Task Modification

| Action           | Command                                     |
|------------------|---------------------------------------------|
| Edit title       | `epicd task edit 42 -t "New Title"`       |
| Edit description | `epicd task edit 42 -d "New description"` |
| Change status    | `epicd task edit 42 -s "In Progress"`     |
| Assign           | `epicd task edit 42 -a @sara`             |
| Add labels       | `epicd task edit 42 -l backend,api`       |
| Set priority     | `epicd task edit 42 --priority high`      |

### Acceptance Criteria Management

| Action              | Command                                                                     |
|---------------------|-----------------------------------------------------------------------------|
| Add AC              | `epicd task edit 42 --ac "New criterion" --ac "Another"`                  |
| Remove AC #2        | `epicd task edit 42 --remove-ac 2`                                        |
| Remove multiple ACs | `epicd task edit 42 --remove-ac 2 --remove-ac 4`                          |
| Check AC #1         | `epicd task edit 42 --check-ac 1`                                         |
| Check multiple ACs  | `epicd task edit 42 --check-ac 1 --check-ac 3`                            |
| Uncheck AC #3       | `epicd task edit 42 --uncheck-ac 3`                                       |
| Mixed operations    | `epicd task edit 42 --check-ac 1 --uncheck-ac 2 --remove-ac 3 --ac "New"` |

### Task Content

| Action           | Command                                                  |
|------------------|----------------------------------------------------------|
| Add plan         | `epicd task edit 42 --plan "1. Step one\n2. Step two"` |
| Add notes        | `epicd task edit 42 --notes "Implementation details"`  |
| Add comment      | `epicd task edit 42 --comment "Review question" --comment-author @agent` |
| Add final summary | `epicd task edit 42 --final-summary "PR-style summary"` |
| Append final summary | `epicd task edit 42 --append-final-summary "More details"` |
| Clear final summary | `epicd task edit 42 --clear-final-summary` |
| Add dependencies | `epicd task edit 42 --dep task-1 --dep task-2`         |
| Add references   | `epicd task edit 42 --ref src/api.ts --ref https://github.com/issue/123` |
| Add documentation | `epicd task edit 42 --doc https://design-docs.example.com --doc docs/spec.md` |
| Set modified files | `epicd task edit 42 --modified-file src/api.ts --modified-file src/ui.ts` |

### Multi‑line Input (Description/Plan/Notes/Comments/Final Summary)

The CLI preserves input literally — shells do not convert `\n` inside normal quotes. Use one of the following forms, listed in order of preference for AI agents:

**1. Repeat `--append-*` for each line (works in every shell, including sandboxes that block other forms):**

```bash
epicd task edit 42 --notes "First line"
epicd task edit 42 --append-notes "Second line"
epicd task edit 42 --append-notes "Third line"
```

**2. Real newlines inside double quotes (single command — pass an actual line break inside the string):**

```bash
epicd task edit 42 --notes "First line
Second line

Final paragraph"
```

The same shape works for `--desc`, `--plan`, `--comment`, `--final-summary`, and the `--append-*` variants.

**3. Shell-specific shorthand (interactive shells only — some AI agent sandboxes reject these):**

- Bash/Zsh (ANSI‑C quoting):

  ```bash
  epicd task edit 42 --notes $'Line1\nLine2'
  ```

- POSIX sh (command substitution + printf):

  ```bash
  epicd task edit 42 --notes "$(printf 'Line1\nLine2')"
  ```

- PowerShell (backtick‑n):

  ```powershell
  epicd task edit 42 --notes "Line1`nLine2"
  ```

Prefer forms **1** and **2** when running under Claude Code, Codex, or any agent harness that screens commands through a tree‑sitter AST walker — those harnesses reject ANSI‑C strings, command substitutions, and heredoc forms (see issue [#595](https://github.com/MrLesk/Backlog.md/issues/595)).

Do not expect the literal sequence `\n` inside double quotes to become a newline. The CLI stores the backslash and `n` as written.

### Implementation Notes Formatting

- Keep implementation notes concise and time-ordered; focus on progress, decisions, and blockers.
- Use short paragraphs or bullet lists instead of a single long line.
- Use Markdown bullets (`-` for unordered, `1.` for ordered) for readability.
- When using CLI flags like `--append-notes`, remember to include explicit
  newlines. Either repeat the flag once per line:

  ```bash
  epicd task edit 42 --append-notes "- Added new API endpoint" \
    --append-notes "- Updated tests" \
    --append-notes "- TODO: monitor staging deploy"
  ```

  Or pass real newlines inside the quoted argument:

  ```bash
  epicd task edit 42 --append-notes "- Added new API endpoint
  - Updated tests
  - TODO: monitor staging deploy"
  ```

### Comments Formatting

- Use comments for task discussion, review notes, questions, and handoff context that should remain visible to humans and agents.
- Comments are append-only via `epicd task edit <id> --comment "..."`; include `--comment-author @name` when attribution is useful.
- Comment bodies may contain Markdown, but standalone `---` lines are reserved as comment delimiters.
- Do not use comments as the primary execution log; use Implementation Notes for progress and Final Summary for the PR description.

### Final Summary Formatting

- Treat the Final Summary as a PR description: lead with the outcome, then add key changes and tests.
- Keep it clean and structured so it can be pasted directly into GitHub.
- Prefer short paragraphs or bullet lists and avoid raw progress logs.
- Aim to cover: **what changed**, **why**, **user impact**, **tests run**, and **risks/follow‑ups** when relevant.
- Avoid single‑line summaries unless the change is truly tiny.

**Example (good, not rigid):**
```
Added Final Summary support across CLI/MCP/Web/TUI to separate PR summaries from progress notes.

Changes:
- Added `finalSummary` to task types and markdown section parsing/serialization (ordered after notes).
- CLI/MCP/Web/TUI now render and edit Final Summary; plain output includes it.

Tests:
- bun test src/test/final-summary.test.ts
- bun test src/test/cli-final-summary.test.ts
```

### Task Images (Local Assets)

Tasks may include images for screenshots, diagrams, or visual references. Local images are served automatically when using `epicd browser`.

**Storage location:**
- Place image files under the `assets/` folder inside your backlog directory (e.g., `backlog/assets/images/screenshot.png`)

**Supported formats:**
- png, jpg, jpeg, gif, svg, webp, avif (served with correct Content-Type)

**Markdown syntax in tasks:**
```markdown
![example](assets/images/screenshot.png)
```

**Workflow when adding images to tasks:**
1. Move or copy the image file into the `assets/` folder inside your backlog directory (e.g., `backlog/assets/images/screenshot.png`)
2. Then add or edit the task content via CLI, referencing the image using the `assets/<relative-path>` path

**Key points:**
- The path in Markdown starts with `assets/` and maps to the backlog directory's `assets/` folder; do **not** include the backlog directory name itself
- When `epicd browser` is running, these files are automatically available at `assets/<relative-path>`
- You can add images to descriptions, implementation notes, or final summaries using the standard CLI commands

### Document Management

> Docs are used for long-term project reference information, such as development standards, configuration guides, architecture documentation, etc. They differ from `tasks/` (specific tasks) and `decisions/` (decision records).

Use epicd public interfaces for document creation and updates so IDs, frontmatter, paths, and search metadata stay consistent.

#### CLI Usage

The CLI supports creating, updating, listing, and viewing documents.

```bash
# Create a new doc (saved under backlog/docs/ by default)
epicd doc create "API Guidelines"

# Create in a subdirectory (nested paths supported)
epicd doc create "Setup Guide" -p guides/setup

# Specify type at creation time
epicd doc create "Architecture" -t guide

# Update content while preserving omitted metadata
epicd doc update doc-1 --content "Updated markdown"

# Update metadata or move a doc within backlog/docs/
epicd doc update doc-1 --title "Setup Handbook" -t guide --tags setup,runbook -p guides

# List all docs (searched globally across subdirectories)
epicd doc list

# View a specific doc
epicd doc view doc-1
```

#### MCP / API Usage

- Use `document_create` to create documents with title, content, optional type/tags, and optional docs-directory-relative path.
- Use `document_update` to update document content, title, type, tags, or path while preserving document metadata.
- Document responses include the persisted docs-relative file path so agents can reference the created file without scanning source internals.

#### Key Rules

- Document paths are relative to `backlog/docs/`; absolute paths and `..` traversal are rejected.
- Supported document types are `readme`, `guide`, `specification`, and `other`.
- Document IDs are global across the entire docs tree, including nested subfolders.
- Prefer CLI, MCP, or Web document APIs over ad-hoc file writes so frontmatter and metadata remain valid.

### Task Operations

| Action             | Command                                      |
|--------------------|----------------------------------------------|
| View task          | `epicd task 42 --plain`                    |
| List tasks         | `epicd task list --plain`                  |
| Search tasks       | `epicd search "topic" --plain`              |
| Search with filter | `epicd search "api" --status "To Do" --plain` |
| Search by modified file | `epicd search --modified-file src/api.ts --plain` |
| Filter by status   | `epicd task list -s "In Progress" --plain` |
| Filter by assignee | `epicd task list -a @sara --plain`         |
| Archive task       | `epicd task archive 42`                    |

---

## Common Issues

| Problem              | Solution                                                           |
|----------------------|--------------------------------------------------------------------|
| Task not found       | Check task ID with `epicd task list --plain`                     |
| AC won't check       | Use correct index: `epicd task 42 --plain` to see AC numbers     |
| Changes not saving   | Ensure you're using CLI, not editing files                         |
| Metadata out of sync | Re-edit via CLI to fix: `epicd task edit 42 -s <current-status>` |

---

## Remember: The Golden Rule

**🎯 If you want to change ANYTHING in a task, use the `epicd task edit` command.**
**📖 Use CLI to read tasks, exceptionally READ task files directly, never WRITE to them.**

Full help available: `epicd --help`
