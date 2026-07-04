# basic-ready event — instruction template

**Task**: __TASK_ID__ — __TASK_TITLE__

## Step 1–5: Crystallized preparation (run first)

```bash
bash $BAIME_SCRIPTS/handle-basic-ready.sh __TASK_ID__
WT_PATH=$(cat "${REPO_ROOT}/backlog/.caps/__TASK_ID__.wt")
```

`handle-basic-ready.sh` atomically acquires the exec-lock, claims the task (`Basic: In Progress`), creates the git worktree, and writes `.caps/__TASK_ID__.wt` (the worktree path anchor). Concurrent execution is blocked at the kernel flock level.

## Step 6: Spawn ONE background implementation Agent

Spawn `Agent(run_in_background=true)` with this prompt, substituting the absolute `$WT_PATH`
you just read for every `$WT_PATH` below (the Agent has no native cwd — it must `cd` there):

> You are a background task agent executing **__TASK_ID__** in the worktree `$WT_PATH` (branch `task/__TASK_ID__`).
>
> First: `cd "$WT_PATH"` and run `backlog task view __TASK_ID__ --plain` to read the full task Description.
> Follow its `## Phase` sections in order — the Description is the sole authority on what to do.
> If the task was previously escalated, the human reply in Implementation Notes supersedes any open question.
>
> **Constraints**
> - Work exclusively inside `$WT_PATH`. Do NOT run `git merge` or `git push`.
> - Do NOT spawn sub-agents (the Agent tool is not available to you).
> - After all work, run `git add -A && git commit` if there are changes.
> - Do NOT run `backlog task edit` with `--status`/`--dod`/`--check-dod` — the target task's terminal
>   status is a merge gate owned by complete-task.sh, which independently re-verifies every DoD
>   shell-gate before `git merge` (ADR-017). You MAY use `backlog task edit __TASK_ID__
>   --append-notes "..."` to record progress. The main worker handles all status transitions.
>
> **Phase / DoD checkpoints** — append each to `$WT_PATH/.agent-summary-__TASK_ID__`:
>   `echo "Phase X ✓ $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$WT_PATH/.agent-summary-__TASK_ID__"`
>   `echo "DoD #N: PASS|FAIL — <cmd>" >> "$WT_PATH/.agent-summary-__TASK_ID__"` (≤5 lines of output on FAIL)
>
> **Completion (your LAST action before exit)** — write the signal file:
> - success → `${REPO_ROOT}/backlog/.agent-done-__TASK_ID__` containing `done`
> - cannot proceed without human input → the same file containing `needs-human: <one-line reason>`
>
> allowed-tools: Bash, Read, Write, Edit, Glob, Grep

## Step 7–9: Wait, then complete or escalate

Wait for `${REPO_ROOT}/backlog/.agent-done-__TASK_ID__` (created when the Agent finishes) using a
**persistent** Monitor — the background implementation Agent's runtime is unbounded, so a
bounded/default-timeout Monitor can expire before it finishes and silently drop the poll:

```
# harness-primitive: Monitor
Monitor(persistent=true, description="waiting for __TASK_ID__ agent completion signal",
  command="while [ ! -f \"${REPO_ROOT}/backlog/.agent-done-__TASK_ID__\" ]; do sleep 5; done; echo done")
```

Once the signal file is present, run:

```bash
bash $BAIME_SCRIPTS/complete-task.sh __TASK_ID__
```

`complete-task.sh` reads the signal, independently re-runs the task's DoD shell-gates in the worktree,
then either `git merge --no-ff` (→ `Basic: Done`, worktree + branch cleaned up, parent epic notified)
or escalates to `Basic: Needs Human`. It writes the `cap:execute=done` / `cap:merge=failed` /
`cap:execute=failed` idempotency markers. Do not re-claim or re-spawn — the task is now terminal.
