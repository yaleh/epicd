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

λ(kind: Kind, title: Title, description: Description, ac: [Criterion], opts: Opts) → TaskId

Create one task directly at its Backlog boundary using the engine's existing
`task create` command — the same command a human would run. This skill does not
draft, review, or iterate; it is the mechanical "write it onto the board" step.

## Spec

```
Kind      = "basic" | "epic"
Criterion :: String     -- caller-supplied; MUST already satisfy conformsToACConventions
Opts      :: { parent?: TaskId, dod: [String], dodGate: [ShellCmd] }

propose :: (Kind, Title, Description, [Criterion], Opts) → TaskId
propose(kind, title, description, ac, opts) =
  requires ∀ c ∈ ac. conformsToACConventions(c)   -- gate; this skill does NOT draft/revise ac itself
  run(
    epicd task create "<title>" \
      --pipeline authoring --phase backlog \
      --labels "kind:<kind>" \
      --description "<description>" \
      <foreach c ∈ ac:  --ac "<c>">
      <foreach d ∈ opts.dod:  --dod "<d>">
      <foreach g ∈ opts.dodGate:  --dod-gate "<g>">
      <opts.parent ? --parent <opts.parent> : ε>
  )
  -- STOP. task create is the ONE path — never sed/awk/grep a prior task's
  -- markdown to reconstruct a field; read the created id from stdout
  -- (`Created task <ID>`), don't parse the task file.

-- kind:basic  ⇒ single-PR task.
-- kind:epic   ⇒ multi-child task; `engine promote` recognizes the `kind:epic`
--               label to pre-declare role=compound, since a pre-decompose
--               epic has no children yet to derive it from.
-- Status is a derived display projection (BACK-664 child 1) — never set
-- directly; --pipeline authoring --phase backlog is what lands the task at
-- the Backlog boundary `engine promote` reads from.

conformsToACConventions :: Criterion → Bool          -- CLAUDE.md "AC conventions"
conformsToACConventions(c) =
    (isConvergenceTarget(c) → machineCheckable(c))   -- states what shrinks + termination + exact command, not a prose claim that it terminates
  ∧ ¬isSafetyRationalization(c)                       -- "this is an extension, not a rewrite" ⇒ reject; state a checkable fact instead
  ∧ (isInvariant(c) → namesOwnCheck(c))               -- e.g. "MCP server name stays `backlog`; verify: `grep MCP_SERVER_NAME src/cli.ts`" — only when literally true for this task's actual scope
  ∧ (claimsExternalConsumer(c) → namesExactReadPath(c))
  -- no separate 不动点/严格不改 section: fold convergence targets + invariants
  -- into ac as above; non-checkable scope prose goes in the description's
  -- Non-Goals instead.

-- If a criterion fails this gate: do NOT call propose. Route it through
-- `authoring-draft` first, or fix it by hand before calling this skill.
```

## Notes

- To move the created task further (Backlog → execution), use the `promote` skill.
