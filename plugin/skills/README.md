# plugin/skills/ — SKILL convention

This directory holds every skill epicd ships as a plugin. Two families live here:

- **Operation skills** (`propose/`, `promote/`, `inbox/`, `run/`, `init/`) — pre-existing,
  simple `SKILL.md`-only wrappers around a single engine CLI command. Not built to the
  schema below; out of scope for BACK-657.1 (do not retrofit them).
- **Phase-execution skills** (added starting BACK-657.2/.3/.4) — one skill per machine-actor
  pipeline phase (see `docs/task-lifecycle-model.md` §3/§6). These follow the contract
  schema below: λ-spec header, Phase decomposition, finalise-writes-back-to-task —
  epicd-native and minimal. The structural paradigm this shape is modeled on is an
  external, non-shipped reference (cited from task descriptions/docs, never from
  anything under `plugin/`) — see note below on runtime independence.

## contract.json

Every phase-execution skill directory carries a sibling `contract.json` next to its
`SKILL.md`:

```json
{
	"skill": "primitive-executor",
	"phase": "execution/ready",
	"creation_path": "extract",
	"provenance": "docs/research/<experiment-doc>.md"
}
```

Fields (all required, all non-empty strings):

- **`phase`** — `<pipeline_id>/<phase_name>` this skill executes, e.g. `execution/ready`.
  Must name a real machine-actor phase declared in `src/engine/pipeline.ts`
  (`ALL_PIPELINES`).
- **`creation_path`** — one of:
  - `extract` — packaged from a methodology that already converged via a
    `methodology-bootstrapping` experiment (Observe→Codify→Automate).
  - `mechanical` — a thin CLI wrapper that makes no methodology claim (there is nothing
    to validate beyond "does it call the right command").
  - `experiment-pending` — no skill ships yet; this phase points at a pending
    methodology-bootstrapping experiment instead.
- **`provenance`** — depends on `creation_path`:
  - `extract` → a citation to the source experiment/methodology: a path (relative to the
    repo root) that must exist on disk, e.g. `docs/research/lfdd-convergence/README.md`.
  - `mechanical` → the literal sentinel string `mechanical: no methodology` (exactly —
    this is what marks "no methodology to cite" as an explicit, checkable statement
    rather than a missing field).
  - `experiment-pending` → a task id (e.g. `BACK-658`) that must resolve to a real task
    file under `backlog/tasks/`.

### Runtime independence from any external framework (D-7-bis)

A skill's `SKILL.md` instructions must never invoke a namespaced external skill (any
`/<vendor>:<skill>` invocation syntax) or reference an external framework's own script
paths as an executable step. Citing an external artifact as a `provenance` value
(documentary reference only, e.g. pointing at the path of an external SKILL.md this
skill's shape was structurally derived from) is fine — `provenance` lives in
`contract.json`, not in the executable `SKILL.md` body, so this is a plain data field,
never a step the skill *runs*. `plugin/scripts/skill-lint.sh` enforces the executable
side of this rule by scanning `SKILL.md` only, and never itself names or embeds any
external framework's identifier — everything under `plugin/` must remain free of any
such reference so the packaged plugin stays verifiably self-contained (see
`src/test/epicd-plugin-synthetic-repo.test.ts`, which asserts this for the whole
shipped `plugin/` tree). Task descriptions and non-shipped docs are where such external
references, when useful for context, belong.

## The (pipeline_id, phase) → skill registry

`plugin/skills/phase-coverage.json` is the single source of truth mapping every
machine-actor phase to either a registered skill or an `experiment-pending` pointer.
It is read by:

- `src/test/phase-skill-coverage.test.ts` (the coverage gate, today)
- the monitor runtime, later (BACK-660), for dispatch-time skill injection

Do not add a second manifest/registry file — extend this one.

## Linting

`plugin/scripts/skill-lint.sh <skill-dir>` validates one skill's `contract.json` against
the schema above (existence of `phase`/`creation_path`/`provenance`, `provenance`
resolvability per `creation_path`, `SKILL.md` runtime independence per above).
`plugin/scripts/skill-lint.sh --all [skills-root]` walks every immediate subdirectory of
`skills-root` (default `plugin/skills`) and validates each one — **except** it gracefully
**skips** any directory with no `contract.json` (this is how the 5 pre-existing operation
skills, which predate this schema, stay green without being retrofitted). Single-skill
mode has no such leniency: pointing it at a directory with no `contract.json` is a hard
failure, since that mode is an explicit ask to lint that skill.
