#!/usr/bin/env bun
/**
 * BACK-665 fixpoint meter — the executable value function for the task-lifecycle-model
 * milestone (M1). It encodes BACK-665's Integration Acceptance as runnable checks so an
 * LFDD run has ONE red→green convergence signal instead of a pile of independent child
 * DoDs. This is the anti-"all children green but business goal unmet" gate (ADR-019):
 * nothing reports the fixpoint reached until this whole meter is green.
 *
 *   bun scripts/fixpoint-back665.ts               # structural checks (fast)
 *   bun scripts/fixpoint-back665.ts --with-suite  # also run the full `bun test` suite
 *
 * Exit 0 iff ALL checks pass (= fixpoint reached; BACK-665 may go Evaluating → Done).
 * Every check names the BACK-665 AC it proves and the child task that delivers it.
 *
 * NOTE: this lives in scripts/ (NOT src/), so it is NOT part of `bun test` — a red
 * fixpoint here never breaks the build during the many-PR migration. Children deliver
 * their own focused tests under src/test/ (normal red→green inside each PR); this meter
 * aggregates the assembled result.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { label } from "../src/core/field-registry";
import { ALL_PIPELINES } from "../src/engine/pipeline";

const ROOT = join(import.meta.dir, "..");
const TASKS_DIR = join(ROOT, "backlog", "tasks");
const SRC = join(ROOT, "src");

type Result = { pass: boolean; detail: string };
type Check = { id: string; ac: string; owner: string; run: () => Result };

function frontmatter(file: string): string {
	const m = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
	return m?.[1] ?? "";
}

function grep(dir: string, pattern: RegExp): string[] {
	const hits: string[] = [];
	const walk = (d: string) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) {
				if (e.name !== "node_modules") walk(p);
			} else if (/\.(ts|tsx)$/.test(e.name) && pattern.test(readFileSync(p, "utf8"))) {
				hits.push(p.replace(`${ROOT}/`, ""));
			}
		}
	};
	walk(dir);
	return hits;
}

/** A behavior best proven by a child-delivered test: pass once that test file exists
 * (its green-ness is enforced by `bun test` in the child's own DoD / --with-suite here). */
function deliveredTest(name: string): () => Result {
	return () => {
		const present = existsSync(join(SRC, "test", name));
		return { pass: present, detail: present ? `${name} delivered` : `awaiting src/test/${name}` };
	};
}

const machinePhases = ALL_PIPELINES.flatMap((p) =>
	p.states.filter((s) => s.actor === "machine").map((s) => `${p.id}/${s.name}`),
);

const checks: Check[] = [
	{
		id: "no-persisted-role",
		ac: "AC1/AC2",
		owner: "BACK-664.2 (del role field) — monitor-free, delivered",
		run: () => {
			const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".md"));
			const bad = files.filter((f) => /^role:/m.test(frontmatter(join(TASKS_DIR, f))));
			return { pass: bad.length === 0, detail: `${bad.length}/${files.length} task files still persist role:` };
		},
	},
	{
		id: "no-persisted-status",
		ac: "AC1/AC2",
		owner: "BACK-664 (del status field) — NOT monitor-gated; requires: field-registry present() gate + parser fallback + migration script (all tasks, with/without pipeline_id) + lint guard",
		run: () => {
			const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".md"));
			const bad = files.filter((f) => /^status:/m.test(frontmatter(join(TASKS_DIR, f))));
			return { pass: bad.length === 0, detail: `${bad.length}/${files.length} task files still persist status:` };
		},
	},
	{
		id: "status-projection-phase-only",
		ac: "AC2",
		owner: "BACK-664 child 1 (projection)",
		run: () => {
			const out = label("compound", "needs-human");
			const unitPass = out === "Needs Human";

			// Unit-testing label() in isolation is gameable — it stays green even if
			// every real web render site bypasses displayStatus() and prints the raw
			// (possibly Basic:/Epic:-prefixed) persisted task.status string instead
			// (found live in the browser during BACK-665 iteration: TaskDetailsModal/
			// TaskList/MilestoneTaskRow badges rendered `{task.status}` directly).
			// So also grep the actual render sites for that anti-pattern.
			const webComponents = join(SRC, "web", "components");
			const rawStatusBadgeHits = grep(webComponents, /\{task\.status\}/).filter(
				(hit) => !hit.includes("Statistics.tsx"), // icon-only, not a visible text badge
			);
			const pass = unitPass && rawStatusBadgeHits.length === 0;
			const detail =
				`label(compound,"needs-human") = "${out}" (want "Needs Human", no Basic:/Epic: prefix); ` +
				`raw {task.status} badge renders in web/components: ${rawStatusBadgeHits.length} (want 0)${
					rawStatusBadgeHits.length ? ` — ${rawStatusBadgeHits.join(", ")}` : ""
				}`;
			return { pass, detail };
		},
	},
	{
		id: "no-prefix-generator-in-code",
		ac: "AC2",
		owner: "BACK-664 child 1 (projection)",
		run: () => {
			const hits = grep(SRC, /\?\s*"Epic"\s*:\s*"Basic"/);
			return { pass: hits.length === 0, detail: hits.length ? `Epic/Basic prefix generator still in: ${hits.join(", ")}` : "no Epic/Basic status-prefix generator in src" };
		},
	},
	{
		id: "no-cli-status-edit-surface",
		ac: "AC2",
		owner: "BACK-664 child 1 (edit-surface removal)",
		run: () => {
			const n = (readFileSync(join(SRC, "cli.ts"), "utf8").match(/-s, --status/g) ?? []).length;
			return { pass: n === 0, detail: `${n} '-s, --status' edit option(s) remain in cli.ts (list/search read-filters are fine)` };
		},
	},
	{
		id: "no-web-status-select",
		ac: "AC2",
		owner: "BACK-664 child 1 (edit-surface removal)",
		run: () => {
			const hits = grep(join(SRC, "web"), /StatusSelect/);
			return { pass: hits.length === 0, detail: hits.length ? `web StatusSelect still in: ${hits.join(", ")}` : "no editable web StatusSelect" };
		},
	},
	{
		id: "has-children-indicator",
		ac: "AC2",
		owner: "BACK-664 child 1 (has-children affordance)",
		run: deliveredTest("has-children-indicator.test.ts"),
	},
	{
		id: "web-lifecycle-conformance",
		ac: "AC1",
		owner: "BACK-664 child 1 (web = pipeline lanes/phase cols/actor⟗claim)",
		run: deliveredTest("web-lifecycle-conformance.test.ts"),
	},
	{
		id: "phase-skill-coverage",
		ac: "AC3",
		owner: "BACK-657 child 1 (coverage manifest+test)",
		run: () => {
			const t = deliveredTest("phase-skill-coverage.test.ts")();
			return { pass: t.pass, detail: `${t.detail} — machine phases needing a skill: ${machinePhases.join(", ")}` };
		},
	},
	{
		id: "evaluate-runs-integration-acceptance",
		ac: "AC3 (self-enforcing loop)",
		owner: "BACK-657 child 3 (evaluate skill / evaluateEpic)",
		run: () => {
			const ev = readFileSync(join(SRC, "harness", "evaluator.ts"), "utf8");
			const runsAcceptance = /acceptance/i.test(ev) && /(Bun\.\$|spawn|execSync|runCommand|child_process)/.test(ev);
			return { pass: runsAcceptance, detail: runsAcceptance ? "evaluateEpic runs the epic's Integration Acceptance" : "evaluateEpic only aggregates child terminal phases — ADR-019 gap: epic can go done without its integration acceptance ever running" };
		},
	},
	{
		id: "epicd-self-sufficient-no-baime",
		ac: "AC4",
		owner: "BACK-660 + BACK-664 (claim axis / native runtime) — deferred by user decision; excluded from current convergence target",
		run: deliveredTest("epicd-self-sufficient-no-status.test.ts"),
	},
	{
		id: "phase-pipeline-web-editable",
		ac: "AC5",
		owner: "BACK-665 AC5 + BACK-661 (raw pipeline/phase visible+editable in web, symmetric create validation)",
		run: () => {
			const modal = readFileSync(join(SRC, "web", "components", "TaskDetailsModal.tsx"), "utf8");
			const rendersRaw = /pipelineId/.test(modal) && /ALL_PIPELINES/.test(modal);
			const hasSelects = (modal.match(/<select/g) ?? []).length >= 4; // priority/milestone + pipeline/phase
			const guardsCreate = /pipeline_id and phase must be given together/.test(readFileSync(join(SRC, "core", "backlog.ts"), "utf8"));
			const pass = rendersRaw && hasSelects && guardsCreate;
			return {
				pass,
				detail: `TaskDetailsModal renders pipeline/phase selects: ${rendersRaw && hasSelects}; create-time both-or-neither guard: ${guardsCreate}`,
			};
		},
	},
];

const results = checks.map((c) => ({ ...c, ...c.run() }));
const green = results.filter((r) => r.pass).length;

console.log("\nBACK-665 fixpoint meter — task-lifecycle-model M1\n");
for (const r of results) {
	console.log(`  ${r.pass ? "✅" : "❌"}  ${r.id}  [${r.ac}]`);
	console.log(`        ${r.detail}`);
	if (!r.pass) console.log(`        ↳ owner: ${r.owner}`);
}
console.log(`\n  ${green}/${results.length} fixpoint checks green\n`);

let suiteOk = true;
if (process.argv.includes("--with-suite")) {
	console.log("  running full `bun test` suite …");
	const proc = Bun.spawnSync(["bun", "test", "--parallel", "./src"], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
	suiteOk = proc.exitCode === 0;
	console.log(`  full suite: ${suiteOk ? "✅ green" : "❌ red"}\n`);
}

process.exit(green === results.length && suiteOk ? 0 : 1);
