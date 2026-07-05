# basic-ready dispatch — retired template (human reference only)

**This file is no longer the dispatch authority.** As of BACK-625 / ADR-015, the
`basic-ready` dispatch instruction ("prompt") is authored by the **engine**, not rendered
from this template by the scanner daemon.

- Authority: `src/engine/dispatch.ts` (`renderBasicReadyDispatch`) — a distribution-bundled
  template literal, so it renders identically under dev, npm install, and the single-binary
  build. There is no `__dirname`-relative template lookup (the root of the earlier
  "all events fall back to the bare line" path bug).
- To see the exact block a worker (a Monitor seat or `claude -p`) receives for a task:

  ```bash
  bun run cli engine dispatch <TASK-ID>
  ```

- Transport: `plugin/scripts/scan-loop.cjs` dedups on the first-line machine key
  (`basic-ready:<id>`) and passes the engine's block through verbatim, adding only the
  `---EVENT---` framing. It reads no template file.

The dispatch flow itself is unchanged: `handle-basic-ready.sh` claims + worktrees the task,
a background Agent implements it inside the worktree and writes the `.agent-done-<id>`
sentinel, then `engine complete --worktree` re-runs the DoD (ENG-8) and merges under lock.
See `src/engine/dispatch.ts` for the current wording.
