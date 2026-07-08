---
name: promote
description: "Human promote gate: move one task from the authoring Backlog boundary into execution (always execution/implementing, regardless of kind:epic — BACK-686.3 de-fork) via the engine's existing `engine promote <id>` command. Thin wrapper — no logic lives in this skill."
argument-hint: <taskId>
allowed-tools: Bash
contracts:
  - grep: "engine promote"
    target: self
---

# promote

```bash
epicd engine promote <taskId>
```

That is the entire operation. `engine promote` (src/cli.ts) already:

- Rejects any task not at `Basic: Backlog` or `Epic: Backlog` status.
- Writes `pipeline_id: execution` and `phase: implementing`, regardless of `kind:basic`
  or `kind:epic` — decompose-vs-leaf is now a runtime branch inside the
  `primitive-executor` skill, not a separate phase (BACK-686.3 de-fork). An epic
  also gets `role: compound` pre-declared since a pre-decompose epic has no children
  yet to derive that role from.
- Prints `engine promote: <id> → execution/implementing` on success.

This skill exists only so the promote step is invocable by name from the same
skill set as `propose`/`inbox`/`run`/`init` — it does not re-implement, wrap, or
duplicate any of `engine promote`'s field-writing logic.
