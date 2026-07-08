---
name: adjudicate
description: "Independent judgmental audit for a task sitting in the execution/adjudicating phase: a fresh-context leaf agent that judges the AC/diff (never the implementer's own self-report) and either confirms done, routes to needs-human, or retreats one step to the task's entry_phase with a three-way (keep/missing/wrong) gap contract. Invoke with a task id."
---

# adjudicate

Executes the `execution/adjudicating` machine-actor phase (see
`docs/task-lifecycle-model.md` §3, BACK-682) for one task whose Definition of Done has
already gone green (ENG-8's mechanical `adjudicate()` in `src/engine/adjudicate.ts`
routed it here — that function's own logic is untouched by this skill). This is the
independent, judgment-based confirmation step that sits between "DoD passed" and
"terminal phase": a task's completion is never accepted on the implementer's own
say-so (AC#14) — it is accepted only after this separate check.

This skill's audit method is the same judgment-based review already crystallized as
Stage 3/4 of `plugin/skills/fixpoint-convergence/SKILL.md` (loop-until-dry independent
audits + the ADR-019 fixpoint-meter acceptance gate) — extracted here into a
standalone, per-task, per-phase skill so it can run without going through that
skill's full multi-child orchestration.

## Preconditions

- You have a task id (e.g. `BACK-123`) whose board phase is `adjudicating`.
- You have NOT implemented this task yourself in this context — if you have, you are
  the wrong agent for this step (see "Self-verification trap" below); a fresh-context
  dispatch is required for the full-depth path.
- The task's worktree branch has already been merged into the trunk by `engine
  complete` (that is what put the task into `adjudicating`) — read the diff from the
  merge commit(s) on the trunk, not from a still-open worktree.

## Method

### Step 1 — Determine audit depth (risk-scaled, `auditDepthFor`)

Depth is **"full"** iff any of the following hold, else **"light"**
(`src/engine/retreat.ts`'s `auditDepthFor`, reusing fixpoint-convergence's
`RiskGated` concept):

- the task's Description contains an `## Integration Acceptance` section (checked via
  `extractIntegrationAcceptanceCommands()`, `src/harness/evaluator.ts`);
- the merged diff touches `src/engine/**` or `src/security/**`;
- the task's labels include `area:engine` or `area:security`.

### Step 2a — Light depth (pure mechanical leaf, DoD-green is sufficient)

Confirm only:

- every structured DoD gate re-run by `engine complete` passed (already true — that is
  why the task reached `adjudicating`);
- every Acceptance Criterion checkbox is checked;
- the merged diff does not touch any file outside what the task's plan/AC describe.

If all three hold, emit verdict `done` directly — no further diff-level judgment call
is required for a low-risk leaf.

### Step 2b — Full depth (engine/security-touching or IA-bearing leaf)

Run one or more rounds of a genuinely independent audit, same discipline as
fixpoint-convergence's `loopUntilDry`/`auditRound`:

1. Read the task's Acceptance Criteria and Description — **not** the implementer's
   Implementation Notes narrative, which is a self-report and not evidence.
2. Read the actual merged diff (`git diff` against the merge-base) and, if present,
   run the task's `## Integration Acceptance` shell commands for real.
3. For each AC, decide independently whether the diff satisfies it. Do not accept "I
   did X" prose as proof that X is true in the diff.
4. Self-verification trap: an audit is only trustworthy if it was dispatched as a
   genuinely separate, fresh-context agent call by the calling main session — an
   audit written inline by the same context that did the implementation is untrusted
   by construction, regardless of how it reads (see
   `plugin/skills/fixpoint-convergence/SKILL.md`'s `verifyAudit`/self-verification
   trap section for the full rationale).

### Step 3 — Emit the verdict

Produce (mentally or as a structured note) an `AdjudicationVerdict`:

```ts
interface AdjudicationVerdict {
	verdict: "done" | "retreat" | "needs-human";
	auditDepth: "light" | "full";
	gapFingerprint?: string; // required when verdict != "done"
	classification?: "spec" | "decomposition" | "goal"; // required when verdict == "retreat"
	contract?: RetreatContract; // required when verdict == "retreat"
	rationale: string;
}
```

- **`done`** — every AC is satisfied by the actual diff; DoD is green (already
  established); no unresolved gap.
- **`needs-human`** — a gap exists but does not cleanly resolve to a single-step
  retreat (e.g. a second occurrence of an already-seen `gapFingerprint` — dedup
  guard, AC#2 — or a gap this skill cannot classify confidently). A human takes it
  from here; do not guess.
- **`retreat`** — a *classifiable* gap exists at the **spec**, **decomposition**, or
  **goal** layer (never **implementation** — implementation-layer gaps belong in
  `primitive-executor`'s own inner loop, never here; see AC#4/AC#6 and
  `plugin/skills/primitive-executor/SKILL.md`'s root-cause classification section).
  Build the three-way `RetreatContract` (`keep`/`missing`/`wrong`, `wrong` entries
  must each carry a complete `obsoleteBlock`) and a `gapFingerprint` per
  `src/engine/retreat.ts`'s `gapFingerprint(classification, normalizedFailingCheck)`.

### Step 4 — Apply the verdict

This skill is a **leaf**: it judges and reports, it does not itself flip the task's
own phase past what a plain phase write can safely do, and it never re-implements or
patches the task's code.

- **`done` / `needs-human`** — apply the terminal phase directly via the engine CLI's
  generic engine-managed-field edit: `epicd task edit <taskId> --phase done` or
  `epicd task edit <taskId> --phase needs-human`. This is the same `--phase` escape
  hatch every other phase transition in this project goes through — no new CLI verb
  is introduced for this simple case.
- **`retreat`** — do **not** apply a retreat via the plain `--phase` edit: a retreat
  is guarded (single-step to `task.entry_phase` only, gap-fingerprint dedup, three-way
  contract validation — `assertSingleStepRetreat`/`isDuplicateGap`/
  `validateRetreatContract`/`recordRetreat` in `src/engine/retreat.ts`) and a raw
  phase write would silently bypass every one of those guards. Hand the produced
  `AdjudicationVerdict` (verdict `retreat` + its `gapFingerprint`/`classification`/
  `contract`) to whatever process embeds `recordRetreat` (the `Driver`'s injectable
  `AdjudicateHandler`, `src/engine/driver.ts`) — do not write `retreat_log`/
  `gap_history` by hand.

## Constraints

- Never accept an implementation agent's own "done" self-report as sufficient
  evidence — that is precisely the failure mode this phase exists to close (AC#14).
- Never perform a `retreat` by editing `phase` directly — always route through the
  guarded `src/engine/retreat.ts` path (see Step 4).
- Do not modify engine mechanics (complete/adjudicate/DoD re-run/merge-lock/worktree/
  claim/pipeline-as-data) while executing this phase.
- Do not spawn further nested agents from inside this skill's own execution (the
  fresh-context dispatch this skill *is* must come from the calling main session, not
  from a call this skill makes itself).
- No implementation-layer gap is ever routed to `retreat` — those stay in
  `primitive-executor`'s inner loop (see AC#4/AC#6). Only spec/decomposition/goal
  layer gaps retreat, and only ever one step (to `task.entry_phase`).
