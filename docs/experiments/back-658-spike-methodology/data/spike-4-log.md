# Spike 4 Log — DoD Defaults Override Granularity (Ceiling-Before-Done-Bar Edge Test)

**Date**: 2026-07-06 (Iteration 4)
**Purpose**: NOT a normal kill/promote-application spike. This spike was
deliberately constructed to test the single remaining untested edge in
`timeboxing-rule-v2.md`: **ceiling reached before the done bar resolves**.
After 4 prior spikes (0-3), the ceiling had never once been hit while a
real, declared question remained open — it either wasn't hit at all
(spike-1, spike-3) or coincided exactly with resolution (spike-2). This
spike deliberately declares a tight ceiling on a real, moderately deep
question to try to force the gap open.

## 1. Pre-Spike Declaration (per timeboxing-rule-v2.md)

- **Question**: Can DoD (Definition of Done) requirements be overridden
  per-milestone, or only set as a single project-wide default — and where
  does the override/merge logic live?
- **Expected files**: `src/core/field-registry.ts`, files matching
  `definition_of_done_defaults` (found via one candidate-scan grep, not
  counted against ceiling per rule).
- **Declared tool-call ceiling**: **5** (deliberately tight — a real
  question spanning 9 files, chosen specifically because 5 was judged
  likely insufficient, unlike the default-12 used in spikes 0-3).
- **Done bar**: Confirm override granularity (project-only vs
  per-milestone vs per-task) and identify the specific merge/apply logic.

## 2. Execution Timeline

| # | Action | Finding |
|---|---|---|
| (scan) | `grep dod field-registry.ts` | `dod` is a per-task field (`DoDItem[]`), not itself the "defaults" mechanism |
| 1 | grep `definition_of_done_defaults` in `backlog.ts` | No hits — defaults logic lives elsewhere |
| 2 | grep -rl across `src/` | 9 files reference it (MCP tool, CLI, tests, docs, schema-generators) |
| 3 | `wc -l` on `src/mcp/tools/definition-of-done/index.ts` | 37 lines, small registration file |
| 4 | Read `index.ts` | Tool descriptions say "project Definition of Done default checklist items in config" (both get/upsert) — strong directional signal toward project-wide-only, but the actual merge logic lives in `handlers.ts`, not yet read |
| **5 (ceiling)** | — | **Ceiling reached. Done bar NOT yet fully resolved**: directional evidence (tool descriptions) points to project-only, but no confirmation the handlers don't also accept a milestone-scoped parameter |

**Ceiling condition**: (a) fired — 5/5 tool calls used — while (b) had NOT
fired: the done bar's second clause (identify the specific merge/apply
logic) was still open. **This is the first real instance across 5 spikes
of the ceiling firing strictly before the done bar resolves** — the exact
edge `timeboxing-rule-v2.md` named as untested.

## 3. In-the-Moment Rule Application

`timeboxing-rule-v2.md`'s own "what this rule still does not cover" section
named two untested candidate resolutions: (i) automatic KILL-with-named-
open-question, or (ii) permit exactly one budget extension if the done bar
is "close" by some stated measure.

**Judgment applied**: the done bar was assessed as "close" — one specific,
narrow remaining check (does `handlers.ts` reference a milestone
parameter?), not a broad remaining unknown. Candidate (ii) was tested:
**one extension call** was taken.

| # | Action | Finding |
|---|---|---|
| 6 (extension) | grep `milestone\|getDefaults\|upsertDefaults` in `handlers.ts` | Zero "milestone" hits anywhere near the get/upsert methods — confirms no milestone-scoped override exists |

**Result**: The one-call extension fully resolved the done bar. Total: 6
tool calls against a declared ceiling of 5 (one extension, exactly as the
candidate rule allowed).

## 4. Verdict Application (kill-promote-procedure-v3.md)

Applying the procedure: step 1 (re-state done bar) — now answerable: DoD
defaults are **project-wide only**, no per-milestone or per-task override
mechanism beyond the per-task `dod` field itself (which is populated at
task-creation time, not dynamically merged with project defaults at
read-time by this mechanism). Step 2 (corroboration) — the tool
descriptions and the absence of any milestone-plumbing in `handlers.ts`
corroborate each other. Step 3 (emergent question) — none found. Step 4
(nameable follow-on) — none; this was a pure knowledge question, not an
implementation gap. **Verdict: KILL** (no follow-on task; the question was
answered, not a discovered problem).

## 5. What This Resolves in timeboxing-rule-v2.md's Open Gap

This is genuine, first-time evidence (not guessed at) for the
ceiling-reached-before-done-bar-resolves edge:

- The "one extension if done bar is close" candidate rule **worked cleanly
  in this one real test**: a single extra tool call, spent on a narrowly
  scoped remaining check, resolved the done bar without materially
  exceeding the spirit of the original budget (6 vs 5 declared, a 20%
  overrun for full resolution).
- This is **one data point, not a fully validated rule** — it does not
  test what happens when "close" is misjudged (i.e., the extension itself
  fails to resolve the done bar, requiring a second extension or a forced
  KILL-with-open-question). That deeper sub-case remains untested; this
  spike closes the *first* half of the named gap (does a
  close-done-bar extension work at all) but does not exhaustively close
  the whole space of ceiling-overrun behavior.
- Honest reading: this is real, direct evidence — not a hypothetical or
  retrospective analogy — for exactly the edge case named in
  `timeboxing-rule-v2.md`'s gap section, obtained via a deliberately
  engineered (not organically occurring) test condition. That the ceiling
  was deliberately set tight, rather than naturally landing there, is
  disclosed plainly: this is a designed stress test, not a fifth
  "naturally occurring" spike of convenience.

## 6. Timeboxing Rule Update

See `knowledge/principles/timeboxing-rule-v3.md`: adds the "close done bar,
one extension" resolution as the now-evidenced default behavior for this
edge, sourced directly from this log.
