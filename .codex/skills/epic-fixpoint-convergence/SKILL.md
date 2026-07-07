---
name: epic-fixpoint-convergence
description: Use when driving a large-granularity Epic (one that decomposes into multiple PR-sized children) to a trustworthy, self-audited completion — decompose, worktree-isolate each child's independent implementation, run independent fresh-context audits until dry, gate on an executable epic-level Integration Acceptance, evaluate mechanically. Not for a single atomic Basic task (use lightweight-fixpoint for that).
---

# epic-fixpoint-convergence

λ(epic: EpicTask) → FixpointResult

**Status: first extraction, not a finished recipe.** Source experiment
(`docs/research/baime-fixpoint-convergence/`, 5 converged epics: BACK-628,
602, 603, 605, 604) has V_instance avg ~0.91 but its own meta-convergence
score is V_meta 0.70, below its 0.80 threshold, non-monotonic across rounds
(0.47→0.59→0.66→0.65→0.70). This is a working-but-maturing practice, not a
validated methodology. Every type/assertion below is falsifiable, not
doctrine — expect this skill to change as more epics run through it.

## Spec

```
-- Core types

EpicTask :: {
  children   : [ChildSpec],      -- populated by decomposeFront, NOT known upfront
  acceptance : [ShellCmd]        -- ADR-019: epic-level Integration Acceptance
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

DispatchDepth = Zero | One   -- main session = Zero; any agent it dispatches = One

FixpointResult = Reached | NotReached { gaps : [String] }

-- Depth-1 dispatch constraint (drives every function below — read this first)
--
-- assert: ∀ a ∈ dispatched(mainSession): depth(a) == One ∧ dispatched(a) == ∅
--   -- an agent the main session dispatches may not itself call Agent, on this
--   -- platform, foreground or background. Verified empirically (iteration-2 /
--   -- BACK-603): a 3-layer "main session → epic-driver agent → child/audit
--   -- sub-agents" design failed silently — epic-driver could not find an
--   -- Agent-dispatch tool and, instead of erroring, self-reviewed everything
--   -- in its own context, reporting a fake "two independent audit rounds,
--   -- zero blockers". Caught only because the user directly observed no new
--   -- agents were being created.
--
-- Consequence: dispatch granularity = existing Basic-task discipline, NOT a
-- separately invented "agent division of labor" dimension. An Epic inherently
-- needs a coordinator (decompose, sequence, run multiple audit rounds, triage
-- findings); only mainSession can honestly hold that role, since any agent it
-- dispatches cannot itself decompose-and-redispatch. "One agent for the whole
-- Epic" therefore cannot honestly self-execute. A Basic task (≤~2000 lines,
-- no internal re-coordination needed) is exactly the largest unit one
-- non-nesting leaf agent can honestly complete solo.

-- Workflow

driveEpic :: EpicTask → FixpointResult
driveEpic(E) = {
  specced:  decomposeFront(E),                        -- Stage 1
  results:  [ dispatchChild(c) | c <- specced.children ],  -- Stage 2, one leaf agent each
  merged:   [ mergeAndVerify(r) | r <- results ],      -- mainSession only, never self-certified
  audits:   loopUntilDry(E, merged),                   -- Stage 3
  final:    evaluate(E, merged, audits),               -- Stage 4, mechanical
  return:   final
}

-- Stage 1: decompose, front-loaded. An AC that is inherently procedural /
-- one-time-proof (e.g. "was this self-driven") must be rewritten to a
-- MachineCheckableAC or explicitly flagged non-mechanical BEFORE decompose —
-- otherwise independent audit rounds will disagree on whether it's satisfied.
decomposeFront :: EpicTask → EpicTask
decomposeFront(E) = {
  assert: fileLineSurveyExists(E),
  assert: ∀ ac ∈ flatten(E.children.ac): machineCheckable(ac) ∨ explicitlyFlaggedNonMechanical(ac),
  return: E { children = decompose(E) }
}

-- Stage 2: one independent implementation agent per child. MUST be a leaf —
-- dispatchChild itself never calls Agent again (see depth-1 constraint).
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

-- needs-human triage discipline: classify BEFORE reacting. Conflating a real
-- gate hit with an operational mistake corrupts effectiveness/reliability
-- scoring for the methodology itself.
triageNeedsHuman :: MergeFailure → RootCause
triageNeedsHuman(f) = case rootCause(f) of
  RealGate            → RealGate            -- valid, expected friction — accept
  OperationalMistake  → OperationalMistake   -- bad filter / tooling bug — fix, don't count against method

-- Stage 3: loop-until-dry independent audits. Each round is a fresh-context
-- agent with ZERO implementation memory; it re-runs checks itself, performs
-- negative controls, and reports file:line findings or "zero new blockers".
loopUntilDry :: (EpicTask, [MergeOutcome]) → [AuditReport]
loopUntilDry(E, merged) =
  | round == 0 ∨ last(rounds).newBlockers > 0 → loopUntilDry(E, merged) ++ [auditRound(E, merged, round+1)]
  | otherwise                                  → rounds   -- one full round with newBlockers == 0 → stop

auditRound :: (EpicTask, [MergeOutcome], Int) → AuditReport
auditRound(E, merged, n) = {
  assert: verifyAudit(claim) == Trustworthy,   -- see self-verification trap
  findings: triageFindings(runFreshContextAudit(E, merged)),
  return: { round: n, findings, newBlockers: count(findings, severity == HIGH), independent: True }
}

triageFindings :: [Finding] → [Finding]
triageFindings(fs) = [ f | f <- fs, case f.severity of
  HIGH         → fixNow(f)          -- live risk → fix now
  OUT_OF_SCOPE → fileFollowUp(f)    -- don't grow this round's scope
  NIT          → fixOrNote(f) ]

-- Self-verification trap: any "independent audit" claim from a non-main-
-- session agent is untrustworthy until mainSession structurally verifies it
-- was actually a separate Agent call — a failed/corrupted delegation (like
-- epic-driver above) produces a plausible-looking FAKE report, not an error.
verifyAudit :: AuditClaim → Trustworthy | Untrusted
verifyAudit(claim) =
  | dispatchedByMainSession(claim) ∧ freshContext(claim) → Trustworthy
  | otherwise                                            → Untrusted
  -- Live counter-example (BACK-661/BACK-665 AC5, this same repo, immediately
  -- preceding this extraction): a Basic-task-sized change was done entirely
  -- inline by the main session — no worktree, no dispatched implementation
  -- agent, no dispatched fresh-context audit. "Verification" was the same
  -- context that wrote the code, using a browser tool and reading its own
  -- files back — Untrusted by this definition, despite feeling thorough.
  -- See reference/case-studies/back665-self-verification-anti-pattern.md.

-- Trigger heuristic this counter-example motivates: apply BEFORE starting
-- non-trivial src/ work inside an ongoing conversation.
shouldDispatch :: WorkItem → Bool
shouldDispatch(w) = estimatedDiffLines(w) > 50 ∧ touches(w, "src/")
  -- if True: MUST go through worktree + Agent dispatch, not be done inline
  -- just because it's conversationally convenient.

-- Stage 4: ADR-019 / fixpoint-meter pattern — anti-"all children green, goal
-- unmet". The epic's own Integration Acceptance must exercise the ASSEMBLED
-- system end-to-end via an executable gate — NOT the union of per-child DoDs,
-- NOT a manual claim.
evaluate :: (EpicTask, [MergeOutcome], [AuditReport]) → FixpointResult
evaluate(E, merged, audits) = {
  assert: executesAssembledSystem(E.acceptance),         -- not per-child DoD union
  assert: ∀ m ∈ merged: m == Merged ∨ rootCause(m) == RealGate,
  assert: last(audits).newBlockers == 0,
  meterResult: runMechanically(E.acceptance),             -- e.g. scripts/fixpoint-back665.ts:
                                                          -- one script, every AC a runnable
                                                          -- check, reports N/M green, names
                                                          -- the owning child per red check
  return: case allGreen(meterResult) of
    True  → Reached
    False → NotReached { gaps: redChecks(meterResult) }
}
```

## Scope boundary

Use this skill when the target has **≥2 children that need coordinating**
(decompose, sequencing, multiple audit rounds) — an Epic per CLAUDE.md's task
granularity rules. If the target is a single atomic Basic task (≈one
reviewable PR, no children), use `lightweight-fixpoint` instead — this
skill's decompose/evaluate/two-round-audit scaffolding is overhead scope
discipline says to skip for atomic work.

## Illustrative vs required tooling

The Spec above is transferable to any project. `engine decompose`,
`engine complete --worktree`, `engine evaluate`, `handle-basic-ready.sh` are
epicd-specific CLI illustrations of `decomposeFront`/`dispatchChild`/
`evaluate` — substitute your own project's equivalents. Don't treat the
specific command names as required.

## Further reading

- `reference/patterns.md` — dual-layer value function (V_instance/V_meta),
  full 5-iteration trajectory, per-iteration findings in more depth.
- `reference/adr-019-integration-acceptance.md` — the fixpoint-meter pattern.
- `reference/case-studies/back665-self-verification-anti-pattern.md` — the
  negative example behind `verifyAudit`/`shouldDispatch`.
- Full source experiment (most detail, Chinese):
  `docs/research/baime-fixpoint-convergence/README.md`,
  `context-isolation-plan.md`, `iterations/iteration-{0..4}.md`.
- Sibling skill for atomic tasks: `lightweight-fixpoint` (not part of this
  extraction) — see `docs/research/lightweight-fixpoint/README.md`.
