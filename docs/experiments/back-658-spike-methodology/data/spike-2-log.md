# Spike 2 Log — Deliberate Boundary-Case Stress Test of v1 Procedure

**Experiment**: back-658-spike-methodology, Iteration 2
**Spike subject**: Is epicd's gate-events surface (`appendGateEvent` write path
in `src/harness/stage2-gate.ts`, `GET /api/gate-events` REST endpoint in
`src/server/index.ts`, CLI `engine gate-log`, and the `inbox` skill consumer)
now orphaned scaffolding worth a cleanup/consolidation follow-on task, or
intentionally-kept low-cost latent instrumentation that needs no action —
picked *because* BACK-653 (merged today, in git history) explicitly just
removed the one Web UI consumer (`GateInboxPage`) this surface was originally
built for (BACK-605.10), which made "is what's left still justified" a
genuinely live, undecided-to-me question, unlike spike-0/1's cleaner
existence/design-fork questions.

**Why this was selected as the boundary case** (per Iteration 1 Priority 2 gap
analysis): unlike spike-0 (a clean architectural-fork KILL) and spike-1 (a
clean existence-question PROMOTE), this topic has a plausible case for either
verdict before investigation: "leave orphaned-but-harmless code alone" and
"file a cleanup task for now-consumerless surface area" are both defensible
engineering positions, and I did not know in advance which the evidence would
support.

---

## Step 1 — Pre-spike declaration (v1 timeboxing rule, applied as written)

- **Declared scope**: `src/harness/stage2-gate.ts`, `src/engine/gate-log.ts`,
  `src/server/index.ts` (gate-events handler), `plugin/skills/inbox/SKILL.md`,
  grep for real (non-test) callers of the stage2-gate write path, check
  `docs/research/gate-events.jsonl` existence, check test coverage.
- **Declared tool-call ceiling**: 12 (v1 default, unchanged).
- **Declared done bar**: (a) does anything besides stage2-gate.ts's own DoD
  flow ever call `appendGateEvent` in a real dispatch/complete run path; (b)
  do the REST/CLI/skill readers have a real consumer today, or are they
  reading a log nothing currently produces in practice; (c) is there a
  concrete, nameable follow-on task shape either way.
- **Candidate-scan calls not counted** (per v1's precedent from spike-1): 3
  calls (`task view back-653`, 2 greps for `appendGateEvent`/gate-events
  callers) were spent finding this topic, before the declaration above.

## Step 2 — Real timeline (actual tool calls, in order, counted against the 12 ceiling)

1. Read `src/harness/stage2-gate.ts` (header + first 60 lines).
2. Grep for real callers of `stage2Gate`/`runStage2Gate` across `src/`
   (excluding tests).
3. Read `src/engine/gate-log.ts` (first 50 lines).
4. Grep `src/server/index.ts` for `gate-events`/`gateLog`.
5. Grep `plugin/skills/inbox/SKILL.md` for `gate` context.
6. Combined check: `ls docs/research/gate-events.jsonl` (missing) +
   `git log --all -- docs/research/gate-events.jsonl` (empty) + grep for
   `"engine stage2-gate"` across markdown (surfaced BACK-601/602/633/636/
   600.10 task references, none showing a real non-CLI-invoked run).
7. `task list --plain | grep -i "605.10\|632\|633"` to locate the originating
   design tasks for this surface.
8. `task view back-633` full text — its own title states "迁移唯一现存调用方
   （stage2-gate）" (migrate **the only existing caller**) — i.e., stage2-gate
   being the sole writer was a stated, deliberate design fact from BACK-602/
   633's own plan, not an oversight discovered now.
9. Grep `src/web/App.tsx` and `SideNavigation.tsx` for `gate-inbox`/
   `GateInboxPage` — zero hits, confirming the Web consumer is fully removed
   (not just hidden), consistent with BACK-653's merged state.
10. `git log --oneline --all | grep -i 653` — confirmed BACK-653's
    `task/BACK-653` branch merged today (`ee6551b`, `ae9391d`), i.e. this is
    current, not stale information.
11. Grep `src/test/` and `src/web/` for `gate-events` references — surfaced 5
    test files, including `server-gate-events-endpoint.test.ts`, but no
    non-test consumer.
12. Read `src/server/index.ts` lines 815-845 (the handler + its own
    docstring) — **this call both answered the done bar and hit the declared
    ceiling simultaneously**: the docstring itself states the REST endpoint's
    Web consumer "was retired in BACK-653, but this REST endpoint is kept
    intentionally (per BACK-653 non-goals) for other consumers (e.g. tooling,
    the inbox skill)".

**Tool calls used**: **12 of 12 declared ceiling — the ceiling was reached for
the first time in this experiment**, not comfortably under it as in spike-1.
Stop-rule branch that actually fired: **both (a) ceiling reached and (b)
done-bar answered fired on the same, final tool call** — a tie the v1 stop
rule does not explicitly address (it lists three independent triggers but
does not say what happens when two fire simultaneously; in practice this was
moot here since both point the same direction — stop — but it is a real,
previously-untested edge, noted for v2).

## Step 3 — Findings

1. **The write path is a deliberate, single-purpose design, not an
   oversight.** `appendGateEvent`'s only non-test caller is
   `src/cli.ts`'s `stage2-gate` command (via `recordStage2Gate`), and
   BACK-633's own task text explicitly names this as "唯一现存调用方" (the
   only existing caller) as a known, stated design fact from BACK-602/633's
   plan — this was scoped and intentional, not discovered as a surprise gap.
2. **The CLI/skill read path has a real, current consumer.** `engine
   gate-log` (src/engine/gate-log.ts) is shelled out to by
   `plugin/skills/inbox/SKILL.md` ("Never writes anything... shells out to
   the engine's own `engine gate-log` command") — this is a live, used
   surface today (an agent invoking `/inbox` genuinely calls this path).
3. **The REST endpoint (`GET /api/gate-events`) has zero current consumers
   as of this spike.** Its one designed-for Web consumer (`GateInboxPage`)
   was removed by BACK-653 (confirmed via grep — zero hits in `App.tsx`/
   `SideNavigation.tsx` — and via git log showing BACK-653 merged today).
   No other caller of this REST route was found in `src/`.
4. **The endpoint's own justifying docstring is written today (as of
   BACK-653) but is subtly inaccurate.** It says the endpoint is "kept
   intentionally... for other consumers (e.g. tooling, the inbox skill)" —
   but the inbox skill's own SKILL.md is explicit that it calls the **CLI**
   (`engine gate-log`), not this REST route. The comment conflates a real
   consumer of a *sibling* surface (CLI) with a justification for *this*
   surface (REST), which on inspection does not hold up as precisely
   stated — a genuine, small inaccuracy this spike surfaced, not previously
   flagged anywhere.
5. **No test file exercises the REST endpoint from a non-test "real" call
   site** — `server-gate-events-endpoint.test.ts` tests the handler directly,
   which is appropriate test practice but doesn't constitute evidence of a
   production consumer either way.

## Step 4 — Kill/Promote verdict (v1 procedure applied mechanically, in real time)

Applying `kill-promote-procedure-v1.md` to the **declared done-bar
question** (is this whole surface orphaned scaffolding needing cleanup?):

- **Step 1 (re-state done bar)**: (a) no — only stage2-gate.ts writes, by
  deliberate design (Finding 1); (b) partially — CLI/skill path has a real
  consumer (Finding 2), REST path does not (Finding 3); (c) unclear until
  step 3/4 below.
- **Step 2 (external corroboration)**: **found**, and unusually direct — the
  code's own docstring (Finding 4) states a justification for the current
  state, function as a corroborating signal that a decision was already made.
- **Step 3 (resolved vs. relocated)**: **genuinely mixed, not clean either
  way** — this is the first time in this experiment step 3 does not resolve
  to one branch:
  - For the main declared question ("is the *whole* gate-events surface
    orphaned"): **resolved** — no, it is a working, deliberately-scoped,
    partially-used design (write path single-purpose by design; CLI/skill
    read path genuinely live).
  - But investigating that question surfaced an **emergent, narrower
    question the original done-bar did not declare in advance**: is the
    REST endpoint *specifically* justified, given its own stated
    justification (Finding 4) conflates a sibling surface's real consumer
    with itself? This narrower question is **relocated, not resolved** — it
    remains a live, open, undecided question after 12 tool calls, not
    closed by any of the evidence gathered.
- **Step 4 (concrete follow-on shape) — attempted for the emergent
  question**: yes, a concrete shape exists and is nameable: *"Correct or
  retire `GET /api/gate-events` (`src/server/index.ts:815-845`): either
  identify a genuine current/planned consumer and correct the docstring's
  inaccurate justification, or remove the endpoint as dead code now that its
  only designed consumer (`GateInboxPage`) is retired — Basic-sized,
  single-file, ~30-60 line diff."* This is concrete enough to scope as a
  Basic task if promoted.
- **Step 5 (ambiguity default) — this is the branch that actually fired,
  for the first time in this experiment**: v1's step 5 triggers when "steps
  3-4 do not produce a clean answer." Here, step 3 is genuinely mixed (one
  reading resolved, the emergent sub-reading relocated) — applying the
  literal text of step 5, **default to KILL**, with the ambiguity itself
  recorded as the reason.

**Verdict on the declared done-bar question**: **KILL** — the gate-events
surface as originally asked about is not orphaned scaffolding; it is a
deliberately-scoped, partially-live design, and the main question needs no
follow-on task.

**Verdict on the emergent side-finding** (REST endpoint's specific
justification): **KILL, via the v1 ambiguity default (step 5)** — but this
is the genuinely contested call the experiment was looking for. Recorded
explicitly:

- **Mechanical procedure output**: KILL (ambiguity default).
- **My independent gut judgment, checked honestly against the mechanical
  output**: also leans KILL, but *distinctly less confidently* than either
  spike-0 or spike-1 — the actual cost of the emergent finding is a
  one-line docstring inaccuracy plus an unused-but-harmless REST route, and
  my judgment is that this doesn't clear the bar for a dedicated execution
  task (CLAUDE.md's own simplicity-first ethos argues against filing tasks
  for near-zero-cost latent surface area) — so gut and procedure **agree**
  on the final verdict.
- **However, a stricter, equally reasonable reader would disagree**: this
  repo's own backlog contains multiple small, Basic-sized hygiene tasks for
  exactly this shape of issue (e.g. BACK-654/655's "fix an inconsistency in
  an already-working mechanism" pattern) — a reader applying that norm would
  call step 4's concrete-shape test decisive and **PROMOTE** the docstring/
  dead-code fix as a legitimate Basic task, treating step 3's "mixed" read as
  not actually blocking step 4 from being reached. **This is a genuine,
  disclosed procedure/reasonable-alternative conflict**, not a rubber-stamped
  agreement — recorded honestly per this iteration's explicit instruction,
  even though my own primary gut and the mechanical default happened to land
  on the same side this time.

## Step 5 — Retrospective (honest evaluation of v1 procedure under real pressure)

- **Did the timeboxing ceiling actually get tested under pressure this
  time?** Yes — 12 of 12 tool calls used, the first time in this experiment
  the ceiling was reached rather than comfortably held. However, the
  ceiling-reached moment coincided with the done-bar-answered moment on the
  exact same tool call, so this spike still has not tested the harder case
  of "ceiling reached **before** the done bar resolves" (what do you do with
  an unresolved question and no budget left?) — that specific edge remains
  open even after this spike, and should not be claimed as closed.
- **Did the ambiguity default (step 5) actually trigger?** **Yes, for the
  first time in this experiment**, and it triggered on an emergent
  side-question the original declared done-bar never named in advance — a
  shape of ambiguity the v1 procedure's own text does not explicitly
  anticipate (v1 assumes the ambiguity shows up directly in the declared
  question's resolution, not in a narrower question the investigation
  surfaces along the way).
- **Did the mechanical verdict match independent judgment?** Yes on the main
  question (clean KILL, matches judgment, low tension — similar to spike-0/
  1's clean cases). On the emergent side-finding: yes on my own primary gut,
  but **a plausible, reasonable alternative reading would diverge and
  promote instead** — the first genuine procedure/reasonable-disagreement
  tension surfaced in this experiment, exactly the signal Iteration 2 was
  designed to find.
- **Was the output artifact template (v1) sufficient?** Yes, the same five
  sections held for a third, structurally different spike (one with a
  split main-question/side-finding verdict) with no sixth section needed —
  though this spike's verdict section is noticeably longer/more nested than
  spike-0/1's, suggesting the template's "verdict" section should explicitly
  allow (not require) a main-question/side-finding split when one emerges,
  rather than assuming a single flat verdict — a small, evidence-based
  template refinement for v2.
