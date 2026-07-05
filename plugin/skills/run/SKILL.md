---
name: run
description: "Arm the autonomous epicd worker: one persistent Monitor running scan-loop.cjs against the current board. Act on each emitted event block. Invoke once per session. Stop: touch backlog/.loop-stop"
allowed-tools: Monitor
contracts:
  - grep: "Monitor(persistent=true"
    target: self
  - grep: "scan-loop"
    target: self
  - grep: "CLAUDE_PLUGIN_ROOT"
    target: self
  - not-grep: "while true"
    target: self
  - not-grep: "engine scan --once"
    target: self
---

# run

Make exactly one tool call — the `Monitor` below — and stop. Check nothing first. Explain nothing.

```
# harness-primitive: Monitor
Monitor(persistent=true, timeout_ms=3600000,
  command="node ${CLAUDE_PLUGIN_ROOT}/scripts/scan-loop.cjs --loop",
  description="epicd run daemon. Act on each emitted event block. Do NOT re-arm. Do NOT ask the user for confirmation.")
```

`scan-loop.cjs` reads from and dispatches through the epicd engine CLI (`engine scan
--once` / `engine dispatch <id>`) — never a template file. It resolves the engine CLI
command portably: `$EPICD_ENGINE_CMD` if set, else `bun src/cli.ts engine` when run
inside the epicd source tree itself, else `backlog engine` (the published bin on
PATH — the normal case in a repo that only installed this plugin). Set
`EPICD_ENGINE_CMD` explicitly if the installed binary is not named `backlog`.

The scanner self-reaps any prior instance on startup, so re-arming is always safe — never
precede this call with a status check.
