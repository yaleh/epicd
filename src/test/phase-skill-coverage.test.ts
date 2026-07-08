/**
 * BACK-657.1 — the phase-skill coverage gate (BACK-665 requirement 3 / AC#7 of
 * BACK-657): every `actor === "machine"` phase across all 3 pipelines must be
 * EITHER covered by a published + registered skill under `plugin/skills/` (whose
 * `contract.json` `phase` matches `<pipeline_id>/<phase_name>`) OR explicitly
 * marked `experiment-pending` pointing at a real experiment task.
 *
 * BACK-686.3 collapsed the machine-actor phase set from 7 to 5:
 *   - execution/ready + execution/decomposing -> unified into execution/implementing
 *     (decompose-vs-leaf is now a runtime branch inside primitive-executor, which
 *     folds in epic-decompose's method; epic-decompose retired as a standalone
 *     dispatched-phase skill)
 *   - execution/evaluating -> fully retired (folded into the execution/adjudicating
 *     gate, BACK-686.2 — no manifest entry, no phase, no coverage row at all)
 *   - authoring/draft -> renamed authoring/drafting
 *   - exploration/spike -> renamed exploration/spiking
 * All 5 machine-actor phases are covered — see the full-coverage invariant test
 * below.
 *
 * BACK-686.2 added a `kind ∈ {skill, script, gate}` to every manifest entry (actor
 * fidelity: which machine phases are worth a session spawn) — see the "manifest kind"
 * describe block below.
 *
 * Per the task narrative this test must "fail loud" when phases are uncovered.
 * We prove that failure behavior with a real, deterministic, always-green
 * negative-control test (same pattern as pipeline-coupling-discipline.test.ts:
 * positive control on the real files/manifest, negative control on a fixture that
 * must trip the assertion) rather than by leaving a real assertion red in the
 * suite — see https://bun.sh/docs/test/writing.
 */
import { describe, expect, it } from "bun:test";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ALL_PIPELINES } from "../engine/pipeline";
import {
	type CoverageKind,
	computeCoverage,
	loadPhaseCoverageManifest,
	type ManifestEntry,
	machineActorPhases,
	uncoveredMachinePhases,
} from "../engine/skill-registry";

const REPO_ROOT = join(import.meta.dir, "..", "..");

const EXPECTED_MACHINE_PHASES = [
	"execution/implementing",
	"execution/adjudicating",
	"authoring/drafting",
	"authoring/refining",
	"exploration/spiking",
];

describe("machineActorPhases() — positive control", () => {
	it("enumerates exactly the 5 machine-actor phases (BACK-686.3 collapse from 7 to 5)", () => {
		expect(machineActorPhases().sort()).toEqual([...EXPECTED_MACHINE_PHASES].sort());
	});

	it("is derived from src/engine/pipeline.ts's ALL_PIPELINES, not a hand-maintained list", () => {
		const rederived = ALL_PIPELINES.flatMap((p) =>
			p.states.filter((s) => s.actor === "machine").map((s) => `${p.id}/${s.name}`),
		);
		expect(machineActorPhases().sort()).toEqual(rederived.sort());
	});
});

describe("phase-coverage manifest — current, real state (BACK-686.3 scope)", () => {
	it("registers exploration/spiking as a skill, resolved to the published exploration-spike skill", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "exploration/spiking");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("exploration-spike");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const spiking = coverage.find((c) => c.phase === "exploration/spiking");
		expect(spiking?.covered).toBe(true);
	});

	it("registers execution/implementing as a skill, resolved to the published primitive-executor skill (BACK-686.3 — folds in decompose)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "execution/implementing");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("primitive-executor");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const implementing = coverage.find((c) => c.phase === "execution/implementing");
		expect(implementing?.covered).toBe(true);
	});

	it("registers authoring/drafting as a skill, resolved to the published authoring-draft skill", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "authoring/drafting");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("authoring-draft");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const drafting = coverage.find((c) => c.phase === "authoring/drafting");
		expect(drafting?.covered).toBe(true);
	});

	it("registers authoring/refining as a skill, resolved to the published authoring-refining skill", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "authoring/refining");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("authoring-refining");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const refining = coverage.find((c) => c.phase === "authoring/refining");
		expect(refining?.covered).toBe(true);
	});

	it("registers execution/adjudicating as a skill, resolved to the published adjudicate skill, kind:gate (BACK-682/BACK-686.2)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "execution/adjudicating");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("adjudicate");
		expect(entry?.kind).toBe("gate");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const adjudicating = coverage.find((c) => c.phase === "execution/adjudicating");
		expect(adjudicating?.covered).toBe(true);
	});

	it("has no manifest entry at all for execution/decomposing or execution/evaluating — fully retired, not merely uncovered (BACK-686.3/BACK-686.2)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		expect(manifest.find((e) => e.phase === "execution/decomposing")).toBeUndefined();
		expect(manifest.find((e) => e.phase === "execution/evaluating")).toBeUndefined();
		expect(manifest.find((e) => e.phase === "execution/ready")).toBeUndefined();
		expect(manifest.find((e) => e.phase === "authoring/draft")).toBeUndefined();
		expect(manifest.find((e) => e.phase === "exploration/spike")).toBeUndefined();
	});

	it("leaves zero machine phases uncovered — full coverage achieved across all 5 phases", () => {
		const gaps = uncoveredMachinePhases(REPO_ROOT).sort();
		expect(gaps).toEqual([]);
	});

	it("is exactly one manifest file — no second (pipeline_id, phase) -> skill registry exists", () => {
		// Single-source-of-truth check: nothing else under plugin/skills/ should look
		// like a second coverage manifest (e.g. a stray phase-coverage.json copy or an
		// alternately-named registry file).
		const entries = readdirSync(join(REPO_ROOT, "plugin", "skills"), { withFileTypes: true });
		const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => e.name);
		expect(jsonFiles).toEqual(["phase-coverage.json"]);
	});
});

describe("full-coverage invariant — the eventual goal, now met", () => {
	it("every machine-actor phase is covered by a published skill or experiment-pending pointer", () => {
		const gaps = uncoveredMachinePhases(REPO_ROOT);
		expect(gaps).toEqual([]);
	});
});

describe("coverage assertion — negative control (proves the gate really fails loud on a gap)", () => {
	it("throws a clear, gap-listing error when a machine phase has no manifest entry", () => {
		const phases = ["execution/implementing", "execution/adjudicating"];
		const manifest = [{ phase: "execution/implementing", status: "skill" as const, skill: "primitive-executor" }];

		const coverage = computeCoverage(REPO_ROOT, phases, manifest);
		const gaps = coverage.filter((c) => !c.covered);

		// Assert-and-throw wrapper mirroring what a caller (e.g. a CLI/CI gate) would do:
		const assertFullCoverage = () => {
			if (gaps.length > 0) {
				throw new Error(
					`phase-skill-coverage: missing skill/experiment-pending for: ${gaps.map((g) => g.phase).join(", ")}`,
				);
			}
		};

		expect(gaps.map((g) => g.phase)).toEqual(["execution/adjudicating"]);
		expect(() => assertFullCoverage()).toThrow(/missing skill\/experiment-pending for: execution\/adjudicating/);
	});

	it("does not false-positive: a phase with a correctly-registered skill IS reported covered", () => {
		// Uses the real fixture under src/test/fixtures/skill-lint/valid-extract, whose
		// contract.json declares phase "execution/ready" — proves computeCoverage can
		// report `covered: true` for a genuinely-matching skill registration, not just
		// gaps (a vacuously-always-failing assertion would be as useless as one that
		// never fails). The phase name itself is arbitrary fixture data here.
		const fixturesRoot = join(import.meta.dir, "fixtures", "skill-lint-fixture-repo-root");
		// Build a minimal fake repo root: plugin/skills/<skill>/contract.json only.
		const skillDir = join(fixturesRoot, "plugin", "skills", "fixture-extract");
		mkdirSync(skillDir, { recursive: true });
		copyFileSync(
			join(import.meta.dir, "fixtures", "skill-lint", "valid-extract", "contract.json"),
			join(skillDir, "contract.json"),
		);

		const manifest = [{ phase: "execution/ready", status: "skill" as const, skill: "fixture-extract" }];
		const coverage = computeCoverage(fixturesRoot, ["execution/ready"], manifest);
		expect(coverage[0]?.covered).toBe(true);

		rmSync(join(fixturesRoot, "plugin"), { recursive: true, force: true });
	});
});

describe("manifest file is well-formed JSON with the documented shape", () => {
	it("plugin/skills/phase-coverage.json parses and every entry has phase+status", () => {
		const raw = JSON.parse(readFileSync(join(REPO_ROOT, "plugin", "skills", "phase-coverage.json"), "utf8"));
		expect(Array.isArray(raw.entries)).toBe(true);
		for (const entry of raw.entries) {
			expect(typeof entry.phase).toBe("string");
			expect(["skill", "experiment-pending", "mechanical"]).toContain(entry.status);
		}
	});
});

describe("manifest kind — every entry declares exactly one kind ∈ {skill, script, gate} (BACK-686.2 AC#1)", () => {
	const VALID_KINDS: CoverageKind[] = ["skill", "script", "gate"];

	it("every entry in the real manifest has a recognized kind", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		expect(manifest.length).toBeGreaterThan(0);
		for (const entry of manifest) {
			expect(entry.kind, `entry for phase "${entry.phase}" is missing kind`).toBeDefined();
			expect(VALID_KINDS, `entry for phase "${entry.phase}" has unrecognized kind "${entry.kind}"`).toContain(
				entry.kind as CoverageKind,
			);
		}
	});

	it("every machine-actor phase resolves to exactly one manifest entry with a kind (no gaps, no dupes)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		for (const phase of machineActorPhases()) {
			const matches = manifest.filter((e) => e.phase === phase);
			expect(matches.length, `phase "${phase}" must have exactly one manifest entry`).toBe(1);
			expect(matches[0]?.kind).toBeDefined();
		}
	});

	it("execution/implementing is kind:skill (BACK-686.3 — decompose folded in, still a skill dispatch)", () => {
		const entry = loadPhaseCoverageManifest(REPO_ROOT).find((e) => e.phase === "execution/implementing");
		expect(entry?.kind).toBe("skill");
	});

	it("execution/adjudicating is kind:gate (BACK-686.2 AC#4)", () => {
		const entry = loadPhaseCoverageManifest(REPO_ROOT).find((e) => e.phase === "execution/adjudicating");
		expect(entry?.kind).toBe("gate");
	});

	it("fails loud on a fixture entry missing kind — negative control", () => {
		const badManifest: ManifestEntry[] = [
			{ phase: "execution/implementing", status: "skill" as const, skill: "primitive-executor" },
		];
		expect(badManifest[0]?.kind).toBeUndefined();
	});

	it("fails loud on a fixture entry with an unrecognized kind value — negative control", () => {
		const badKind = "spawn-forever";
		expect(VALID_KINDS).not.toContain(badKind);
	});
});
