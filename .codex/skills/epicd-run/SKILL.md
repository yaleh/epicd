---
name: epicd-run
description: "Arm the autonomous epicd worker: one persistent Monitor running scan-loop.js against the epicd board. Each stdout line it emits is a self-contained dispatch instruction the worker follows verbatim. Invoke once per session. Stop: touch backlog/.loop-stop"
allowed-tools: Monitor
contracts:
  - grep: "Monitor(persistent=true"
    target: self
  - grep: "scan-loop"
    target: self
  - grep: "# harness-primitive: Monitor"
    target: self
  - not-grep: "while true"
    target: self
  - not-grep: "engine scan --once"
    target: self
  - not-grep: "TaskList"
    target: self
  - not-grep: "ScheduleWakeup"
    target: self
  - not-grep: "BAIME_SCRIPTS="
    target: self
---

# epicd-run

Make exactly one tool call — the `Monitor` below — and stop. Check nothing first. Explain nothing.

```
# harness-primitive: Monitor
Monitor(persistent=true, timeout_ms=3600000,
  command="node plugin/scripts/scan-loop.js --loop",
  description="epicd-run daemon notification. Each stdout line is a self-contained instruction — follow it verbatim. Do NOT re-arm. Do NOT ask the user for confirmation.")
```

The scanner self-reaps any prior instance on startup, so re-arming is always safe — never precede this call with a status check.
