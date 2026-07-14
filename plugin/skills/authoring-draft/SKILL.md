---
name: authoring-draft
description: "Draft an initial proposal for a task or epic and self-review it against a fixed checklist, revising up to 3 rounds until it converges or is explicitly parked for human input. Invoke with a task id."
---

# authoring-draft

> **Runtime wiring status: NOT yet connected.** This skill executes the
> `authoring/draft` machine-actor phase (see `docs/task-lifecycle-model.md` §3), but
> the production driver that would let the monitor invoke it automatically at
> dispatch time is a separate, not-yet-done piece of work (E7/BACK-608). Until that
> lands, this skill can only be invoked manually, or by an agent a human has
> explicitly directed to run it — never assume it fires on its own.

λ(taskId: TaskId) → DraftOutcome

Every task in this repository's own history starts life as a rough idea and only
becomes actionable once it has passed through a drafting step that turns that idea
into a structured proposal: a stated motivation, a set of goals someone can
actually check, and a plain statement of what is explicitly out of scope. Skipping
straight to implementation plans off an unreviewed idea repeatedly produces scope
creep, unverifiable goals, and rework once a reviewer finally asks "why does this
exist?" — the drafting step exists to catch exactly that class of defect before
it's expensive to fix.

## Spec

```
DraftOutcome = Approved(rounds: Int) | NeedsHuman(rounds: Int, unresolved: [String])

Proposal :: {
  background : Text,        -- WHY not WHAT, 3-8 lines
  goals      : [Goal],      -- each concretely verifiable
  approach   : Text,        -- high-level shape, no file-by-file diff
  nonGoals   : Text,        -- explicit exclusions + trade-offs
  ac         : [Criterion]  -- SEPARATE structured field; persisted via
                             --   `task edit --ac`, never written into Description
}

draft :: TaskId → DraftOutcome
draft(id) =
  requires sideEffects(draft) ⊆ {description, ac}  -- no branches/worktrees/child tasks,
                                                     -- no engine mechanics (complete/adjudicate/
                                                     -- DoD re-run/merge-lock/worktree/claim)
  requires ¬nestedAgentCalls
  seed = run(epicd task view <id> --plain)
  -- substantive Description ⇒ refine in place, don't discard it and start
  -- blank; thin/title-only stub ⇒ draft from scratch.
  loop(1, write(seed, id))

write :: (Seed, TaskId) → Proposal
write(seed, id) = ground(search(codebase)) ∧ compose(
  background : explain(why, ¬what),
  goals      : [g | g ← extract(seed), verifiable(g)],
  approach   : shape(seed) ∧ ¬implementationDiff,
  nonGoals   : exclusions(seed) ∧ risksAndAlternatives,
  ac         : draftAC(seed, kind(id))
)
-- Search the codebase enough to ground background/approach in what actually
-- exists today — a proposal that contradicts the current architecture fails
-- review before it ever reaches a human.

draftAC :: (Seed, Kind) → [Criterion]      -- CLAUDE.md "AC conventions"
draftAC(seed, kind) =
    [convergenceAC(d) | d ← convergenceTargets(seed)]      -- what shrinks + termination condition + exact command that goes green — never a prose claim that it terminates
  ∪ [invariantAC(d)    | d ← invariants(seed), true(d)]     -- negative AC naming its own check, e.g. "MCP server name stays `backlog`; verify: `grep MCP_SERVER_NAME src/cli.ts`"; a false invariant belongs in nonGoals, not ac
  where ¬∃ c. isSafetyRationalization(c)                    -- "this is an extension, not a rewrite" ⇒ reject; state a checkable fact instead
    ∧   ∀ c. claimsExternalConsumer(c) → namesExactReadPath(c)
    ∧   ¬separateFixpointSection                            -- fold into ac; scope prose → nonGoals, never a standalone 不动点/严格不改 section
    ∧   (kind == epic → ac ≠ [] ∧ epicLevelCheckable(ac))    -- precedent: BACK-600, BACK-664 — epic-level done-state is real ACs, not left empty for children to define

loop :: (Int, Proposal) → DraftOutcome
loop(n, p) =
  v = selfReview(p) in
  v.pass                  → finalise(p, Approved(n))
  ¬v.pass ∧ n < 3          → loop(n+1, revise(p, v.failures))
  ¬v.pass ∧ n == 3         → finalise(p, NeedsHuman(n, v.failures))
  -- round 3 failure: stop revising, leave the draft as-is, route to human
  -- review (finalise records which criteria did not converge) rather than
  -- silently shipping an unresolved proposal.

selfReview :: Proposal → Verdict
selfReview(p) = check(
  motivation   : explainsWhy(p.background) ∧ lines(p.background) ∈ [3,8],
  goals        : ∀ g ∈ p.goals. verifiable(g) ∧ ¬vague(g),         -- "improve"/"better"/"robust" w/o a check ⇒ fail
  feasibility  : confirmedBySearch(p.approach),                     -- not assumed
  completeness : stated(p.nonGoals),
  consistency  : ¬∃ s1,s2 ∈ sections(p). contradicts(s1,s2)   -- includes: p does not
               ∧ ¬smugglesUnrelatedScope(p),                    -- smuggle scope beyond
                                                                  -- what background/goals justify
  acDiscipline : ∀ c ∈ p.ac. concreteCheckable(c)                   -- a command, a file path, a grep, an assertion — not prose intent
               ∧ ¬(allGreen(p.ac) ∧ goalStillUnmet)                 -- adversarial self-check: "could every ac go green while the goal is still unmet?" — if yes, fail this round and add the closing ac
)

finalise :: (Proposal, DraftOutcome) → DraftOutcome
finalise(p, outcome) =
  run(epicd task edit <id> <foreach c ∈ p.ac: --ac "<c>">)
  -- replace, not append: `--remove-ac <index>` any stale/placeholder
  -- criteria first if the task already carried some.
  run(epicd task edit <id> --append-notes "authoring/draft self-review: <outcome> after <n> round(s)<: unresolved criteria if NeedsHuman>")
  -- sideEffects ⊆ {description, ac} (see draft's requires) also means:
  -- ¬touch(phase) ∧ ¬touch(status) — that transition belongs to whatever
  -- drives the pipeline forward next (today: a human promoting the task;
  -- later, once E7/BACK-608 lands, the monitor's own dispatch).
  outcome
```
