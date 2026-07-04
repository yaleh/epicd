# basic-ready event — instruction template

**Task**: __TASK_ID__ — __TASK_TITLE__

This is the epicd (not baime) basic-ready flow, proven correct by BACK-609's manual
drive: claim + worktree → background in-session **Agent** → wait for a sentinel file →
hand off to `engine complete`, which independently re-verifies DoD and owns the merge
(ENG-8; no worker self-attests done).

## Step 1: Claim the task and create its worktree

```bash
bash $BAIME_SCRIPTS/handle-basic-ready.sh __TASK_ID__
WT_PATH=$(cat "${REPO_ROOT}/backlog/.caps/__TASK_ID__.wt")
```

`handle-basic-ready.sh` atomically acquires the exec-lock, claims the task, runs
`git worktree add` for `task/__TASK_ID__`, and writes `.caps/__TASK_ID__.wt` (the
worktree path anchor). Concurrent execution is blocked at the kernel flock level.

## Step 2: Spawn ONE background implementation Agent (cwd = worktree)

Spawn `Agent(run_in_background=true)` with this prompt, substituting the absolute
`$WT_PATH` you just read for every `$WT_PATH` below (the Agent has no native cwd — it
must `cd` there):

> You are a background task agent executing **__TASK_ID__** in the worktree `$WT_PATH`
> (branch `task/__TASK_ID__`).
>
> First: `cd "$WT_PATH"` and run `bun run cli task view __TASK_ID__ --plain` to read
> the full task Description. Follow its `## Phase` sections in order — the Description
> is the sole authority on what to do. If the task was previously escalated, the human
> reply in Implementation Notes supersedes any open question.
>
> **Constraints**
> - Work exclusively inside `$WT_PATH`. Do NOT run `git merge` or `git push`.
> - Do NOT spawn sub-agents (the Agent tool is not available to you).
> - After all work, run `git add -A && git commit` if there are changes.
> - Do NOT run `bun run cli task edit` with `--status`/`--dod`/`--check-dod` — the
>   target task's terminal state is a merge gate owned by `engine complete`, which
>   independently re-runs every DoD shell-gate in the worktree before merging. You MAY
>   use `bun run cli task edit __TASK_ID__ --append-notes "..."` to record progress.
>
> **Completion (your LAST action before exit)** — write the sentinel file:
> - success → `${REPO_ROOT}/backlog/.agent-done-__TASK_ID__` containing `done`
> - cannot proceed without human input → the same file containing
>   `needs-human: <one-line reason>`
>
> allowed-tools: Bash, Read, Write, Edit, Glob, Grep

## Step 3: Wait for the `.agent-done-__TASK_ID__` sentinel

Wait for `${REPO_ROOT}/backlog/.agent-done-__TASK_ID__` (created when the Agent
finishes) using a **persistent** Monitor — the background implementation Agent's
runtime is unbounded, so a bounded/default-timeout Monitor can expire before it
finishes and silently drop the poll:

```
# harness-primitive: Monitor
Monitor(persistent=true, description="waiting for __TASK_ID__ agent completion signal",
  command="while [ ! -f \"${REPO_ROOT}/backlog/.agent-done-__TASK_ID__\" ]; do sleep 5; done; echo done")
```

## Step 4: Hand off to `engine complete`

Once the sentinel file is present, run:

```bash
bun run cli engine complete __TASK_ID__ --worktree "$WT_PATH"
```

`engine complete` reads the sentinel, independently re-runs the task's DoD shell-gates
inside the worktree (ENG-8 — the worker never self-attests done), then either merges
under lock and advances the task to its terminal done phase, or routes it to
needs-human. This is the **only** merge implementation the skill uses — do not fall
back to any other merge/lock script. Do not re-claim or re-spawn once this returns —
the task is now terminal.
