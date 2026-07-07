---
name: inbox
description: "Read-only view over the GateEvent log — lists gate outcomes (proposal reviews, DoD gates, stage gates, etc.) via the engine's shared `engine gate-log` command. Never writes anything. Use to check what has happened on the board's gate log without opening the JSONL file by hand."
argument-hint: [--pipeline-id <id>] [--gate <name>] [--actor <name>] [--since <iso>] [--limit <n>]
allowed-tools: Bash
contracts:
  - grep: "engine gate-log"
    target: self
---

# inbox

Read-only wrapper over the engine's GateEvent query. This skill never re-implements
the query logic itself — it shells out to the engine's own `engine gate-log` command,
which is the ONE place that wraps the query for CLI use (shared with the Stage-2
CLI/Web read surfaces planned in BACK-605.10; there is exactly one implementation of
this query wrapper, not one per read surface).

## Usage

```bash
epicd engine gate-log \
  [--file <path>]          \  # default: <cwd>/docs/research/gate-events.jsonl
  [--pipeline-id <id>]      \
  [--gate <name>]           \
  [--actor <name>]          \
  [--since <iso8601>]       \
  [--until <iso8601>]       \
  [--limit <n>]             \
  [--offset <n>]
```

Prints one JSON GateEvent per line, in on-disk (append) order, filtered per the
given options. Never mutates the log — `engine gate-log` only reads.

## Examples

```bash
epicd engine gate-log --pipeline-id execution --limit 20
epicd engine gate-log --gate stage2-gate --since 2026-01-01T00:00:00Z
```
