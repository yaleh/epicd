## Task Execution Guide

Use this guide when you are working on an existing Backlog task.

### Planning Workflow

Before writing code for non-trivial work:

1. Read the task:
   - `epicd task view {{TASK_ID:123}} --plain`
2. Assign yourself (status reflects the task's phase automatically and is not set directly):
   - `epicd task edit {{TASK_ID:123}} -a @your-name`
3. Review description, acceptance criteria, dependencies, references, and documentation.
4. Inspect relevant code and tests.
5. Draft an implementation plan.
6. Present the plan to the user when approval is expected.
7. Record the approved plan:
   - `epicd task edit {{TASK_ID:123}} --plan "1. ..."`

Keep the Backlog task as the plan of record. If the approach changes, update the plan through `epicd task edit` before continuing.

### Execution Workflow

Work in short loops:

1. Implement a focused slice.
2. Run relevant tests or checks.
3. Record useful progress:
   - `epicd task edit {{TASK_ID:123}} --append-notes "Implemented parser and added tests."`
4. Check acceptance criteria as they become true:
   - `epicd task edit {{TASK_ID:123}} --check-ac 1`
5. Add comments for discussion or review questions:
   - `epicd task edit {{TASK_ID:123}} --comment "Question for review" --comment-author @your-name`

Common flags (no `--help` needed for these):

```bash
epicd task edit {{TASK_ID:123}} --phase <phase>          # advance/retreat phase (e.g. needs-human)
epicd task edit {{TASK_ID:123}} --ac "Criterion text"    # add acceptance criterion
epicd task edit {{TASK_ID:123}} --dod "DoD item"         # add Definition of Done item
epicd task edit {{TASK_ID:123}} --check-dod 1            # check DoD item by index
epicd task edit {{TASK_ID:123}} --priority high          # set priority (high, medium, low)
```

Use `epicd task edit {{TASK_ID:123}} --help` for the full flag list.

### Scope Changes

If you discover work that is outside the task's acceptance criteria, stop and ask the user whether to add scope to the current task or create follow-up work. Do not silently expand the task.

### Working With Subtasks

If the user assigns a parent task and all subtasks, complete subtasks one at a time. Each subtask should have its own plan, notes, checked acceptance criteria, and final summary.

If the user assigns only one subtask, finish that subtask and ask before moving to the next one.

### Reading and Writing Backlog Data

Use CLI commands for Backlog changes:

- Read: `epicd task view {{TASK_ID:123}} --plain`
- Search: `epicd search "query" --plain`
- List with task filters: `epicd task list --status "<active status>" --assignee @your-name --labels backend --search "auth" --limit 20 --plain`
- Update: `epicd task edit {{TASK_ID:123}} ...`
- Create docs: `epicd doc create "Title"`
- Update docs: `epicd doc update doc-1 --content "Markdown"`

Do not edit Backlog markdown files directly. The CLI preserves metadata, IDs, filenames, relationships, and structured sections.

### Finishing

When implementation is complete, continue with:

```bash
epicd instructions task-finalization
```
