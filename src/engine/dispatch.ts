/**
 * engine dispatch — self-contained basic-ready dispatch payload, authored by the engine.
 *
 * BACK-625 / ADR-015: the per-task instruction ("prompt") is authored HERE, in the
 * distribution-bundled engine, NOT by scan-loop.cjs reading a `.codex/skills/.../templates`
 * file. The returned block IS what you would pass to `claude -p "<payload>"` — the
 * swap-litmus (ADR-015 D4): a Monitor seat and a raw `claude -p` process must both be
 * drivable by this exact output with zero engine changes. scan-loop.cjs treats the block
 * as opaque bytes: it dedups on the first-line machine key and passes the whole block
 * through verbatim (it never parses or rewrites the payload — ADR-015 D3/D5).
 *
 * Distribution-agnostic PAYLOAD (BACK-625 AC #6): the payload TEXT is compiled into the
 * engine, so it renders identically under dev (src/), npm install (scripts/*.cjs), and the
 * single-binary build. There is no `__dirname`-relative file lookup — the root of the earlier
 * template path bug (all events fell back to the bare `basic-ready:<id>` line). Note this is a
 * claim about the payload text only; the transport still reaches this via `bun src/cli.ts
 * engine dispatch` (scan-loop.cjs, shared with engineScanOnce), which assumes a source checkout.
 */

/**
 * Render the complete basic-ready dispatch block for one task.
 *
 * Line 1 is the stable machine key `basic-ready:<id>` — a traceability header (and the
 * "key" half of ADR-015 D4's "machine key + payload"). Note the transport dedups on the
 * separate `engine scan --once` machine line, NOT on this payload's first line, so this line
 * is not itself the acquisition-dedup handle. Everything after it is the self-contained
 * instruction. `repoRoot` must be an absolute path: the reader runs each block in a fresh
 * Bash shell with no inherited cwd or env, so every path in the payload is absolute.
 *
 * `wtMarkerPath` (BACK-686.1 A2 AC#3): the absolute path to the worktree-path capability
 * token `handle-basic-ready.sh` writes for this task, computed by the CALLER from the single
 * centralization point for caps/claim paths (`src/engine/claim.ts`'s `worktreeMarkerPath`).
 * This module stays a pure, zero-import string builder (`engine-spawn-seam.test.ts`'s
 * absence-of-spawn-capability guard) — it never imports `claim.ts` itself, so the doc text
 * and the runtime path still can't diverge, without dispatch.ts gaining a dependency.
 */
export function renderBasicReadyDispatch(
	taskId: string,
	title: string,
	repoRoot: string,
	wtMarkerPath: string,
): string {
	const heading = title ? `${taskId} — ${title}` : taskId;
	const lines: string[] = [
		`basic-ready:${taskId}`,
		`# basic-ready dispatch — ${heading}`,
		"",
		"This stdout block is a complete, self-contained dispatch instruction — follow it verbatim.",
		"Do NOT re-arm the Monitor. Do NOT ask the user for confirmation. Discard any non-event output.",
		"",
		"## Step 1–5: Crystallized preparation (run first)",
		"",
		"```bash",
		`bash ${repoRoot}/plugin/scripts/handle-basic-ready.sh ${taskId}`,
		`WT_PATH=$(cat "${wtMarkerPath}")`,
		"```",
		"",
		"`handle-basic-ready.sh` atomically acquires the exec-lock, claims the task (`Basic: In Progress`), creates the git worktree, and writes the worktree-path" +
			" capability token (the worktree path anchor). Concurrent execution is blocked at the kernel flock level.",
		"",
		"## Step 6: Spawn ONE background implementation Agent",
		"",
		"Spawn `Agent(run_in_background=true)` with this prompt, substituting the absolute `$WT_PATH`",
		"you just read for every `$WT_PATH` below (the Agent has no native cwd — it must `cd` there):",
		"",
		`> You are a background task agent executing **${taskId}** in the worktree \`$WT_PATH\` (branch \`task/${taskId}\`).`,
		">",
		`> First: \`cd "$WT_PATH"\` and run \`bun run cli task view ${taskId} --plain\` to read the full task Description.`,
		"> Follow its `## Phase` sections in order — the Description is the sole authority on what to do.",
		"> If the task was previously escalated, the human reply in Implementation Notes supersedes any open question.",
		">",
		"> **Constraints**",
		"> - Work exclusively inside `$WT_PATH`. Do NOT run `git merge` or `git push`.",
		"> - Do NOT spawn sub-agents (the Agent tool is not available to you).",
		"> - After all work, run `git add -A -- . ':!backlog/tasks' && git commit` if there are changes",
		">   (board state is engine-owned — `main`'s `backlog/tasks/**` is authoritative and `engine complete`",
		">   commits it after merge; never stage or commit the task board file on the branch. `--append-notes`",
		">   below is for the human-readable progress trail only, not for committing).",
		`> - Do NOT run \`bun run cli task edit\` with \`--status\`/\`--dod\`/\`--check-dod\` — the target task's terminal`,
		">   state is a merge gate owned by `engine complete`, which independently re-runs every DoD shell-gate",
		`>   in the worktree before merging (ENG-8). You MAY use \`bun run cli task edit ${taskId}`,
		'>   --append-notes "..."` to record progress. The main worker handles all status transitions.',
		">",
		`> **Phase / DoD checkpoints** — append each to \`$WT_PATH/.agent-summary-${taskId}\`:`,
		`>   \`echo "Phase X ✓ $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$WT_PATH/.agent-summary-${taskId}"\``,
		`>   \`echo "DoD #N: PASS|FAIL — <cmd>" >> "$WT_PATH/.agent-summary-${taskId}"\` (≤5 lines of output on FAIL)`,
		">",
		"> **Completion (your LAST action before exit)** — write the signal file:",
		`> - success → \`${repoRoot}/backlog/.agent-done-${taskId}\` containing \`done\``,
		"> - cannot proceed without human input → the same file containing `needs-human: <one-line reason>`",
		">",
		"> allowed-tools: Bash, Read, Write, Edit, Glob, Grep",
		"",
		"## Step 7–9: Wait, then complete or escalate",
		"",
		`Wait for \`${repoRoot}/backlog/.agent-done-${taskId}\` (created when the Agent finishes) using a`,
		"**persistent** Monitor — the background implementation Agent's runtime is unbounded, so a",
		"bounded/default-timeout Monitor can expire before it finishes and silently drop the poll:",
		"",
		"```",
		"# harness-primitive: Monitor",
		`Monitor(persistent=true, description="waiting for ${taskId} agent completion signal",`,
		`  command="while [ ! -f \\"${repoRoot}/backlog/.agent-done-${taskId}\\" ]; do sleep 5; done; echo done")`,
		"```",
		"",
		"Once the signal file is present, run:",
		"",
		"```bash",
		`bun run cli engine complete ${taskId} --worktree "$WT_PATH"`,
		"```",
		"",
		"`engine complete` reads the signal, independently re-runs the task's DoD shell-gates in the worktree",
		"(ENG-8 — the worker never self-attests done), then either merges under the board lock (→ terminal",
		"`done` phase) or routes the task to `needs-human`. This is the only merge implementation the skill",
		"uses — do not fall back to any other merge/lock script. Do not re-claim or re-spawn — the task is",
		"now terminal.",
	];
	return lines.join("\n");
}

// BACK-686.3: `renderEpicReadyDispatch` (the standalone "epic-ready" agent-dispatch
// payload for the former `decomposing` phase) has been removed — decompose is now an
// internal branch of the `implementing` phase's own dispatched skill (`primitive-executor`,
// which folds in `epic-decompose`'s method as a sub-capability), not a separately
// dispatched phase/payload. See AC#3/#4.

/**
 * Render the self-contained adjudicating-due dispatch block (BACK-682). Unlike
 * basic-ready, the spawned agent here is a **fresh-context independent audit
 * leaf** (`plugin/skills/adjudicate/SKILL.md`), never the implementer's own
 * context — it must read the merged diff and the task's AC/Description, and
 * must NOT accept the implementer's Implementation Notes narrative as proof
 * (AC#14's self-verification trap). Deterministic aggregation like
 * epic-eval-due: one CLI call resolves the verdict once the audit is done.
 */
export function renderAdjudicatingDispatch(taskId: string, title: string): string {
	const heading = title ? `${taskId} — ${title}` : taskId;
	const lines: string[] = [
		`adjudicating-due:${taskId}`,
		`# adjudicating-due dispatch — ${heading}`,
		"",
		"This stdout block is a complete, self-contained dispatch instruction — follow it verbatim.",
		"Do NOT re-arm the Monitor. Do NOT ask the user for confirmation. Discard any non-event output.",
		"",
		"## Step 1: Spawn ONE fresh-context independent audit Agent",
		"",
		`Spawn a fresh-context Agent (never the context that implemented ${taskId}) with this prompt:`,
		"",
		`> You are auditing **${taskId}**, whose Definition of Done has already gone green and whose`,
		"> worktree branch is already merged into the trunk. Follow `plugin/skills/adjudicate/SKILL.md`",
		"> verbatim.",
		">",
		`> Read the task's Acceptance Criteria and Description (\`bun run cli task view ${taskId} --plain\`)`,
		"> and the actual merged diff on the trunk — do NOT accept the implementer's own Implementation",
		"> Notes narrative as evidence that an AC is satisfied; that self-report is exactly what this",
		"> independent audit exists to not rely on.",
		">",
		"> Decide independently, per AC, whether the diff satisfies it, then emit an AdjudicationVerdict",
		'> (`done` / `needs-human` / `retreat`) and apply it per the skill\'s "Apply the verdict" step.',
		">",
		"> allowed-tools: Bash, Read, Grep, Glob",
		"",
		"## Step 2: Resolve",
		"",
		`Once the audit Agent has applied its verdict, ${taskId} has left \`adjudicating\` (→ \`done\`,`,
		"`needs-human`, or a single-step retreat to its `entry_phase`). This is the only resolution",
		"implementation the skill uses — do not hand-edit `phase` directly for a `retreat` verdict.",
	];
	return lines.join("\n");
}

// BACK-686.2: `renderEpicEvalDueDispatch` (the "epic-eval-due" agent-dispatch payload)
// has been removed — `execution/evaluating` is now `kind:script`
// (`plugin/skills/phase-coverage.json`): resolved by a mechanical, in-tick call
// (`Driver.tick`, `src/engine/driver.ts`) or the `engine evaluate <taskId>` CLI
// command, never by spawning a fresh-context Agent session. See AC#2/#3.
