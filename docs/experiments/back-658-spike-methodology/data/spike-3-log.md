# Spike 3 Log (Iteration 3) — Legacy Config-Milestones Migration: Cleanup-Worthy or Load-Bearing?

**Purpose of this spike**: Iteration 3's explicit mandate (unlike Iterations
0-2, which each just needed *a* genuine unknown) was to deliberately hunt for
a case where the mechanical 5-step kill/promote procedure and independent
gut judgment might actually **diverge** — not merely disclose a tension with
an alternative reader (spike-2's case), but genuinely disagree. This spike
was selected specifically because, at selection time, my gut leaned toward
"this looks like cleanup-worthy legacy cruft" while I suspected the
mechanical procedure (especially its corroboration step) might land
somewhere more conservative — a plausible candidate for real divergence.

## Candidate scan (excluded from ceiling, per timeboxing-rule-v2.md)

Scanned `src/engine`, `src/core` for TODO/FIXME/deprecated/legacy markers;
also considered (and rejected) leftover `role`-field references after
BACK-664.2's persisted-field deletion (grep found zero remaining references
— already fully clean, no genuine unknown there). Settled on
`src/core/backlog.ts`'s legacy config-migration methods
(`parseLegacyInlineArray`, `parseLegacyYamlValue`, `stripYamlComment`,
`extractLegacyConfigMilestones`, `migrateLegacyConfigMilestonesToFiles`) —
~130 lines of nontrivial custom YAML-fragment parsing that exists solely to
migrate a pre-BACK-384 (Feb 2026) inline-array `milestones: [...]` config
format into individual milestone files. Genuinely uncertain to me at
selection time whether this is still load-bearing or is now dead weight
worth a removal task.

## 1. Pre-spike declaration

- **Scope** (declared file/doc list): `src/core/backlog.ts` (migration
  methods), `src/core/config-migration.ts`, `src/cli.ts` (invocation site),
  `git log`/`git show` for the migration's origin commit and date, sibling
  migration precedent (`src/core/prefix-migration.ts`), test coverage
  (`src/test/*config*`, `*migrat*`).
- **Tool-call ceiling**: 12 (default, per `timeboxing-rule-v2.md`).
- **Done bar**: Is the legacy inline-array `milestones:` config migration
  code now dead weight worth a cleanup/removal task (PROMOTE), or is it
  still legitimately load-bearing / intentionally retained (KILL)?

## 2. Real timeline (declared-ceiling calls only; candidate scan excluded)

1. `grep ensureConfigMigrated / needsMigration / migrateConfig` call sites —
   found single invocation site (`src/cli.ts:534`), gated to skip `init`/
   `--help`/`--version`/no-args.
2. Read `src/cli.ts` migration-invocation block (~lines 500-545) + full
   `src/core/config-migration.ts` — confirmed `needsMigration`/`migrateConfig`
   are a *separate* schema-defaults migration (unrelated to the inline-array
   milestones parsing), and that migration errors are silently swallowed by
   design (explicit comment: "project might not be initialized yet").
3. `git log --oneline --all -- src/core/backlog.ts | grep -i milestone` —
   found the format-change commit.
4. `git log -S"extractLegacyConfigMilestones"` — confirmed
   `9108486` (`BACK-384`) is the sole commit that introduced this migration
   code.
5. `git show 9108486 --stat` + `git log -1 --format=%ci 9108486` — dated
   2026-02-17: milestone-files-as-source-of-truth change, ~5 months before
   this iteration (2026-07-06).
6. `grep package.json version` + searched for `CHANGELOG.md` (none found) +
   located sibling migration precedent `src/core/prefix-migration.ts`
   (`needsDraftPrefixMigration`/`migrateDraftPrefixes`).
7. `git log --diff-filter=A -- src/core/prefix-migration.ts` +
   `git log -1 --format=%ci` — found this sibling one-time migration shim
   originates from `072421c` (`TASK-345`), dated 2026-01-19 — ~6 months old,
   still present, unremoved. Real project precedent: migration shims are
   retained past the point where most users would plausibly still trigger
   them, not proactively deprecated/removed.
8. `grep -rln` for direct test references to
   `LegacyConfigMilestones`/`LegacyInlineArray`/`LegacyYamlValue` — none in
   an obviously-named migration test file at first glance.
9. Broadened grep across `src/test` for `milestones:` literal usage —
   surfaced `src/test/config-hang-repro.test.ts` as a strong hit (multiple
   inline-array fixtures, including quoted/comma-containing/multi-line
   forms).
10. Read `src/test/config-hang-repro.test.ts` in full (~lines 1-110+) —
    confirmed this is a **dedicated regression suite** for exactly this
    migration path, named for a real historical bug ("hang repro" — an
    infinite-loop regression), with tests covering: standard load, `.backlog`
    vs `backlog` dir precedence, milestone-array migration to files (with
    config-key removal verified), and quoted/comma-containing milestone name
    edge cases.

**Tool calls used**: 10 of 12 declared ceiling (comfortable margin, not
exercised under real pressure this spike — the ceiling-before-done-bar-
resolves edge remains untested after 4 spikes; see Section 5).

**Scope drift**: None. Investigated exactly the declared file/doc list;
no expansion beyond it was needed.

## 3. Findings

1. The legacy inline-array `milestones:` migration
   (`extractLegacyConfigMilestones` → `migrateLegacyConfigMilestonesToFiles`)
   is entirely separate from, and runs alongside, the unrelated
   schema-defaults migration (`needsMigration`/`migrateConfig`) —
   both are driven from the single `ensureConfigMigrated()` entry point,
   invoked once per CLI command (except `init`/`--help`/`--version`/bare
   invocation) (`src/cli.ts:513-536`).
2. This migration path was introduced in a single commit, `9108486`
   (`BACK-384`, 2026-02-17), as part of moving milestones to
   files-as-source-of-truth; it is the *only* commit that has ever touched
   `extractLegacyConfigMilestones`/`parseLegacyInlineArray`.
3. A structurally identical sibling migration shim
   (`needsDraftPrefixMigration`/`migrateDraftPrefixes`, from `072421c`/
   `TASK-345`, 2026-01-19) is ~6 months old and still present, unremoved —
   real, current precedent that this project does not proactively remove
   one-time migration shims on any fixed timetable.
4. `src/test/config-hang-repro.test.ts` is a dedicated regression suite,
   explicitly named after a real past bug (an infinite-loop "hang"), that
   directly exercises the legacy inline-array migration path with several
   edge-case fixtures (plain array, quoted/comma-containing names,
   multi-line YAML array, `.backlog`-vs-`backlog` dir precedence) and
   asserts the config key is stripped post-migration.
5. `ensureConfigMigrated()`'s caller (`src/cli.ts`) wraps the entire
   migration attempt in a try/catch that **silently ignores** any error,
   by explicit design comment — this is a real design choice (fail open
   rather than block every CLI invocation on migration failure) but is not
   a separate emergent question: it applies uniformly to both migrations
   (schema-defaults and legacy-milestones) and was not something the
   investigation surfaced as newly uncertain — no emergent question split
   applies this spike (contrast with spike-2).

## 4. Kill/Promote verdict — applying kill-promote-procedure-v2.md exactly as written

**Step 1 — restate done bar**: Is the legacy inline-array milestones
migration code dead weight worth a removal/cleanup task, or load-bearing /
intentionally retained?

**Step 2 — external corroboration**: Two independent corroborating signals,
both pointing the same direction (KILL):
(a) a dedicated, actively-maintained regression suite tied to a real past
production bug in exactly this code path (Finding 4);
(b) a real, current sibling precedent in this same codebase of a
structurally identical one-time migration shim being retained ~6 months
past its introduction with no removal in sight (Finding 3).
No corroborating signal pointed toward removal being warranted.

**Step 3 — resolved vs. relocated**: **Resolved.** The investigation
directly answers the declared done bar: this is intentionally-retained,
regression-tested migration code consistent with this project's own
established practice for this exact class of one-time migration shim — not
orphaned scaffolding. No emergent, narrower question surfaced (Finding 5
was checked and ruled out as a separate open question) — no main/emergent
split needed this spike, unlike spike-2.

**Step 4 — concrete follow-on shape test**: No nameable, Basic-task-sized
follow-on is justified by the resolved answer. "Remove the migration code"
is directly contraindicated by Finding 4 (an explicit regression test guards
a real bug in this exact path); "add a formal deprecation-window policy
doc" was considered and rejected as speculative — no evidence from this or
any prior spike suggests confusion or friction around this project's actual
(implicit) practice of indefinite retention.

**Step 5 — ambiguity default**: Not reached — step 3 resolved cleanly, no
ambiguity.

**VERDICT: KILL.** No follow-on execution task is warranted. Precise
statement of why: the legacy config-milestones migration path is
intentionally retained, regression-tested code consistent with this
project's own real precedent for this exact category of one-time migration
shim (draft-prefix migration, ~6 months old, also still present) — proposing
its removal would contradict a real, current, actively-guarded regression
test tied to a genuine past bug, not close a real gap.

**Gut check (required disclosure, per kill-promote-procedure-v2.md step 5's
disclosure requirement — applied here even though step 5 itself was not
reached, since this spike's explicit purpose was to hunt for procedure-vs-
gut divergence)**:
- **Gut before investigating** (recorded at spike-selection time, in the
  "Purpose of this spike" note above): leaned toward "this looks like
  cleanup-worthy legacy cruft" — genuinely uncertain, selected as a
  plausible divergence candidate for exactly this reason.
- **Gut after investigating**: agrees strongly and unambiguously with the
  mechanical KILL verdict — once Findings 3 and 4 surfaced (the sibling
  precedent and the dedicated regression suite named after a real bug), the
  "cleanup-worthy cruft" read collapsed; no part of my post-investigation
  judgment disagrees with the procedure's output.
- **Would a reasonable alternative reader disagree?** Considered explicitly
  (per spike-2's disclosure discipline): a reader unaware of Finding 4 (the
  regression suite) might reasonably still favor cleanup — but that reading
  depends on not having done the investigation; given the actual evidence
  gathered, no reasonable reader with the same findings in hand would
  plausibly reach a different verdict. Unlike spike-2, this is a **clean,
  undisclosed-tension convergence** — procedure and gut agree with no
  remaining reasonable-alternative-reading tension once the evidence is in.

**Real procedure-vs-gut divergence status: NOT FOUND.** This is now the
4th spike in a row (of 4 total) where the mechanical procedure and honest
independent judgment converge (1 clean KILL in spike-0, 1 clean PROMOTE in
spike-1, 1 weak-agreement-with-disclosed-tension KILL in spike-2, 1
strong-agreement-with-no-tension KILL here) — see Section 5 for what this
means for the effectiveness component.

## 5. Retrospective

- **Did the declared budget hold?** Yes — 10 of 12 tool calls, a
  comfortable margin, similar to spike-0/1 rather than spike-2's exact
  12/12. The ceiling was not tested under real pressure this spike; the
  hardest timeboxing edge (ceiling reached *before* the done bar resolves)
  remains untested after 4 spikes. This was a deliberate non-goal of this
  spike (Iteration 3's mandate was the divergence hunt, not re-stress-
  testing the ceiling) — noting it honestly rather than treating this
  spike as closing that gap.
- **What made the divergence hunt hard or easy?** The candidate selection
  itself was the hard part — finding something where I genuinely didn't
  already lean toward the procedure's likely answer. This candidate worked
  as a genuine test because my pre-investigation gut (cleanup-worthy) and
  the eventual mechanical verdict (KILL, no cleanup) were plausibly
  different before I looked, even though they converged once I actually
  looked. This is an important methodological distinction: a genuine
  divergence-hunt attempt does not require the *final* verdict to feel
  uncertain — it requires the *pre-investigation* expectation to have been
  a real candidate for disagreement, which this one was.
- **What would a real divergence have looked like?** Concretely, it would
  have required corroboration (step 2) to be either absent or point toward
  removal (e.g., no regression test, no sibling retention precedent) while
  my gut still felt this was clearly obsolete — the procedure's structure
  makes step 2's corroboration check the most likely place a real
  divergence would show up, since it is the step most likely to surface
  information a fast gut judgment wouldn't have already accounted for. This
  spike's finding (corroboration was strong and readily available) suggests
  the procedure's step-2 corroboration check is doing real, useful work:
  it is what actually resolved this case, not an afterthought.
- **What does 4-for-4 procedure/gut agreement mean?** Two honest
  possibilities, both stated rather than resolved by fiat: (a) this is a
  genuine, useful property of the procedure — because step 2's
  corroboration-check is thorough, by the time a verdict is reached, gut
  and mechanism have converged on the same evidence, so agreement is
  *expected*, not coincidental; or (b) 4 spikes, all picked by the same
  agent using the same judgment that also wrote the procedure, is not yet
  a large or independent enough sample to rule out selection bias (I may be
  unconsciously picking candidates whose answers become clear once
  investigated, rather than ones that stay genuinely contested). Both
  readings are consistent with the evidence; this spike's honest
  contribution is documenting a real, motivated attempt at (a genuine
  divergence) that still didn't happen — not asserting which of (a)/(b) is
  true.
