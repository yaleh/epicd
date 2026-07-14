# Task actions (Web UI dispatch buttons)

Task actions are maintainer-configured buttons shown in the Web UI (All Tasks list and the
task details modal) that dispatch a shell command server-side. They exist to put the
"trigger vs. state-change" split into the human-machine UI: clicking a button only **fires
an intent** — it never optimistically changes the task's status. Any real progress is made
by whatever the command dispatches to (typically a Claude Code worker), and shows up later
via the normal board refresh once that worker claims and updates the task.

## Configuring task actions

Add a `task_actions` block to your project's config file (`.epicd/config.yml` by default for new projects, or `backlog/config.yml`/`.backlog/config.yml` for older ones):

```yaml
task_actions:
  - id: dispatch-worker
    label: "Dispatch to worker"
    command: manda-dispatch submit "/epicd:fixpoint-convergence $TASK_ID" --worker my-worker
    whenPhase: ["backlog", "implementing"]
  - id: open-worktree
    label: "Open worktree"
    command: code "$(git worktree list | grep $TASK_ID | awk '{print $1}')"
  - id: review-diff
    label: "Review diff"
    command: gh pr diff --repo my-org/my-repo $(gh pr list --search "$TASK_ID in:title" --json number -q '.[0].number')
```

Each entry:

- `id` — stable identifier referenced by the Web UI and the API route. Must be unique.
- `label` — button text shown in the Web UI.
- `command` — a shell command (`sh -c`), run on the web server process, in the project root.
- `whenPhase` (optional) — a whitelist of raw pipeline **phase machine-names** (e.g.
  `drafting`, `backlog`, `needs-human`, `implementing`, `done`, `spiking` — see
  `Pipeline.states` in `src/engine/pipeline.ts`), compared directly against the task's
  `phase`. When set, the button is only shown on tasks whose current phase is in the list;
  legacy status-only tasks with no `phase` never match a non-empty list. When omitted, the
  button is shown on every task. Every value is validated at config-load time — an illegal
  phase name throws rather than silently hiding the button.

The command has the same variables available as `onStatusChange` (see `backlog config get
onStatusChange`), injected as environment variables:

- `$TASK_ID`
- `$TASK_TITLE`
- `$TASK_STATUS`

## Quoting and building JSON payloads safely

`command` runs via `sh -c`, and `$TASK_ID` / `$TASK_TITLE` / `$TASK_STATUS` are
injected as **environment variables** — so inside the command string they are live
shell values. Two consequences bite the most:

1. **Backticks and `$( )` are command substitution, not literal text.** A payload
   like `` -args="{...run `epicd task view $TASK_ID`...}" `` does not embed the literal
   string `` `epicd task view 5` `` — the shell *runs* `epicd task view 5` and splices
   its multi-line output into the value, producing raw newlines that break the JSON
   (`invalid character '\n' in string literal`). If you mean a literal backtick,
   escape it (`` \` ``) or, better, build the JSON with a tool (below).

2. **Never hand-concatenate task fields into JSON.** A title with a `"`, `\`, tab, or
   newline will corrupt a hand-written `{"task":"...$TASK_TITLE..."}`. Use `jq` to do
   the JSON encoding for you:

   ```yaml
   command: >-
     manda-dispatch submit -id="$TASK_ID" -to=worker -async
     -args="$(jq -nc --arg id "$TASK_ID"
     '{task: ("Work on epicd task " + $id + ": run `epicd task view " + $id + "`, then follow `epicd instructions task-execution`.")}')"
   ```

   `jq -nc --arg` performs all JSON escaping, and backticks inside jq's single-quoted
   program stay literal (no shell substitution). This is the recommended form for any
   action that dispatches a JSON payload.

Because task fields are author-/task-controlled text run through `sh -c`, always
**double-quote** every variable reference (`"$TASK_TITLE"`, never bare `$TASK_TITLE`)
to avoid word-splitting and accidental glob/metacharacter interpretation.

## Security gating

The API route (`POST /api/tasks/:id/actions/:actionId`) has no dedicated enable/disable
switch. The only condition for a request to execute is that `task_actions` in
`backlog/config.yml` has an entry whose `id` matches the requested `actionId` (unknown
`actionId` gets `404`).

- `webAuthToken` is optional hardening, same as every other route — it is not a
  prerequisite for action requests to work. When unset, action requests are not
  separately rejected. When set, requests must present it as `Authorization: Bearer
  <token>` (`401` otherwise), exactly like the rest of the guarded task API.

The real trust boundary is `task_actions` itself being present in `backlog/config.yml`:
a maintainer has to hand-write the shell command into config before any button exists to
click. `webAuthToken` is a separate, orthogonal concern (whether the web server is exposed
at all), not a gate on "should these commands be allowed to run".

The frontend only ever sends `taskId` + `actionId`; it never sends a command string. The
attack surface is "trigger one of the maintainer's predefined actions", not "execute
arbitrary commands".

**Caveat:** the Web UI does not yet attach the `Authorization` header to any request
(frontend wiring for `webAuthToken` is not implemented — see BACK-651). If you configure
`webAuthToken`, every other request the browser UI makes (including loading the task list)
will also get `401` until BACK-651 lands. Weigh this before setting `webAuthToken` on a
server you're driving from the browser UI.

## Fire-and-forget only — do not run long tasks synchronously

The command runs on the web server process and the HTTP request blocks until it exits, so
**only configure commands that return quickly** (typically a `submit`/dispatch call that
hands work off to something else, in the order of milliseconds). Do not configure a command
that itself runs a long task end-to-end (e.g. a multi-minute build or an agent loop) —
that blocks the web server for every other request while it runs.

Good: `manda-dispatch submit ...` (returns immediately after handing off).
Bad: running the actual long-lived worker loop synchronously inside the action command.

The response is a receipt, not a status change: `{ exitCode, stdout, stderr }` (output
truncated to a few lines), shown as a toast in the Web UI. The task's status is left alone;
it only changes later, through whatever the dispatched command triggers.
