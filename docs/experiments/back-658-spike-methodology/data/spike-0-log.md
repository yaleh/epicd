# Spike 0 Log — Raw Timeline

**Experiment**: back-658-spike-methodology, Iteration 0
**Spike subject**: Could epicd's `engine dispatch` / scan-loop transport support a
*foreground sequential loop* execution mode (the open design question behind
deferred task BACK-660)?

---

## Step 2 — Pre-spike declaration (written before starting)

- **Scope (as I stated it beforehand)**: Read `src/engine/dispatch.ts` in full,
  `plugin/scripts/scan-loop.cjs` structurally (grep + targeted read, not every
  line), `docs/adr/ADR-015-monitor-as-invocation-adapter.md`, and
  `handle-basic-ready.sh` if needed — enough to sketch what changes a
  foreground sequential loop would require, without implementing anything.
- **Declared time budget**: 25 minutes (declared start 17:14:17 local /
  system clock). Rationale given at the time: "read-and-sketch across ~3
  files plus one ADR matches a 20-30 min skim, not a deep audit."
- **Declared "done" bar**: be able to state concretely (a) what code today
  forces background-agent dispatch, (b) what would need to change for a
  foreground sequential loop, (c) whether BACK-660 is well-scoped/buildable
  as-is or needs more upstream design first.

## Step 3 — What actually happened (real timeline)

- 17:14:17 — declared budget, began reading `src/engine/dispatch.ts` (177
  lines, read in full).
- Read `docs/adr/ADR-015-monitor-as-invocation-adapter.md` (D1-D5 decision
  sections, ~60 lines) in the same pass.
- Read `plugin/scripts/scan-loop.cjs` structurally: full function-name grep
  (80 matches) + targeted read of the runtime entry point / `tick()` (last
  ~150 lines) rather than the whole 749-line file.
- 17:15:53 — investigation substantively complete; wrote up findings below.
- **System-clock elapsed**: ~2 minutes (17:14:17 → 17:15:53), well under the
  25-minute declared budget.
- **Scope drift**: none in file selection — read exactly the files declared,
  did not expand to `handle-basic-ready.sh` (didn't turn out to be needed:
  BACK-660's own task text already quotes the relevant `dispatch.ts` line
  numbers, and the control-flow question was answerable from
  `dispatch.ts` + `scan-loop.cjs` + ADR-015 alone).
- **Honest anomaly worth flagging**: the system-clock gap (~2 min) does not
  plausibly reflect the actual reading/reasoning effort involved (reading
  177 + ~120 lines closely, cross-referencing an ADR, and reasoning about
  two candidate architectures). This environment's wall-clock ticks do not
  reliably track model "thinking" effort. See retrospective — this is a
  first-class finding for the timeboxing rule, not a footnote.

## Step 1 (grounding read before the spike, per experiment prompt)

Grounding documents read in full or in the relevant section before starting:
- `backlog/tasks/back-658 - *.md` (parent task, full text)
- `docs/task-lifecycle-model.md` §3 (three pipelines) and relevant parts of
  §4 (status/role as projection)
- `src/engine/pipeline.ts` (`explorationPipeline`, AC#3 comment)
- `src/engine/exploration-handlers.ts` (`SpikeVerdict`, `SpikeRunner`,
  `makeExplorationWorktreeOps`, `PromoteToExecution`, `makeStorePromoter`) —
  full file, 71 lines
- `backlog/tasks/back-660 - *.md` (the deferred task this spike investigates)

## Step 4 — Findings

1. **The task's own premise is validated by the code.** BACK-660 claims the
   background implementation Agent spawned today is restricted to
   `allowed-tools: Bash, Read, Write, Edit, Glob, Grep` (no `Skill`/`Agent`
   tools) — confirmed verbatim at `src/engine/dispatch.ts:81`. This matches
   this user's own standing memory note ("Agent 调用不支持嵌套(仅主会话可派发,
   前台/后台都不行)"): a background Agent cannot itself invoke `Skill` or
   spawn further agents. So the stated motivation for a foreground loop
   (unlock `Skill` invocation per phase) is real and already evidenced, not
   speculative.

2. **ADR-015 already names the destination architecture, but only at the
   invocation-seam level, not the control-flow level.** D1's table literally
   lists the "ideal state" (`claude -p "<self-contained prompt>"`, caller
   spawns process and awaits) versus "current state" (persistent Monitor
   seat multiplexing via stdout events). A foreground sequential loop is
   architecturally the "ideal state" column running as ONE long-lived
   session instead of one-process-per-task. ADR-015 D4 (swap-litmus) already
   requires the payload to be equally drivable by either — so the payload
   contract itself does not need to change in kind, only the "Step 6: Spawn
   ONE background implementation Agent" section's *content* (do the work
   inline, not via `Agent(run_in_background=true)`).

3. **The concrete code delta is narrow and already self-identified.**
   `renderBasicReadyDispatch`'s Step 6 block (`dispatch.ts:50-81`) is exactly
   what BACK-660's own description cites as needing replacement. Swapping
   "spawn a background Agent with this prompt" for "do this work yourself,
   in this session, now" is a small, mechanical text change to one function.

4. **The genuinely open question is the loop's control flow, and it is
   NOT resolved by reading the current code — it is a real design fork.**
   `scan-loop.cjs`'s `tick()` today runs on a fixed `setInterval`, and a
   single tick can emit events for *multiple different ready tasks* across
   channels (`basic-ready`/`epic-ready`/`epic-eval-due`) each dispatched to
   whichever Monitor seat happens to be listening — i.e. it's a push/
   multiplex model, not sequential-pull. Converting to "foreground sequential
   loop, one task fully to completion before the next" requires deciding
   **where the "wait, then fetch the next ready item" control lives**:
   - **Option A**: inside `scan-loop.cjs` itself — the Node process blocks
     (or re-ticks conditionally) until a per-task completion signal appears,
     changing its `tick()`/main-loop shape from unconditional interval-fire
     to gated single-flight.
   - **Option B**: entirely outside `scan-loop.cjs` — the foreground Claude
     Code session's own prompted instructions are what re-invoke
     `engine scan --once` / re-dispatch after each `engine complete`, and
     `scan-loop.cjs` keeps ticking on interval as pure transport exactly as
     today; "sequential" becomes a property of the session's own instructed
     behavior, not the daemon's control flow.
   These are materially different implementations with different failure
   modes (crash recovery, restart semantics, concurrency-lane interaction
   with driver/lane abstraction BACK-660 explicitly says must be preserved)
   and neither is decided by anything read in this spike.

5. **BACK-660's own task header already flags this.** The task's status
   line reads: "状态：draft。里程碑 A 达成后的下游；proposal/plan 待进一步讨论后再补，
   勿直接跑 feature-to-backlog" — i.e., the task's author already marked it
   as needing further proposal/plan discussion before it's buildable, and
   explicitly warned against running `feature-to-backlog` on it directly.
   This spike's independent reading of the code corroborates that warning
   with a concrete example of the unresolved fork (finding 4), rather than
   just accepting the header at face value.

## Kill/Promote Verdict

**KILL** (in the experiment's terminology: no follow-on *execution* task is
promoted from this spike right now) — **not** because the idea is bad, but
because the answer to "is BACK-660 well-scoped/buildable as-is" is **no**.

**Precise reason**: the spike surfaced a genuine, unresolved architectural
fork (Option A vs Option B above, finding 4) that determines a large fraction
of BACK-660's implementation shape and cannot be resolved by more reading —
it requires a design decision (and probably a short written proposal/ADR
addendum, per the task's own "proposal/plan 待进一步讨论" note) before a
Basic-sized execution task can be scoped with confidence. Promoting straight
to execution now would very likely require abandoning or majorly reworking
whichever option gets implemented first without that decision being made
deliberately.

**What a legitimate follow-on would be** (stated per the experiment's
instruction, not created): a short **design-discussion / decision-record
task** — not an execution task — titled something like "决定 monitor 前台顺序
loop 的控制流位置：scan-loop 内门控 vs 会话侧显式重派发（BACK-660 前置）", scoped to
resolve finding 4's fork (and confirm how it composes with the driver/lane
multi-concurrency requirement BACK-660 names as a "不动点"). Only after that
decision is written down does BACK-660 itself become a well-scoped Basic
execution task.

## Step 5 — Retrospective

- **Did declared budget match reality?** System-clock-wise, drastically
  under (2 min actual vs 25 min declared) — but this measurement is
  suspect (see anomaly note above). The *effort* (files/lines read,
  cross-referencing) roughly matched what a 20-30 min investigation was
  meant to cover; the clock did not track it. No scope creep occurred:
  the file list read matched exactly what was declared upfront.
- **What made the kill/promote call easy vs hard?** Easy, in the end: the
  question resolved to a clean, nameable fork (Option A/B) rather than
  vague uncertainty, and the task's own header already agreed with the
  verdict. Before starting, I expected this to be *harder* — I thought I
  might need to actually trace `handle-basic-ready.sh` and the worktree/
  claim mechanics to find the blocker. It turned out the blocking issue was
  purely architectural/control-flow, found by reading `scan-loop.cjs`'s
  entry point and `dispatch.ts`'s Step 6 side by side with ADR-015 D1's own
  comparison table — no need to go deeper into locking/claim mechanics at
  all for this call (though a real execution task would need that later).
- **What info, if had upfront, would have made this faster/more
  confident?** Knowing in advance that ADR-015 D1 already contains an
  explicit "ideal vs current" comparison table would have let me jump
  straight to it instead of reading `dispatch.ts` cold first. More
  generally: a lightweight map of "which ADR/design doc already answers
  which class of question" would shortcut scoping time for any spike in
  this codebase.
- **What would I have done differently with an existing spike
  process/checklist?** I improvised the scope declaration and the
  five-step structure (declare → read → find → verdict → retrospective)
  from the experiment prompt itself, not from any established habit. A
  checklist would probably have made me state the "done bar" more
  sharply upfront (I wrote "concretely a/b/c" but didn't pre-commit to
  *how many* candidate architectures counts as "enough" — I got lucky that
  exactly one clean fork emerged rather than three fuzzy possibilities,
  which could have blown the budget with no clear stopping point).
