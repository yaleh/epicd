---
name: epicd-run
description: Start the epicd engine run loop as a persistent Monitor-hosted driver. Runs the execution pipeline against the real board until fixpoint or max-ticks. Invoke once per session; stop by touching backlog/.loop-stop.
---

# epicd-run skill

Hosts `engine run` inside a persistent Monitor so the execution pipeline drives
itself autonomously.  Each tick picks up any `Basic: Ready` task, spawns a real
Claude Code worker, and adjudicates the result — advancing the task to `done` or
`needs-human`.

## Cross-mechanism safety

The engine's merge lock and the legacy loop-backlog use the same
`<backlogDir>/.merge-lock` path for mutual exclusion.  Start only one driver at
a time.  The single-active-driver guard (`.active-agents` file) prevents
duplicate runs.

## Usage

```
# Arm the engine driver (Monitor-hosted)
bun run cli engine run --verbose

# Stop cleanly
touch backlog/.loop-stop
```

## When to use

- Primary: after BACK-605 M1 milestone is declared and the engine soak period begins.
- Fallback: loop-backlog skill remains for emergency rollback.

## Wiring (implementation reference)

1. `makeWorkerRunner(realSpawnPrimitive)` — wraps the Claude Code CLI spawn.
2. `realSpawn(task, repoPath, runner, gitWorktreeRunner)` — creates an isolated
   git worktree, delegates to the runner, cleans up in finally.
3. `runEngine(core, worktreeOps)` — drives the execution pipeline to fixpoint.
4. Engine core (src/engine) contains no `Agent()` or subprocess call.
