# Epic fixpoint run checklist (copy per epic)

Epic: <ID/name>

## 1. Decompose front-load (before running any decompose command)
- [ ] file:line survey of the affected area produced
- [ ] every AC reviewed: is it mechanically checkable? If not, rewritten or
      explicitly flagged as "left unchecked with rationale" now, not at audit time
- [ ] draft child split (PR-sized, ≤~2000 lines each) written before decompose

## 2. Decompose
- [ ] children created, each with a structured/enforceable DoD (not just a
      prose checklist a human has to read)
- [ ] dependency order between children identified

## 3. Per child (repeat)
- [ ] claimed, worktree created
- [ ] ONE independent implementation agent dispatched (leaf-level, cannot
      itself dispatch further; must not self-certify status/DoD)
- [ ] main session re-verifies + merges itself (short mechanical command)
- [ ] if routed to needs-human: root-cause classified BEFORE reacting —
      real DoD-gate hit (expected friction, keep) vs operational mistake
      (fix + file an engine/tooling follow-up, don't count as a methodology
      signal)

## 4. Epic-level Integration Acceptance
- [ ] an executable fixpoint-meter (or equivalent) exists, covering every AC
- [ ] meter run and green (see reference/adr-019-integration-acceptance.md)
- [ ] epic evaluated via a real evaluate mechanism, not hand-edited status

## 5. Independent audit rounds (loop until dry)
- [ ] round 1: main session directly dispatches a fresh-context audit agent
      with zero implementation memory — confirm this was an actual separate
      Agent call, not a sub-agent's internal self-review claiming to be one
- [ ] round 1 findings triaged: HIGH/live-risk fixed now; out-of-scope filed
      as follow-up (not folded into this round); nitpick fixed or noted
- [ ] round 2+: another independently-dispatched audit agent, told nothing
      about round 1's specific findings, re-runs checks from scratch
- [ ] repeat until one full round reports zero new blockers

## 6. Before declaring convergence
- [ ] every "independent" claim above structurally verified (main session
      actually made the dispatch calls, not a sub-agent's self-report)
- [ ] scribe/record: what was learned, updated in the moment if possible —
      not only backfilled after the fact
