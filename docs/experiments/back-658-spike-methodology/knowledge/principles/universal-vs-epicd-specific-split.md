# Universal vs. epicd-Specific Split

**Status**: v2 (Iteration 3) — adds a concrete hypothetical non-epicd
reusability check (Section 6, new) per Iteration 2's own named gap. The
structural classification tables (Sections "Timeboxing Rule"/"Kill/Promote
Procedure"/"Output Artifact Template" below) are unchanged from v1 (Iteration
2) — this iteration's new evidence confirmed, rather than revised, that
classification. This remains a structural claim about the methodology
(`timeboxing-rule-v2.md`, `kill-promote-procedure-v3.md`,
`spike-output-artifact.md` v2), now backed by one concrete worked
hypothetical example in addition to inspection — still not a real,
literally-executed non-epicd spike, which remains an honestly-disclosed
residual gap (Section 6).

## Method

For each rule/step in the two principle files, classify it as:
- **U (universal)**: states no epicd concept, tool, or artifact by name;
  would read identically if "epicd" were replaced with any other codebase.
- **E (epicd-specific)**: names an epicd concept, path, CLI, or artifact
  (`provenance.spawned_from`, `explorationPipeline`, `bun run cli`,
  `backlog/tasks/`, specific file paths) as part of the rule itself (not
  merely as an illustrative example in commentary).

## Timeboxing Rule (v2)

| Element | Classification | Note |
|---|---|---|
| "Budget in scope units (tool calls/files), not wall-clock minutes" | **U** | No epicd concept named; applies to any AI-agent-executed investigation in any codebase/tool environment where tool-call counting is available. |
| Default ceiling = 12 | **U (parameter), calibration is environment-specific** | The concept "have a default ceiling" is universal; the number 12 is calibrated from this experiment's own spike sizes (7-12 tool calls for a clean case in this codebase) — a different codebase/tooling setup would need its own calibration pass, not necessarily 12. |
| Declared scope (file/doc list) | **U** | Applies to any codebase. |
| Declared done bar | **U** | Applies to any investigation task, not epicd-specific. |
| Stop rule (a)/(b)/(c) | **U** | All three conditions (ceiling / done-bar-answered / 3 unproductive reads) are domain-neutral. |
| Ceiling/done-bar tie-break | **U** | Generic procedural clarification. |
| Candidate-scan exclusion from ceiling | **U** | Generic scoping convention. |

**Verdict: ~95% universal.** The only epicd-specific residue is the
*calibration* of the number 12 to this codebase's typical file sizes and
this experiment's own tool-call granularity — the *structure* of the rule
(scope-unit budgeting, 3-branch stop rule) is fully portable.

## Kill/Promote Procedure (v2)

| Step | Classification | Note |
|---|---|---|
| 1. Re-state done bar | **U** | Generic. |
| 2. Check external corroboration | **U** | Generic — "does an existing document/comment/prior decision already speak to this" applies to any codebase with any form of institutional memory (docs, ADRs, task trackers, commit messages). |
| 3. Resolved-vs-relocated test | **U** | Generic epistemic test, not epicd-specific — applies to any exploratory investigation. |
| 3 (v2 addition). Emergent-question split | **U** | Generic — the idea that an investigation can surface a narrower question beyond its declared scope, and that this should be verdicted separately, is not epicd-specific. |
| 4. Concrete follow-on shape test | **U (concept), E (target artifact)** | The *test* ("is there a nameable, right-sized follow-on") is universal; what the follow-on becomes if promoted (an execution-pipeline task carrying `provenance.spawned_from`, created via `backlog task create`) is epicd-specific plumbing. A non-epicd project would promote into whatever its own task-tracking mechanism is (a GitHub issue, a Jira ticket, a TODO) — same test, different target system. |
| 5. Ambiguity default (KILL) | **U** | Generic — "when genuinely unsure, default to no-action and record why" is a domain-neutral conservative-default principle. |
| Gut-check-vs-mechanism disclosure requirement | **U** | Generic methodological honesty practice. |

**Verdict: ~90% universal.** The one genuinely epicd-specific element is
*what "PROMOTE" cashes out to mechanically* (an execution-pipeline task with
`provenance.spawned_from`, per BACK-638's schema, created — or in this
experiment's case, only described — via the `backlog` CLI). The decision
*logic* for reaching PROMOTE is fully portable; only the promotion
*mechanism* is epicd's own.

## Output Artifact Template (v2)

All five sections (declaration / timeline / findings / verdict /
retrospective) are **U** — none name an epicd concept in their structural
definition. The only epicd-specific content that appears is *inside*
completed instances of the template (the actual findings text cites epicd
file paths, e.g. `src/engine/supervisor.ts`), which is expected and correct
— the template is a shape, not epicd-bound content.

## What "kill" and "promote" mean regardless of project (explicit, since this
matters for reusability and was a real point of care in this experiment's
own non-goals)

- **KILL** always means: no derived follow-on unit of work is created in
  whatever the host project's tracking system is; a written record is still
  produced (this experiment's own repeated finding: "no trace" is a
  mechanics statement about derived tasks, not license to skip
  documentation) — this distinction is itself universal, not epicd-specific.
- **PROMOTE** always means: a new, separately-trackable unit of work is
  created (or, in a read-only/experimental context like this one,
  described precisely enough that it *could* be created) with a traceable
  link back to the spike that produced it. In epicd this link is
  `provenance.spawned_from`; in another system it might be a linked issue,
  a "derived from" comment, or a parent-child ticket relationship — the
  requirement ("traceable derivation," not the specific field name) is what
  transfers.

## Section 6 — Reusability Check: Hypothetical Non-epicd Application (Iteration 3)

**Purpose**: Iteration 2 named this as the single cheapest, highest-value
remaining lever for the `reusability` component — actually attempting to
apply `kill-promote-procedure-v2.md` (now v3) and `timeboxing-rule-v2.md` to
a concrete hypothetical spike in a different kind of software project, to
check whether any epicd assumption is silently smuggled into a step this
document classifies as universal.

**Chosen hypothetical**: A Django/DRF web-app team spikes: "Now that we
upgraded to Django REST Framework 3.15 (which added built-in request
throttling), is our hand-rolled rate-limiter middleware still needed, or is
it now redundant scaffolding worth removing?" — deliberately chosen as
structurally analogous to spike-2's "is this surface orphaned after a
sibling replacement shipped" pattern, since that was this experiment's
hardest real case, making it the most demanding structure to re-run
hypothetically.

**Walkthrough** (applying each step exactly as written):

- **Timeboxing — budget in scope units, not wall-clock**: transfers
  unchanged; no epicd concept is named in the rule itself. The default
  ceiling number (12) would need its own recalibration to this team's
  typical investigation grain (IDE search results, doc reads) rather than
  epicd's tool-call granularity — already flagged as the one
  epicd-calibrated parameter in the table above; nothing new smuggled in.
- **Declared scope / done bar / stop rule (a)/(b)/(c)**: all transfer
  unchanged — none reference epicd, backlog, or any epicd tooling concept.
- **Step 1 (restate done bar)**: transfers unchanged.
- **Step 2 (external corroboration)**: transfers unchanged — the Django
  team would check DRF's changelog/docs and internal issue tracker (Jira/
  GitHub) instead of `git log`/task text, but the *check* ("does an
  existing document already speak to this") is identical in kind. No epicd
  concept was required to state or apply this step.
- **Step 3 (resolved vs. relocated) + the v2 emergent-question split**:
  transfers unchanged — e.g., the team might resolve "DRF's throttling
  covers our per-IP case" while surfacing an emergent, narrower question
  ("does it cover our per-tenant case too?") — the same split mechanism
  applies without modification.
- **Step 4 (concrete follow-on shape test)**: this is the **one step**
  where a substitution, not a smuggled assumption, is required: "PROMOTE"
  cashes out to a GitHub issue or Jira ticket with a "derived from spike
  X" link/label, instead of an execution-pipeline task with
  `provenance.spawned_from` created via the `backlog` CLI. The *test itself*
  ("is there a nameable, right-sized follow-on") is unchanged — exactly the
  distinction the v1 split document already drew for this step (see table
  above), now confirmed by a concrete example rather than asserted in the
  abstract.
- **Step 5 (ambiguity default) + gut-check/alternative-reader disclosure**:
  transfers unchanged — no epicd concept appears in this step at all.

**Concrete conclusion**: Walking a full, structurally-hard hypothetical
non-epicd spike through every step surfaced **exactly the substitution
already named in the v1 split table** (step 4's promotion target mechanism)
and **exactly the recalibration already named** (the ceiling number) — no
*additional*, previously-unnoticed epicd assumption was found smuggled into
a step this document had classified as universal. This is real, if modest,
positive evidence: it upgrades this component's evidence base from
"asserted from inspection of the rule text" to "asserted from inspection,
and confirmed by one concrete worked hypothetical example that actively
tried to find a counterexample and didn't." It does **not** upgrade to
"demonstrated," which would require literally executing the procedure on a
real spike in a real non-epicd codebase — that gap is real, cheap relative
to a live cross-project engagement but not zero-cost, and is carried
forward honestly rather than closed by this desk-check alone.

## Honest residual gap

Two residual gaps remain, both honestly disclosed rather than resolved by
this iteration's work:

1. This split (Sections above) is still **asserted from structural
   inspection of the rule text**, now reinforced by one concrete worked
   hypothetical (Section 6), but not **demonstrated** by literally running
   the procedure against a real non-epicd spike in a real non-epicd
   codebase. A live cross-project (or cross-tool) test would be stronger
   evidence than a desk-check, however carefully done, can provide.
2. This entire reusability assessment — including Section 6's hypothetical
   — was produced by the same agent that wrote the procedure being
   assessed, applying its own judgment about what would or wouldn't
   transfer. See `data/spike-3-log.md`'s retrospective and iteration-3.md
   Section 5 for this experiment's explicit position on this being a
   **permanent, honestly-disclosed residual** of any self-contained
   methodology-bootstrapping experiment of this shape, not a gap Iteration
   3 (or any single further iteration) can structurally close from within
   the experiment's own non-goals.
