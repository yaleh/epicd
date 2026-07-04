---
name: epicd-run
description: Host a persistent Monitor that polls `engine watch` for basic-ready tasks on the epicd board, and drive each one through claim + worktree + background Agent + engine complete (per templates/basic-ready.md). Invoke once per session; stop by touching backlog/.loop-stop.
---

# epicd-run skill

This session hosts a **Monitor** that repeatedly runs `bun run cli engine watch --once`
against the real epicd board. `engine watch` is a thin, non-spawning emitter — it reuses
`Interpreter.scan` to find actionable (pipeline_id/phase-derived) tasks and prints a
rendered instruction blob per task, delimited by `---EVENT---`. It never spawns an Agent
or subprocess itself; all spawning happens in this session, driven by the Monitor's
output.

**Scope: basic-ready only.** Epic-ready / epic-eval flows exist in `engine watch`'s
phase→template mapping only as a reference for future work — they are explicitly out
of scope here and this skill does not implement them.

## Usage

```
# harness-primitive: Monitor
Monitor(persistent=true, description="epicd-run: poll engine watch for basic-ready events",
  command="while true; do bun run cli engine watch --once; sleep 5; done")
```

For each blob emitted between `---EVENT---` delimiters, follow
`templates/basic-ready.md`, in order, for that task:

1. Claim the task and create its worktree (`handle-basic-ready.sh`).
2. Spawn ONE background in-session **Agent** (`Agent(run_in_background=true)`, cwd =
   the worktree) to do the implementation work, per the task's own Description/Phases.
3. Wait (via a **persistent** Monitor) for the `.agent-done-<id>` sentinel file the
   Agent writes as its last action.
4. Run `bun run cli engine complete <id> --worktree <path>` — this independently
   re-verifies DoD in the worktree (ENG-8: the worker never self-attests done) and is
   the **only** merge implementation the skill uses; it either merges and advances the
   task to done, or routes it to needs-human.

Do not re-claim or re-drive a task once `engine complete` has returned — the task is
terminal.

## Untestable-in-CI gap (read before assuming this flow is fully covered)

The Agent()-spawn step (session spawning a background Agent to do the actual task work
in the worktree — step 2 above) is NOT and CANNOT be covered by this CI test — it
requires a live Claude Code session. This gap is closed only by the manual-soak DoD
item below, not by automation. `src/test/epicd-run-integration.test.ts` proves every
other link in the chain (claim + worktree, sentinel wait/hand-off contract, DoD re-run,
merge-under-lock, phase transition) by simulating the Agent's *observable side effect*
(a commit + the `.agent-done-<id>` sentinel) directly, but never invokes an Agent tool
call itself.

## Cross-mechanism safety

`engine complete`'s merge lock and the legacy loop-backlog scanner (if still running
against the same board) share the same `<backlogDir>/.merge-lock` path for mutual
exclusion. Start only one driver at a time against a given board.

## When to use

- Primary: after BACK-605 M1 milestone is declared and the engine soak period begins.
- Fallback: `loop-backlog` skill remains available for emergency rollback to baime's
  original scanner/handler scripts.

## Implementation notes

- `engine watch` (src/engine/watch.ts) contains no `Agent()` call and never spawns a
  subprocess — it only reads board state and renders text.
- `plugin/scripts/scan-loop.js`'s runtime hardening (`---EVENT---` protocol,
  `renderEvent` templating, edge-triggered dedup, EPIPE self-reap, singleton
  convergence) has been adapted to shell out to `bun run cli engine watch --once` for
  its basic-ready channel, and is available as an alternative host for the same
  Monitor command shown above; either invocation path emits the same event protocol.
