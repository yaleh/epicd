---
name: primitive-executor
description: "Execute a single execution/implementing task end to end: judge leaf vs compound (CLAUDE.md decompose test) first, then either run the LFDD methodology (read the task's Phase plan, TDD each Phase, structured DoD, checkpoint via engine complete) or propose+apply a child decomposition. Invoke with a task id."
---

# primitive-executor

Executes the `execution/implementing` machine-actor phase (see
`docs/task-lifecycle-model.md` §3) for one task. This packages the same methodology
already crystallized in the engine's own dispatch payload for this phase
(`src/engine/dispatch.ts`'s `renderBasicReadyDispatch`) as a standalone, independently
invokable skill — same method, described here so it can be run without going through
that specific dispatch transport.

BACK-686.3: `implementing` is the single entry phase for both a leaf (Basic) task and a
compound (Epic) task — the decompose-vs-leaf decision used to be a static promote-time
fork (`ready` vs `decomposing`); it is now a runtime judgment call made HERE, at the
start of this skill's execution, not read off a label at promote time.

## Preconditions

- You have a task id (e.g. `BACK-123`) whose board phase is `implementing` (or you have
  just claimed it) and a git worktree checked out for its branch (compound/epic tasks
  have no worktree of their own — decompose runs directly in the repo root; children
  are main-board artifacts, not a branch's own work).
- `cd` into the worktree before doing anything else (leaf path only) — every command
  below assumes the worktree is the current directory.

## Method

### Phase 0 — Read the plan and judge granularity

Run `epicd task view <taskId> --plain` and read the full Description.

Apply the CLAUDE.md "Task decomposition granularity" two-part decompose test to decide
leaf vs compound. `kind:epic` (if present) is a **hint**, not a gate — it can be
overridden either way:

- A task labeled `kind:epic` but that fails the test (small, single deliverable) is
  still executed as a **leaf** — proceed to "Leaf path" below.
- A task with no `kind:epic` label that independently passes the test (≥2 independently
  reviewable/mergeable deliverables, combined size with real margin over the ~2000-line
  ceiling) is still routed to the **compound** branch below.

Only split into multiple children when BOTH hold: (a) you can name ≥2 independently
reviewable/mergeable deliverables (a sequence of steps toward one deliverable is not
multiple deliverables — that's Phases/Stages inside one Basic task's plan), and (b) the
combined size estimate has real margin over the ~2000-line ceiling (aim for ≥1.8-2x). A
child that would be a trivial administrative/verification step (a marker file, a
smoke-test stub, an audit-only note) rather than a real deliverable is a red flag — fold
it back into a Stage instead of proposing it as its own child.

If the task's own plan already proposes a reasonable breakdown, use it; only revise it
when it visibly violates these heuristics.

**Leaf → continue at "Phase N — TDD each Phase in the plan" below.**
**Compound → skip to "Compound branch — propose and apply children" below.**

### Leaf path

#### Phase N — TDD each Phase in the plan, in order

For each `## Phase` section in the Description (or, if the Description has no explicit
Phase breakdown, treat the whole task as one Phase):

1. **Red** — write or adjust the test(s) that describe the Phase's expected behavior;
   run them and confirm they fail for the expected reason (not a typo/setup error).
2. **Green** — implement the minimum change to make those tests pass.
3. **DoD for this Phase** — run the Phase's own Definition of Done commands if the plan
   lists Phase-scoped ones; otherwise run the task-level DoD commands relevant to what
   you touched (e.g. `bunx tsc --noEmit` when TypeScript changed, `bun run check .` when
   formatting/linting changed, `bun test` or a scoped test file).
4. **Checkpoint the Phase** — record progress so the state survives a restart, e.g.
   `epicd task edit <taskId> --append-notes "Phase <n> done: <one-line summary>"`.
   Never pass `--status`/`--dod`/`--check-dod` here — the task's terminal phase is a
   merge gate owned by `engine complete`, not something a worker self-attests.

Do not skip Phases and do not merge two Phases into one commit unless the plan itself
says they are one recoverable checkpoint.

#### When a Phase's own DoD goes red — root-cause classification (BACK-682)

If a Phase's structured DoD gate (or the task-level DoD you re-run at Finalise) fails,
do not just retry the same fix blindly. Classify the root cause first:

- **Implementation-layer** — the code is wrong relative to an AC that is itself still
  correct and achievable as written (a bug, a missed edge case, a broken test, a
  formatting/lint violation). **Fix it in this inner loop** — go back to Red/Green for
  the affected Phase and keep iterating here. This is the common case and never leaves
  this skill's loop.
- **Spec, decomposition, or goal layer** — the gap is NOT something more implementation
  effort can close: the AC as written is ambiguous/contradictory, the task was
  decomposed in a way that makes an AC unachievable without touching a sibling task's
  scope, or the task's own goal turned out to need to change. These gaps are thrown
  **outward**, never patched around inside this skill — that is exactly what
  `execution/adjudicating` and its single-step retreat contract
  (`src/engine/retreat.ts`) exist for (BACK-682 AC#1/#4). This skill does not write retreat_log
  or gap_history itself, and does **not** edit `phase` directly to force a
  retreat — write access to the retreat edge belongs only to the `adjudicating` phase's
  own audit (see `plugin/skills/adjudicate/SKILL.md`). Concretely: finish this Phase's
  work as far as the implementation layer allows, checkpoint via `--append-notes`
  describing precisely which AC(s) you believe are a spec/decomposition/goal-layer gap
  and why, and hand off through the normal Finalise step below — the independent
  adjudicating audit is what decides whether to retreat, not this skill.

**Red line: only ever change the implementation to satisfy an AC — never change an AC
to fit whatever the implementation happens to do.** 只改实现满足 AC,绝不改 AC 适配实现.
If an AC genuinely cannot be satisfied as written, that is a spec/decomposition/goal-layer
gap (see above) — it is not license to reinterpret or water down the AC yourself.

#### Simplify before finishing

Before declaring the task done, re-read what you built with the hindsight you now have
and simplify anything that turned out more layered than the problem needed. This mirrors
the project's own simplicity-first rule (`CLAUDE.md`): prefer one implementation for
similar concerns, keep APIs minimal, avoid speculative layers.

#### Finalise — commit and hand off to the merge gate

1. Stage and commit your working-tree changes (never stage `backlog/tasks/**` — the
   board file is engine-owned and `engine complete` writes it after merge):
   `git add -A -- . ':!backlog/tasks' && git commit -m "<taskId> - <short title>"`.
2. Run the full task-level DoD one last time in the worktree.
3. Checkpoint completion, then hand off to the engine's own completion handshake:
   `epicd engine complete <taskId> --worktree <worktreePath>`.
   This independently re-runs the task's DoD shell-gates in the worktree (the worker
   never self-attests done) and either merges under the board lock — landing the task
   in `adjudicating` for its independent judgmental audit (BACK-682 AC#1; see
   `plugin/skills/adjudicate/SKILL.md` — not this skill's job to resolve) — or routes
   the task to `needs-human`. This is the only merge step this skill uses — never fall
   back to a different merge/lock mechanism, and never re-claim or re-spawn once the
   task has left `implementing`.

### Compound branch — propose and apply children

Folded in from the former standalone `epic-decompose` skill (BACK-686.3: decompose is
now a sub-capability of `implementing`, not a separately dispatched phase).

1. Read the epic's `## Sub-Task Decomposition` section (if present) in the Description —
   the epic author's own proposed breakdown and the starting point for what to propose.
2. Do NOT create the children yourself with `task create` — the engine creates them.
   Emit a JSON array describing the proposed children:
   ```json
   [{ "title": "...", "description": "...", "touches": ["optional/path/hints"] }]
   ```
   `touches` is optional (files/modules this child is expected to touch — best-effort,
   used only for an advisory sibling-overlap check, never blocks). An empty array `[]`
   routes the epic to `needs-human` instead of creating children — use this only if the
   plan genuinely has no viable decomposition (e.g. it should stay a single Basic task —
   in which case reconsider whether Phase 0's judgment should instead have been leaf).
3. Apply the proposal:
   ```bash
   echo '<json array>' | epicd engine decompose-apply <epicId>
   ```
   `engine decompose-apply` creates each child with engine fields
   (`pipeline_id`/`phase`/`parent_id`) and advances the epic's phase to
   `awaiting-children`. This is the only creation/merge implementation this skill uses —
   never fall back to `task create` for children or hand-edit the epic's phase.

Once children are created, this skill's work for the epic is done — `awaiting-children`
has `actor: none`; the engine advances the epic to `adjudicating` (a mechanical gate,
folding in Integration Acceptance + child-terminal-state aggregation, BACK-686.2) once
all children reach a terminal phase. Do not poll or wait here.

## Constraints

- Do not run `git merge` or `git push` yourself — `engine complete` owns the merge (leaf
  path only; the compound branch has no worktree/branch of its own).
- Do not modify engine mechanics (complete/adjudicate/DoD re-run/merge-lock/worktree/
  claim/pipeline-as-data) while executing a task — this skill only describes how to do
  the work that sits on top of those mechanics, never how to change them.
- Do not spawn further nested agents from inside this skill's execution.
- contracts-lint (this skill's `contract.json`) validates structure/portability only —
  it is not, and cannot be, a validity check on the decompose-vs-leaf judgment itself.
