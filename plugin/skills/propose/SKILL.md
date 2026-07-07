---
name: propose
description: "Propose one new task or epic straight onto the epicd board via the engine's own `epicd task create` path — collapses the legacy task-to-draft/task-to-backlog/epic-to-draft/epic-to-backlog family into a single engine-native call. Use when you have a concrete title + description ready to enter the Backlog column (no draft/review loop)."
argument-hint: [--kind basic|epic] <title> -- <description>
allowed-tools: Bash
contracts:
  - grep: "epicd task create"
    target: self
  - not-grep: "sed "
    target: self
  - not-grep: "awk "
    target: self
---

# propose

Create one task directly at its Backlog boundary using the engine's existing
`task create` command — the same command a human would run. This skill does not
draft, review, or iterate; it is the mechanical "write it onto the board" step.

## Usage

```bash
epicd task create "<title>" \
  --pipeline authoring --phase backlog \
  --labels "<kind:basic|kind:epic>" \
  --description "<description>"
```

Status is a derived display projection (BACK-664 child 1) — it is never set directly;
`--pipeline authoring --phase backlog` is what lands the task at the Backlog boundary
`engine promote` reads from.

- `--labels "kind:basic"` for a Basic (single-PR) task.
- `--labels "kind:epic"` for an Epic (multi-child) task (`engine promote` recognizes
  `kind:epic` to pre-declare `role: compound`, since a pre-decompose epic has no
  children yet to derive it from).
- Add `--parent <taskId>` when this task is a child of an existing epic.
- Add `--ac "<criterion>"` (repeatable) for acceptance criteria, `--dod "<item>"` for
  Definition of Done checklist items, and `--dod-gate "<shell cmd>"` for a structured,
  engine-re-run DoD gate — all standard `task create` flags, nothing propose-specific.

## Notes

- `task create` is the ONE path this skill uses. It does not shell out to any other
  `epicd task` subcommand, and it does not `sed`/`awk`/`grep` a prior task's markdown
  to reconstruct a description — pass the full description directly via `--description`.
- Output is the created task's ID (`Created task <ID>`); read it from stdout, don't
  parse the task file.
- To move the created task further (Backlog → execution), use the `promote` skill.
