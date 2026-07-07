---
name: fixpoint-convergence
description: Use when driving ANY task to a trustworthy, self-audited completion — first assess whether it needs decomposing into PR-sized children (and CREATE them if so), worktree-isolate each independent implementation, run independent fresh-context audits (mandatory loop-until-dry when there are ≥2 children or engine/core is touched; risk-gated with an explicit run-or-skip record otherwise), gate on an executable Integration Acceptance, evaluate mechanically. One skeleton covers both a single atomic Basic task (no children — degenerates to a single leaf) and a multi-child Epic; you do NOT pick the path in advance, the skill's first step decides it.
---

# fixpoint-convergence

λ(task: Task) → FixpointResult

## The one decision that shapes everything: does this task need children?

You do NOT decide "Epic vs Basic" before invoking this skill. `driveTask`'s
first step (`assessAndDecompose`) makes that call, using CLAUDE.md's two-part
decompose test, and — when the answer is yes — actually **creates** the
children (`epicd task create --parent <id>`); it does not assume they
pre-exist. When the answer is no, the same skeleton runs with the task itself
as its single leaf. There is one flow, with a degenerate case, not two
parallel methodologies.

## Spec

```
-- Core types

Task :: {
  children   : [ChildSpec],      -- DEFAULT []; populated by assessAndDecompose
                                  --   iff the decompose test passes. Empty ⇒
                                  --   the task is its own single leaf.
  acceptance : [ShellCmd]        -- ADR-019 Integration Acceptance. For a
                                  --   multi-child task this exercises the
                                  --   ASSEMBLED system; for a single leaf it
                                  --   IS the task's own structured DoD gate.
}

ChildSpec :: {
  title       : String,
  ac          : [MachineCheckableAC],  -- every AC rewritten to be mechanically verifiable
  worktree    : Path
}

MergeOutcome = Merged | NeedsHuman RootCause
RootCause    = RealGate | OperationalMistake   -- see triageNeedsHuman

Finding    :: { severity : Severity, file : Path, line : Int, desc : String }
Severity    = HIGH | OUT_OF_SCOPE | NIT

AuditReport :: { round : Int, findings : [Finding], newBlockers : Int, independent : Bool }
AuditPolicy  = Mandatory              -- loop-until-dry, no skipping
             | RiskGated Bool          -- run ≥1 round OR record an explicit skip rationale

DispatchDepth = Zero | One   -- main session = Zero; any agent it dispatches = One

FixpointResult = Reached | NotReached { gaps : [String] }

-- Depth-1 dispatch constraint (drives every function below — read this first)
--
-- assert: ∀ a ∈ dispatched(mainSession): depth(a) == One ∧ dispatched(a) == ∅
--   -- an agent the main session dispatches may not itself call Agent, on this
--   -- platform, foreground or background. Only mainSession can hold the
--   -- coordinator role (decompose, sequence, run audit rounds, triage
--   -- findings); a dispatched agent cannot decompose-and-redispatch. A single
--   -- Basic task (≤~2000 lines, no internal re-coordination) is the largest
--   -- unit one non-nesting leaf agent can complete solo — which is why the
--   -- no-children case is a single leaf.

-- Workflow

driveTask :: Task → FixpointResult
driveTask(T) = {
  specced:  assessAndDecompose(T),                     -- Stage 1: decide + (maybe) CREATE children
  leaves:   case specced.children of
              []  → [ leafOf(specced) ],               -- degenerate: the task itself is the one leaf
              cs  → cs,
  results:  [ dispatchChild(c) | c <- leaves ],         -- Stage 2, one leaf agent each
  merged:   [ mergeAndVerify(r) | r <- results ],       -- mainSession only, never self-certified
  audits:   runAudits(specced, merged, auditPolicy(specced)),  -- Stage 3, risk-scaled
  final:    evaluate(specced, merged, audits),          -- Stage 4, mechanical
  return:   final
}

-- Stage 1: assess, then decompose ONLY if warranted, front-loaded.
--
-- (a) The decompose test is CLAUDE.md's, applied at plan time. Decompose iff
--     BOTH hold: you can name ≥2 independently reviewable/mergeable
--     deliverables, AND their combined size has real margin (≥~1.8-2×) over
--     the ~2000-line Basic ceiling. A sequence of steps toward one deliverable
--     (schema → engine wiring → CLI → web page for the same feature) is NOT
--     multiple deliverables — it stays a single leaf, structured as
--     Phases/Stages inside that one task's plan. When in doubt, stay single.
-- (b) Any AC that is inherently procedural / one-time-proof (e.g. "was this
--     self-driven") must be rewritten to a MachineCheckableAC or explicitly
--     flagged non-mechanical BEFORE this step returns — otherwise independent
--     audit rounds will disagree on whether it's satisfied.
-- (c) Single-leaf obligation: a task that stays single MUST still declare a
--     structured DoD gate at claim time (the engine's safe default routes
--     needs-human otherwise — see triageNeedsHuman/RealGate). This is the
--     single-task analogue of "each child carries an enforceable DoD".
assessAndDecompose :: Task → Task
assessAndDecompose(T) = {
  assert: fileLineSurveyExists(T),
  assert: ∀ ac ∈ acOf(T): machineCheckable(ac) ∨ explicitlyFlaggedNonMechanical(ac),
  decompose: namesTwoIndependentDeliverables(T) ∧ combinedSizeHasMargin(T, 1.8),
  return: case decompose of
    False → { assert: declaresStructuredDoD(T); T { children = [] } }
    True  → T { children = createChildren(T) }
}

-- createChildren MATERIALIZES the children — it does not assume they exist.
-- Each is created PR-sized (≤~2000 lines) with a structured/enforceable DoD
-- gate, and its ACs rewritten machine-checkable, before any implementation
-- agent is dispatched.
createChildren :: Task → [ChildSpec]
createChildren(T) = [ create(parent = T.id, dodGate = structured, ac = machineCheckable) | deliverable <- T ]

-- Stage 2: one independent implementation agent per leaf. MUST be a leaf —
-- dispatchChild itself never calls Agent again (see depth-1 constraint).
-- Identical for a real child and for the single-leaf degenerate case.
dispatchChild :: ChildSpec → ImplementationResult
dispatchChild(C) = {
  assert: isolated(C.worktree),
  assert: ¬selfCertifies(agentFor(C), status) ∧ ¬selfCertifies(agentFor(C), dod),
  assert: depth(agentFor(C)) == One,               -- leaf; cannot redispatch
  return: runIndependently(C)
}

mergeAndVerify :: ImplementationResult → MergeOutcome
mergeAndVerify(R) = {
  -- mainSession re-verifies with short, mechanical calls; never trusts the
  -- implementing agent's self-report.
  outcome: attemptMerge(R),
  return: case outcome of
    Merged             → Merged
    Conflict f         → NeedsHuman (triageNeedsHuman(f))
}

-- needs-human triage discipline: classify BEFORE reacting — don't conflate a
-- real gate hit with an operational mistake.
triageNeedsHuman :: MergeFailure → RootCause
triageNeedsHuman(f) = case rootCause(f) of
  RealGate            → RealGate            -- valid, expected friction — accept. Includes a task
                                            --   legitimately declaring no dodGates: the engine's safe
                                            --   default then routes needs-human, and that is correct
                                            --   behavior, not a defect (BACK-654).
  OperationalMistake  → OperationalMistake   -- bad filter / tooling bug (e.g. a non-ASCII board-file
                                            --   name defeating the auto-conflict resolver, BACK-662) —
                                            --   fix + file an engine follow-up, don't count against
                                            --   the method; re-run all DoD gates before收口.

-- Stage 3: audits, SCALED to risk. Multi-child integration risk and any
-- engine/core-touching change get the full loop-until-dry; low-risk single
-- leaves get a risk-gated round that may be skipped ONLY with a recorded
-- rationale — never silently omitted.
auditPolicy :: Task → AuditPolicy
auditPolicy(T)
  | len(T.children) >= 2 ∨ touchesEngineCore(T) → Mandatory
  | otherwise                                    → RiskGated(shouldAudit(T))

shouldAudit :: Task → Bool
shouldAudit(T) = touchesEngineCore(T) ∨ touchesSecurity(T)
  -- pure copy / low-risk change ⇒ may skip, but see recordSkip

runAudits :: (Task, [MergeOutcome], AuditPolicy) → [AuditReport]
runAudits(T, merged, Mandatory)        = loopUntilDry(T, merged)
runAudits(T, merged, RiskGated(True))  = loopUntilDry(T, merged)     -- ≥1 real round, dispatched
runAudits(T, merged, RiskGated(False)) = recordSkip(T)               -- MUST append-notes the reason

-- Explicit-decision discipline: the audit decision must be MADE and LANDED —
-- either a real dispatched fresh-context audit, or `task edit <id>
-- --append-notes "audit skipped: <reason>"`. Doing neither and marking Done
-- is forbidden; a silent skip reads as "audited" when it wasn't.
recordSkip :: Task → [AuditReport]
recordSkip(T) = { assert: skipRationaleLanded(T); return [] }

-- loop-until-dry independent audits. Each round is a fresh-context agent with
-- ZERO implementation memory; it re-runs checks itself, performs negative
-- controls, and reports file:line findings or "zero new blockers".
loopUntilDry :: (Task, [MergeOutcome]) → [AuditReport]
loopUntilDry(T, merged) =
  | round == 0 ∨ last(rounds).newBlockers > 0 → loopUntilDry(T, merged) ++ [auditRound(T, merged, round+1)]
  | otherwise                                  → rounds   -- one full round with newBlockers == 0 → stop

auditRound :: (Task, [MergeOutcome], Int) → AuditReport
auditRound(T, merged, n) = {
  assert: verifyAudit(claim) == Trustworthy,   -- see self-verification trap
  findings: triageFindings(runFreshContextAudit(T, merged)),
  return: { round: n, findings, newBlockers: count(findings, severity == HIGH), independent: True }
}

triageFindings :: [Finding] → [Finding]
triageFindings(fs) = [ f | f <- fs, case f.severity of
  HIGH         → fixNow(f)          -- live risk → fix now
  OUT_OF_SCOPE → fileFollowUp(f)    -- don't grow this round's scope
  NIT          → fixOrNote(f) ]

-- Self-verification trap: any "independent audit" claim from a non-main-
-- session agent is untrustworthy until mainSession structurally verifies it
-- was actually a separate Agent call — a failed/corrupted delegation produces
-- a plausible-looking FAKE report, not an error.
verifyAudit :: AuditClaim → Trustworthy | Untrusted
verifyAudit(claim) =
  | dispatchedByMainSession(claim) ∧ freshContext(claim) → Trustworthy
  | otherwise                                            → Untrusted
  -- See reference/case-studies/back665-self-verification-anti-pattern.md for a
  -- worked counter-example of inline self-verification.

-- Trigger heuristic this counter-example motivates: apply BEFORE starting
-- non-trivial src/ work inside an ongoing conversation. This is what forces
-- even a small single-leaf task through worktree+dispatch instead of inline.
shouldDispatch :: WorkItem → Bool
shouldDispatch(w) = estimatedDiffLines(w) > 50 ∧ touches(w, "src/")
  -- if True: MUST go through worktree + Agent dispatch, not be done inline
  -- just because it's conversationally convenient.

-- Stage 4: ADR-019 / fixpoint-meter pattern — anti-"all green, goal unmet".
-- The task's Integration Acceptance must be RUN via an executable gate, not
-- claimed. For a multi-child task this exercises the ASSEMBLED system end-to-
-- end (NOT the union of per-child DoDs). For a single leaf it IS the task's
-- own structured DoD gate, re-run independently by the engine at merge —
-- there is no separate assembled system, so no separate meter is needed.
evaluate :: (Task, [MergeOutcome], [AuditReport]) → FixpointResult
evaluate(T, merged, audits) = {
  assert: executesTarget(T.acceptance),                  -- runs it; not a manual claim, not per-child DoD union
  assert: ∀ m ∈ merged: m == Merged ∨ rootCause(m) == RealGate,
  assert: auditsSettled(audits),                         -- last round newBlockers==0, OR a RiskGated
                                                          --   skip whose rationale was landed
  meterResult: runMechanically(T.acceptance),             -- multi-child: e.g. scripts/fixpoint-back665.ts,
                                                          --   one script, every AC a runnable check,
                                                          --   reports N/M green, names the owning child
                                                          --   per red check. Single leaf: engine complete
                                                          --   re-running the structured DoD gate.
  return: case allGreen(meterResult) of
    True  → Reached
    False → NotReached { gaps: redChecks(meterResult) }
}
```

## Scope boundary

This one skill drives **both** a single atomic Basic task and a multi-child
Epic — you do not pre-select. `assessAndDecompose` decides, using CLAUDE.md's
two-part test, and stays single-leaf unless BOTH parts hold (≥2 independently
mergeable deliverables AND ≥~1.8-2× the ~2000-line ceiling). A sequence of
steps toward one deliverable is a single leaf with internal Phases/Stages, not
an Epic.

What scales with the decision:

| aspect              | single leaf (no children)                                        | ≥2 children (Epic)                              |
|---------------------|------------------------------------------------------------------|-------------------------------------------------|
| Stage 1             | declare structured DoD gate, no decompose                        | create children (`task create --parent`)        |
| Stage 2 dispatch    | one impl agent for the whole task                                | one impl agent per child                        |
| Stage 3 audit       | `RiskGated` — ≥1 round if engine/core/security, else a recorded skip rationale | `Mandatory` loop-until-dry                      |
| Stage 4 acceptance  | the task's own structured DoD gate (engine re-run)               | executable fixpoint-meter over assembled system |

Everything else — depth-1 dispatch, no self-certification, needs-human
root-cause triage, the self-verification trap, `shouldDispatch` > 50 lines —
is identical on both paths.

## Illustrative vs required tooling

The Spec above is transferable to any project. `epicd task create --parent`,
`engine decompose`, `engine complete --worktree`, `engine evaluate`,
`handle-basic-ready.sh` are epicd-specific CLI illustrations of
`createChildren`/`dispatchChild`/`mergeAndVerify`/`evaluate` — substitute your
own project's equivalents. Don't treat the specific command names as required.

## Further reading

- `reference/adr-019-integration-acceptance.md` — the fixpoint-meter pattern
  (and how it degenerates for a single leaf).
- `reference/case-studies/back665-self-verification-anti-pattern.md` — the
  Basic-task-scale negative example behind `verifyAudit`/`shouldDispatch`.
- `templates/run-checklist.md` — copy-per-run checklist, branching on the
  decompose decision.
- `templates/fixpoint-meter-template.ts` — genericized multi-child meter.
- `reference/patterns.md` — background/evidence archive (methodology
  trajectory and per-path sample history).
```
