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

### Acceptance Criteria must follow CLAUDE.md's conventions

This skill does not draft, review, or revise the `--ac` values you pass it — that
would contradict its mechanical, single-command nature. But every criterion you
supply must already conform to CLAUDE.md's "Acceptance Criteria conventions when
authoring a task" before you call `propose`:

- A convergence target (the task's deliverable *is* a mechanism that should reach
  some end state) becomes a machine-checkable AC: state what shrinks, the
  termination condition, and the exact command that goes green — not a prose
  claim that it terminates.
- An invariant ("X must not change") becomes a negative AC naming its own
  concrete check (e.g. "MCP server name stays `backlog`; verify:
  `grep MCP_SERVER_NAME src/cli.ts`"), and only when it is literally true for
  this task's actual scope.
- Never phrase an AC as a safety argument ("this is an extension, not a
  rewrite") — state a checkable fact instead.
- If an AC claims visibility to an external consumer, name the exact field or
  code path that consumer reads, not just "the value appears in the file."
- Do not add a separate "不动点"/"严格不改" section on the task — fold both
  convergence targets and invariants into `--ac` as above; put un-checkable
  scope prose in the description's Non-Goals instead.

If a criterion can't be phrased this way, it isn't ready for `propose` yet — draft
it through `authoring-draft` first, or fix it by hand before calling this skill.

## Notes

- `task create` is the ONE path this skill uses. It does not shell out to any other
  `epicd task` subcommand, and it does not `sed`/`awk`/`grep` a prior task's markdown
  to reconstruct a description — pass the full description directly via `--description`.
- Output is the created task's ID (`Created task <ID>`); read it from stdout, don't
  parse the task file.
- To move the created task further (Backlog → execution), use the `promote` skill.
