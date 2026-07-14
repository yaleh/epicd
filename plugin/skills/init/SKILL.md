---
name: init
description: "Thin wrapper over `epicd init` — initializes a fresh epicd board in the current git repository. No epicd-repo-specific defaults: every value (task prefix, project name, backlog dir) is read from CLI flags or the project's config file (`.epicd/config.yml` by default) after init, never hardcoded to this repo's own settings."
argument-hint: [projectName] [--task-prefix <prefix>] [--defaults]
allowed-tools: Bash
contracts:
  - grep: "epicd init"
    target: self
---

# init

```bash
epicd init "<projectName>" --defaults
```

`epicd init` (src/cli.ts) already derives every default from the target repo itself
(current directory name for the project name, `task` for the task prefix unless
`--task-prefix` is given, `cli` for the agent-integration mode, etc.) — this skill adds
no defaults of its own and does not assume the project is epicd itself.

## Common flags

- `--task-prefix <prefix>` — custom task-id prefix (letters only); omit to use `task`.
- `--backlog-dir <path>` — `backlog`, `.backlog`, or a custom project-relative path.
- `--agent-instructions <list>` — comma-separated instruction files to create
  (`claude`, `agents`, `gemini`, `copilot`, `cursor`, or `none`).
- `--no-git` — initialize without Git integration (filesystem-only board).
- `--defaults` — accept every default non-interactively (recommended for scripted use).

## Verifying no epicd-specific hardcoding

After init, `task_prefix` / `project_name` (and every other init-time choice) live only
in the target repo's own config file (`.epicd/config.yml` by default for new repos) —
nothing in this skill, `epicd init`, or downstream `propose`/`promote`/`inbox`/`run`
skills reads epicd's own `.epicd/config.yml` or hardcodes epicd's own task prefix.
`grep task_prefix .epicd/config.yml` on the freshly initialized repo is the check.
