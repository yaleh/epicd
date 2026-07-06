# Spike 1 Log — Applying v1 Timeboxing Rule + v1 Kill/Promote Procedure

**Experiment**: back-658-spike-methodology, Iteration 1
**Spike subject**: Does epicd's own runtime (post-BACK-628.2 supervisor) have
an **engine-native mechanism that reaps/resets a stale in-flight task claim**
(a task stuck "In Progress" whose worker died), or does that function still
depend entirely on baime's `scan-loop.cjs` "stale-in-progress reaper"? This
matters directly for BACK-665 AC#4 ("epicd 原生运行时自足：停用 baime
scan-loop.js reaper 后仍全程驱动") — a genuine, currently-unanswered-to-me
question, distinct from Iteration 0's BACK-660 foreground-loop subject.

**How the topic was found**: while scanning backlog candidates for this
iteration's 2nd spike (`task list`, then reading BACK-665's and BACK-628.2's
full task text for context), BACK-665's description explicitly names
`Coordinator.claims`（运行时；永不持久）as a load-bearing concept and
`src/core/backlog.ts` contains a comment referencing "scan-loop's
stale-in-progress reaper" as something a status-update code path must not
clobber — but neither confirms whether epicd's own supervisor (BACK-628.2,
already marked Done) actually replaced that reaper function, or only
replaced ready-task dispatch. That gap is the genuine unknown this spike
investigates. This candidate-scanning phase itself was ~4 tool calls (task
list + 3 task views) and is **not** counted against this spike's declared
ceiling below, consistent with `timeboxing-rule-v1.md`'s scope being "the
declared file/doc list for investigating the question," not "however I
found the question."

---

## Step 1 — Pre-spike declaration (v1 timeboxing rule, applied as written)

- **Declared scope (file/doc list)**: grep across `src/` for
  stale/reap/claim/active-agents references; full read of
  `src/web/lib/coordinator-claims.ts`; full read of `src/engine/supervisor.ts`;
  relevant section of `src/engine/safety.ts`; the `backlog.ts` comment
  context; BACK-628.2's task text (to check its own stated scope/non-goals).
- **Declared tool-call ceiling**: 12 (the v1 default).
- **Declared done bar**: be able to state concretely (a) whether an
  epicd-native mechanism exists today that detects and resets a stale
  in-flight claim (not just displays staleness), and (b) if not, whether
  BACK-628.2 or any other Done/open task already scopes building it, or
  whether it is an undocumented gap.

## Step 2 — Real timeline (actual tool calls, in order)

1. `grep -rln "staleness|stale claim|reap" src/` (excluding tests) →
   surfaced `src/core/backlog.ts` only.
2. `grep -n "staleness|stale claim|reap" src/core/backlog.ts` → one hit, a
   comment (see Finding 1).
3. `grep -rln "class Coordinator|Coordinator\b" src/` → surfaced
   `coordinator-claims.ts` plus three web/UI files and `server/index.ts`.
4. Full read of `src/web/lib/coordinator-claims.ts` (68 lines).
5. `sed -n '1100,1145p' src/core/backlog.ts` (context around the reaper
   comment).
6. `grep -n "active-agents|\.wt\b|reap|stale" src/engine/*.ts src/cli.ts`
   (excluding tests) → surfaced `dispatch.ts`, `supervisor.ts`, `safety.ts`,
   `run.ts`.
7. `wc -l src/engine/supervisor.ts src/engine/safety.ts` (sizing before
   full read, to budget remaining tool calls against the ceiling).
8. Full read of `src/engine/supervisor.ts` (98 lines).
9. Read `src/engine/safety.ts` lines 1-60 (merge-lock section, the other
   `stale: 30_000` hit).
10. `task view back-628.2` (its own text — AC list + Implementation Notes).

**Tool calls used**: 10 of 12 declared ceiling. **Stopped at step (b) of the
stop rule** — both done-bar questions were answerable after step 10, before
hitting the ceiling. No scope drift: every file read was on the declared
list or a direct grep-surfaced extension of it (`run.ts`/`dispatch.ts` hits
were checked via grep only, not fully read, since they didn't contain
reaping logic — see Finding 3).

## Step 3 — Findings

1. **`src/core/backlog.ts`'s only reaping-related reference is a
   preservation comment, not an implementation.** Line ~1131:
   "scan-loop's stale-in-progress reaper depends on that literal
   surviving" — i.e. `updateTask` is careful not to clobber the
   `"Basic: In Progress"` status string specifically *because* an external
   reaper (baime's) reads it. This confirms the reaper referenced is
   baime's, not epicd's own.

2. **`coordinator-claims.ts` is explicitly read-only and display-only.**
   Its own docstring: "Read-only adapter over baime coordinator's on-disk
   claim state... BACK-604 §AC#2." `getCoordinatorClaimState`/
   `getCoordinatorClaimStates` compute a `"stale"` label (worktree path
   recorded but no longer exists on disk) purely for the web UI's claim
   indicator (BACK-604) — there is no write path here that resets or
   un-claims a stale task. This is a UI-side derivation, not a driver-side
   reaping mechanism.

3. **`supervisor.ts` (BACK-628.2's actual epicd-native supervisor,
   98 lines, read in full) contains no stale-in-flight-claim reaping
   logic at all.** Its only responsibilities, confirmed by reading every
   function: `supervisorTick` (scan for ready tasks not yet
   cap-marker-dispatched, dispatch them) and `acquireFieldLock`
   (single-instance field lock with a 30s **lockfile** staleness setting —
   `proper-lockfile`'s own stale-lock-detection parameter, unrelated to
   task-claim staleness). `safety.ts`'s `stale: 30_000` is the identical
   `proper-lockfile` parameter for the merge lock, same category, not a
   task-reaper.

4. **BACK-628.2's own task text scopes exactly this out, but doesn't flag
   it as a known future gap.** Its AC list (#1-#4) covers supervisor
   existence/ENG-1..6, autonomous dispatch-to-terminal, swap-litmus, and
   demoting `scan-loop.cjs` to "optional compat transport" — but AC#4 says
   scan-loop.cjs becomes optional, **while its own Implementation Notes
   confirm the smoke-test AC#2 run happened with scan-loop.cjs killed
   entirely** (so *dispatch* genuinely doesn't need it). Nothing in
   BACK-628.2's ACs or notes claims stale-claim reaping was ported —
   the task's own scope silently doesn't mention this function at all,
   neither as done nor as deferred.

5. **This directly matters for BACK-665 AC#4**, which explicitly requires
   "停用 baime scan-loop.js reaper 后 epicd 仍全程驱动" (epicd still fully
   drives after the baime scan-loop reaper is disabled) — i.e. BACK-665's
   own acceptance criteria already anticipates this exact function needs
   to exist and is not yet claimed done anywhere. No task in the current
   backlog view (BACK-660, BACK-628.2, BACK-643, BACK-664, BACK-665 itself)
   explicitly scopes "port the stale-in-progress reaper into the epicd
   supervisor" as its own concrete AC — it is currently an **implicit
   sub-requirement of BACK-665 AC#4**, not a named, scoped piece of work.

## Step 4 — Kill/Promote verdict (v1 procedure applied mechanically)

- **Step 1 (re-state done bar)**: done-bar answered — (a) no, epicd's own
  supervisor has no stale-claim reaping; baime's scan-loop.cjs is still the
  only mechanism; (b) no task currently names this as its own scoped AC —
  it's an unstated dependency of BACK-665 AC#4.
- **Step 2 (external corroborating signal)**: **found**, and it cuts the
  opposite way from Iteration 0's case — BACK-665's own AC#4 text is
  independent corroboration that this gap is real and matters (a design
  doc explicitly requires the missing function), rather than corroborating
  an existing answer. Recorded per the procedure regardless of direction.
- **Step 3 (resolved vs. relocated)**: **resolved** for the narrow question
  asked ("does it exist today?" — no, confirmed by full reads of the only
  two candidate files) — this is a clean negative finding, not a fork.
  Unlike Iteration 0 (where the *design* question forked into two
  undecided options), here the *existence* question has a clean, single
  answer: the mechanism does not exist yet.
- **Step 4 (concrete follow-on shape)**: **yes** — a nameable, scoped
  follow-on exists: "port/implement a stale-in-flight-claim reaper inside
  `src/engine/supervisor.ts` (or a sibling module), reusing
  `coordinator-claims.ts`'s existing staleness *detection* logic
  (worktree-path-missing check) but adding the missing *action* (reset the
  task's phase/status so the scanner can re-dispatch it) — this is
  concrete enough to scope as a Basic execution task once BACK-665's
  child-task boundaries are drawn, and it directly unblocks BACK-665 AC#4.
- **Verdict**: **PROMOTE** (as a stated finding — per this experiment's own
  non-goal restriction, no actual task is created; the finding is recorded
  here as the deliverable, matching the experiment's "record the
  hypothetical promotion decision, do not act on it in the live backlog"
  boundary. See iteration-1.md §3 for how this boundary was honored.)

This is a genuinely different verdict shape than Iteration 0 (which was a
clean KILL on a design-fork case) — a useful contrast for
`decision_correctness` evidence, since it shows the procedure producing
both outcomes on real, independently-arrived-at cases rather than only ever
reproducing one verdict.

## Step 5 — Retrospective (honest evaluation of v1 procedure fidelity)

- **Did the timeboxing ceiling hold?** Yes, cleanly — 10 of 12 tool calls
  used, stopped because the done-bar questions were answered, not because
  the ceiling forced a stop. This spike did not actually stress-test the
  ceiling itself (never got close enough to see what happens when it's
  hit before the done bar is reached) — that remains an open gap for
  Iteration 2, as already flagged in `timeboxing-rule-v1.md`.
- **Did the kill/promote procedure make the call clear, or was it still ad
  hoc judgment?** Mostly clear — steps 1-4 were mechanically followable in
  order and each had a genuine, non-forced answer at each step (this is
  different from just rationalizing a pre-formed verdict: the "resolved
  vs. relocated" question at step 3 in particular required actually
  checking whether this was a clean existence-question or another design
  fork, and it turned out to be genuinely the former, which was not known
  in advance). One friction point: step 4's "concrete enough to scope as a
  Basic task" test is still a judgment call, not a checkable rule (exactly
  the gap already flagged in `kill-promote-procedure-v1.md`) — I judged
  "port reaping logic into supervisor.ts, reusing existing detection code"
  as concrete enough, but a stricter or looser reader might disagree, and
  the procedure gives no way to settle that disagreement mechanically.
- **Did the procedure's mechanical application match independent
  judgment?** Yes, they agreed — re-reading Findings 1-5 without the
  procedure, ad hoc judgment would also land on "this is a real, promotable
  gap," so no divergence to report this iteration. This is itself a
  limitation of this spike as evidence: like Iteration 0, this was not a
  boundary case, so the procedure's real test (does it change a verdict
  the reader's raw judgment would have gotten wrong, or does it just add
  bureaucratic ceremony to an already-clear case?) has still not happened
  in either of the two spikes run so far. This is the central gap
  Iteration 2 must close.
- **Was the output artifact template (v1) sufficient?** Yes — the same
  five sections used in spike-0's ad hoc log (declaration / timeline /
  findings / verdict / retrospective) were sufficient here too, now
  formalized as `knowledge/templates/spike-output-artifact.md`. No 6th
  section was needed.
