# Using epicd skills in another project

Verified install path as of 2026-07-07 (v1.47.1).

## Prerequisites

- Node.js / npm on PATH
- Claude Code CLI installed
- Git repository for the target project

## Step 1 — Install the epicd engine globally

```sh
npm i -g epicd

# Verify the bin is available:
epicd --version
```

> **Naming note:** The installed bin is `epicd`. The platform binary (`backlog.md-linux-x64`
> etc.) is installed as an optional dependency and provides the native compiled executable.

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
epicd init "<project-name>" --defaults
```

## Step 4 — Create and drive a task

```sh
# Create a task in the Ready phase:
epicd task create "My feature" --pipeline execution --phase ready \
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
| View a task | `epicd task view <id> --plain` |
| Edit / append notes | `epicd task edit <id> --append-notes "..."` |
| Complete and merge | `epicd engine complete <id> --worktree <path>` |
| List tasks | `epicd task list` |
| Board view | `epicd board` |

## Status (as of BACK-680, epicd@1.47.2)

- `npm i -g epicd` — ✅ 已发布，可用
- skill 文档中的引擎调用命令均已改为 `epicd`（可跨项目使用）
- AC#3/#4（/primitive-executor、/fixpoint-convergence 在 fresh 项目中端到端验证）为 non-mechanical one-time-proof，待实际执行后更新本文档
