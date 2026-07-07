# Patterns and evidence detail

Two primary sources feed this skill: the **multi-child (Epic) path**
(`docs/research/baime-fixpoint-convergence/` — README.md,
context-isolation-plan.md, ITERATION-PROMPTS.md,
iterations/iteration-0.md..iteration-4.md) and the **single-task path**
(`docs/research/lightweight-fixpoint/README.md`). Both are mostly in Chinese;
this file is an English-facing distillation. The 5-iteration trajectory below
is the Epic path (those iterations really were epics — that framing is kept
faithful); the single-task path is summarized in its own section at the end.

## Dual-layer value function

The source experiments score every iteration/sample on two axes, and this
skill inherits the framing (without requiring you to compute these numbers for
routine use — they were a research instrument, not an operational gate):

- **V_instance** — did *this specific task* reach a trustworthy done state:
  real engine-mechanism completion (not hand-edited status), at least one
  fresh-context audit round confirming zero new blockers. Components scored:
  `gate_integrity`, `defect_signal`, `audit_cleanliness`, `scope_discipline`.
- **V_meta** — is *the methodology itself* (assess → [decompose] → worktree →
  independent implementation → independent audit → evaluate → loop-until-dry;
  the decompose step drops out on the single-leaf path) working and
  transferable across tasks, not just this one. Components scored:
  `completeness` (is it documented, and documented *as it's discovered*),
  `effectiveness` (quantified basis — wall-clock, token/tool_use counts,
  needs-human false-positive rate), `reusability` (domain-agnostic vs
  project-specific separation, cross-project evidence), `validation` (is
  "independent audit" actually independent, checked structurally not just
  claimed).

## Trajectory (5 iterations, honest and non-monotonic)

| # | Epic | V_instance | V_meta | Δ V_instance | Δ V_meta |
|---|---|---|---|---|---|
| 0 | BACK-628 (self-audit epic) | 0.86 | 0.47 | — | — |
| 1 | BACK-602 (structured gate-event log) | 0.94 | 0.59 | +0.08 | +0.12 |
| 2 | BACK-603 (pipeline-as-data generalization) | 0.93 | 0.66 | −0.01 | +0.07 |
| 3 | BACK-605 (engine-operation skill plugin) | 0.92 | 0.65 | −0.01 | −0.01 |
| 4 | BACK-604 (multi-lane issue-list UI + auth) | 0.90 | 0.70 | −0.02 | +0.05 |

**Overall status: NOT converged.** V_meta 0.70 < 0.80 threshold. The
trajectory is not monotonic: iteration-3 had a small dual-metric dip
(operational needs-human noise, a completeness regression — methodology
insights were backfilled after the fact instead of updated in the moment).
Iteration-4 partially rebounded (V_meta +0.05) largely because two
previously-untested sub-steps — decompose-front-loaded survey/AC
concretization, and needs-human root-cause classification — were exercised
for the first time and both confirmed valuable, while V_instance dropped
slightly (−0.02) because two ACs were honestly left unchecked as
non-mechanically-verifiable rather than rubber-stamped. 5 data points are
not enough to call this a stable convergence regime, and cross-project
transfer evidence is still outstanding (would need a real migration to
another codebase, not just an in-repo synthetic-empty-repo check).

## Per-iteration key findings (condensed)

- **Iteration 0 (BACK-628)**: first application. Proved the core hypothesis
  — negative-control audit catches real problems (a zero-caller module
  violating simplicity-first). Gap: no second independent audit round after
  the fix — this became the standard step added in iteration 1.
- **Iteration 1 (BACK-602)**: added the "second independent audit after any
  fix" rule. First real engine-structural bug found by *not trusting agent
  self-report on DoD* (BACK-634-class issue): trusting the implementing
  agent's own test run would have missed a real defect that only a
  from-scratch parallel test run surfaced.
- **Iteration 2 (BACK-603)**: the load-bearing methodology-correction round.
  Discovered the depth-1 dispatch constraint (see SKILL.md and
  `context-isolation-plan.md`) via a failed 3-layer epic-driver design.
  Corrected to the 2-layer model. Also: first quantified wall-clock baseline
  (decompose→all-children-done ≈28 min). The audit-independence failure was
  caught by the *user*, not by the process itself — flagged as an unresolved
  validation gap (no mechanized self-check that an audit was actually
  independently dispatched).
- **Iteration 3 (BACK-605)**: two children both routed to needs-human for
  the *same* operational root cause (untracked board-file merge collision,
  not a real DoD gate hit) — filed as an engine defect follow-up
  (BACK-642) rather than miscounted as "the gate caught a real problem".
  Main-session independent re-run (not trusting the implementing agent's own
  green test run) caught a real intermittent flake under full parallel test
  load. Honest regression: methodology insights discovered mid-round were
  backfilled into docs after the fact, not updated in the moment —
  completeness score dropped versus iteration 2's claim of "synchronous
  maintenance".
- **Iteration 4 (BACK-604)**: first full run of the corrected 2-layer
  skeleton end to end, including the decompose-front-loaded step (which
  caught two ACs that were inherently non-mechanically-verifiable and got
  them honestly rewritten/left-unchecked before decompose, avoiding audit
  disagreement later) and needs-human root-cause classification. First real
  test of a lifecycle-style DoD gate (server + Playwright e2e) — worked,
  6/6 passing across 3 independent re-runs, no flake, previously flagged as
  an unverified risk in `context-isolation-plan.md`. Two independent audit
  rounds progressively found a real, exploitable authorization gap: round 1
  found one unprotected endpoint and fixed it; round 2 (zero memory of
  round 1's specifics) found the fix was incomplete — three more endpoints
  were still unprotected, one demonstrated live to leak task data — and
  hardened the token comparison to constant-time. This is the strongest
  evidence in the whole experiment for why audits must be independent and
  run more than once.

## Operational lessons independent of the epicd-specific tooling

- `git add -A` during manual conflict resolution can silently sweep in
  unrelated uncommitted changes from the working tree into a merge's
  history — prefer adding only the conflicting paths.
- Build/generate steps that run as a side effect of a wrapper script (e.g.
  a CSS build step invoked by a `run` script) can dirty the working tree
  with byte-level diffs and block merges that require a clean tree — this
  is a tooling wrinkle, not a DoD failure, and should be recognized as such
  rather than re-diagnosed each time.
- needs-human false-positive rate is a countable, comparable metric across
  rounds (iteration-3: 2/2 same root cause) — worth tracking if you want a
  quantified effectiveness signal instead of only qualitative impressions.

## Single-task path samples (the single-leaf branch)

Source: `docs/research/lightweight-fixpoint/README.md`. This path is the
degenerate no-children case — a single atomic Basic task claimed with a
structured DoD gate, one dispatched implementation agent, `engine complete
--worktree` re-running the gate and merging, and a risk-gated audit decision
(run a round, or record an explicit skip). No decompose, no fixpoint-meter.

Convergence here is **process-capability**, not the dual-threshold scoring the
Epic path uses: a sample counts toward a "zero-new-forced-step" streak only if
it (1) declared structured `dodGates`, (2) exercised the trusted auto-merge
path (or a needs-human correctly classified as a real gate / legitimate
safe-default), (3) landed an explicit audit decision, and (4) added no new
forced step to the skeleton. Declare fixpoint at K=3 consecutive qualifying
samples.

| # | Task | wall-clock | outcome | why it did / didn't qualify |
|---|---|---|---|---|
| 1 | BACK-649 | ~21 min | Done (manual收口) | no dodGates; bypassed auto-merge; audit decision unrecorded → **spawned** the "audit decision must be landed" forced step |
| 2 | BACK-653 | ~40 min | Done (auto, incl. audit) | all skeleton parts green, BUT first execution of needs-human root-cause classification → **added** that forced step |
| 3 | BACK-654 | ~50 min | Done (manual收口) | task legitimately declared no dodGates (real safe-default), so criterion (1)/(2) unmet; first "zero new step" sample |
| 4 | BACK-655 | ~75 min | Done (manual收口) | hit a NEW root-cause class — non-ASCII board-file name defeats the auto-conflict resolver (filed BACK-662); criterion (2) unmet; second "zero new step" sample |

**Current streak: 0.** No single sample has satisfied all four criteria at
once — each stalls on a different one. The honest reading: the skeleton itself
has been "zero new forced step" for two straight samples (654, 655), so it is
stabilizing; the bottleneck has moved OFF skeleton design and ONTO the
auto-merge mechanism it depends on (`engine complete --worktree`'s
board-only-conflict resolver, BACK-662). Any task with a non-ASCII title that
hits a board-only conflict will reproduce the failure until BACK-662 lands —
so the next qualifying sample should be re-run after that fix. Cross-project
transfer of this path is still an open evidence gap, same as the Epic path.
