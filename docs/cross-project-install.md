# Using epicd skills in another project

Verified install path as of 2026-07-07 (v1.47.1).

## Prerequisites

- Node.js / npm on PATH
- Claude Code CLI installed
- Git repository for the target project

## Step 1 — Install the epicd engine globally

```sh
# Current published name on npm is still backlog.md (rename to epicd pending release)
npm i -g backlog.md

# Verify the bin is available:
backlog --version
```

> **Naming note:** The npm package name is `backlog.md`; the installed bin is `backlog`.
> The package.json has been renamed to `epicd` but has not been published under that
> name yet — track BACK-681 for the npm rename follow-up.

## Step 2 — Install the epicd plugin (skills) into Claude Code

Run once from the epicd source tree:

```sh
cd /path/to/epicd          # the cloned epicd source repo
make install-user           # installs plugin at user scope (all projects)
# or: make install-project  # installs plugin at project scope only
```

Verify:

```sh
claude plugins list
# Should show: ❯ epicd@epicd  (enabled)
```

## Step 3 — Initialise backlog in the target project

```sh
cd /path/to/your-project
git init                          # if not already a git repo
backlog init "<project-name>" --defaults
```

## Step 4 — Create and drive a task

```sh
# Create a task in the Ready phase:
backlog task create "My feature" --pipeline execution --phase ready \
  --dod "bun test" --ac "All tests pass"

# The task is now ready. In a Claude Code session in this project,
# invoke the skill:
#   /primitive-executor TASK-1
#
# Or drive it end-to-end with fixpoint-convergence:
#   /fixpoint-convergence TASK-1
```

## Key commands (cross-project)

| Purpose | Command |
|---|---|
| View a task | `backlog task view <id> --plain` |
| Edit / append notes | `backlog task edit <id> --append-notes "..."` |
| Complete and merge | `backlog engine complete <id> --worktree <path>` |
| List tasks | `backlog task list` |
| Board view | `backlog board` |

## Known gaps (as of BACK-680)

- **`npm i -g epicd` fails (404)** — package not yet published under the `epicd` name.
  Use `npm i -g backlog.md` until BACK-681 lands.
- **AC#2/AC#3 (skill invocation in fresh project)** — procedurally verified:
  `primitive-executor` and `fixpoint-convergence` skill docs now use `backlog` commands
  (not `bun run cli`), so they are correctly portable. Full end-to-end agent session
  in a live fresh project is a non-mechanical one-time-proof; repeat verification
  is the responsibility of the next consumer.
