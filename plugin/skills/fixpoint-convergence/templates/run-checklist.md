# Fixpoint run checklist (copy per task)

Task: <ID/name>

## 1. Assess + front-load (before creating any child or dispatching anything)
- [ ] file:line survey of the affected area produced
- [ ] every AC reviewed: is it mechanically checkable? If not, rewritten or
      explicitly flagged as "left unchecked with rationale" now, not at audit time
- [ ] decompose decision made with CLAUDE.md's two-part test:
      - can you name ≥2 independently reviewable/mergeable deliverables? AND
      - is their combined size ≥~1.8-2× the ~2000-line Basic ceiling?
      - both yes → **multi-child track (§2A)**; otherwise → **single-leaf track (§2B)**
      - when in doubt, stay single-leaf

## 2A. Multi-child track — decompose
- [ ] children CREATED (`task create --parent <id>`), each PR-sized (≤~2000
      lines) with a structured/enforceable DoD gate (not a prose checklist)
- [ ] each child's ACs rewritten machine-checkable
- [ ] dependency order between children identified

## 2B. Single-leaf track — no decompose
- [ ] task claimed with a structured DoD gate declared (`--dod-gate`); without
      it the engine's safe default routes needs-human and you cannot exercise
      the trusted auto-merge path
- [ ] the task itself is the single leaf — proceed to §3 with one leaf

## 3. Per leaf (repeat for each child; once for a single leaf)
- [ ] claimed, worktree created
- [ ] ONE independent implementation agent dispatched (leaf-level, cannot
      itself dispatch further; must not self-certify status/DoD)
- [ ] main session re-verifies + merges itself (short mechanical command)
- [ ] if routed to needs-human: root-cause classified BEFORE reacting —
      real DoD-gate hit / task legitimately declared no dodGates (expected
      friction, keep) vs operational mistake (fix + file an engine/tooling
      follow-up, re-run all DoD gates before 收口, don't count as a
      methodology signal)

## 4. Independent audit — SCALED to risk
Policy: `Mandatory` if ≥2 children OR touches engine/core; else `RiskGated`.
- [ ] **Mandatory / RiskGated(run)** — loop until dry:
      - [ ] round 1: main session directly dispatches a fresh-context audit
            agent with zero implementation memory — confirm this was an actual
            separate Agent call, not a sub-agent's internal self-review
      - [ ] round 1 findings triaged: HIGH/live-risk fixed now; out-of-scope
            filed as follow-up (not folded into this round); nitpick fixed/noted
      - [ ] round 2+: another independently-dispatched audit agent, told nothing
            about round 1's specifics, re-runs checks from scratch
      - [ ] repeat until one full round reports zero new blockers
- [ ] **RiskGated(skip)** — low-risk single leaf, no engine/core/security touch:
      - [ ] skip decision LANDED via `task edit <id> --append-notes
            "audit skipped: <reason>"` — never silently omitted

## 5. Integration Acceptance (Stage 4)
- [ ] **multi-child**: an executable fixpoint-meter exists covering every AC,
      exercising the ASSEMBLED system; meter run and green
      (see reference/adr-019-integration-acceptance.md)
- [ ] **single leaf**: the task's own structured DoD gate re-run by the engine
      at merge (no separate meter — the DoD gate IS the acceptance)
- [ ] task evaluated via a real evaluate/complete mechanism, not hand-edited status

## 6. Before declaring convergence
- [ ] every "independent" claim above structurally verified (main session
      actually made the dispatch calls, not a sub-agent's self-report)
- [ ] scribe/record: what was learned, updated in the moment if possible —
      not only backfilled after the fact
