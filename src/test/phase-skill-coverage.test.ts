/**
 * BACK-657.1 — the phase-skill coverage gate (BACK-665 requirement 3 / AC#7 of
 * BACK-657): every `actor === "machine"` phase across all 3 pipelines must be
 * EITHER covered by a published + registered skill under `plugin/skills/` (whose
 * `contract.json` `phase` matches `<pipeline_id>/<phase_name>`) OR explicitly
 * marked `experiment-pending` pointing at a real experiment task.
 *
 * Current expected state (BACK-657.1 delivered the gate itself; BACK-657.2 registered
 * execution/ready; BACK-657.3 registered execution/decomposing + execution/evaluating;
 * BACK-657.4 registered authoring/draft + authoring/refining; BACK-658 converged its
 * spike/exploration methodology experiment and registered exploration/spike as a real
 * skill). All 6 machine-actor phases are now covered — see the full-coverage invariant
 * test below, whose `.failing()` modifier has been removed now that it passes for real:
 *   - exploration/spike     -> skill -> exploration-spike (covered)
 *   - execution/ready       -> skill -> primitive-executor (covered)
 *   - execution/decomposing -> skill -> epic-decompose (covered)
 *   - execution/evaluating  -> skill -> epic-evaluate (covered)
 *   - authoring/draft       -> skill -> authoring-draft (covered)
 *   - authoring/refining    -> skill -> authoring-refining (covered)
 *
 * Per the task narrative this test must "fail loud" when phases are uncovered.
 * We prove that failure behavior with a real, deterministic, always-green
 * negative-control test (same pattern as pipeline-coupling-discipline.test.ts:
 * positive control on the real files/manifest, negative control on a fixture that
 * must trip the assertion) rather than by leaving a real assertion red in the
 * suite. Now that BACK-657.2/.3/.4 have all landed their skills, the full-coverage
 * invariant below asserts real, unconditional green (zero gaps) instead of being
 * marked `.failing()` — see https://bun.sh/docs/test/writing.
 */
import { describe, expect, it } from "bun:test";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ALL_PIPELINES } from "../engine/pipeline";
import {
	computeCoverage,
	loadPhaseCoverageManifest,
	machineActorPhases,
	uncoveredMachinePhases,
} from "../engine/skill-registry";

const REPO_ROOT = join(import.meta.dir, "..", "..");

const EXPECTED_MACHINE_PHASES = [
	"execution/ready",
	"execution/decomposing",
	"execution/evaluating",
	"authoring/draft",
	"authoring/refining",
	"exploration/spike",
];

describe("machineActorPhases() — positive control", () => {
	it("enumerates exactly the 6 machine-actor phases documented in docs/task-lifecycle-model.md §3", () => {
		expect(machineActorPhases().sort()).toEqual([...EXPECTED_MACHINE_PHASES].sort());
	});

	it("is derived from src/engine/pipeline.ts's ALL_PIPELINES, not a hand-maintained list", () => {
		const rederived = ALL_PIPELINES.flatMap((p) =>
			p.states.filter((s) => s.actor === "machine").map((s) => `${p.id}/${s.name}`),
		);
		expect(machineActorPhases().sort()).toEqual(rederived.sort());
	});
});

describe("phase-coverage manifest — current, real state (BACK-657.1/.2 scope)", () => {
	it("registers exploration/spike as a skill, resolved to the published exploration-spike skill (BACK-658)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "exploration/spike");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("exploration-spike");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const spike = coverage.find((c) => c.phase === "exploration/spike");
		expect(spike?.covered).toBe(true);
	});

	it("registers execution/ready as a skill, resolved to the published primitive-executor skill (BACK-657.2)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "execution/ready");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("primitive-executor");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const ready = coverage.find((c) => c.phase === "execution/ready");
		expect(ready?.covered).toBe(true);
	});

	it("registers authoring/draft as a skill, resolved to the published authoring-draft skill (BACK-657.4)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "authoring/draft");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("authoring-draft");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const draft = coverage.find((c) => c.phase === "authoring/draft");
		expect(draft?.covered).toBe(true);
	});

	it("registers authoring/refining as a skill, resolved to the published authoring-refining skill (BACK-657.4)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "authoring/refining");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("authoring-refining");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const refining = coverage.find((c) => c.phase === "authoring/refining");
		expect(refining?.covered).toBe(true);
	});

	it("registers execution/decomposing as a skill, resolved to the published epic-decompose skill (BACK-657.3)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "execution/decomposing");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("epic-decompose");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const decomposing = coverage.find((c) => c.phase === "execution/decomposing");
		expect(decomposing?.covered).toBe(true);
	});

	it("registers execution/evaluating as a skill, resolved to the published epic-evaluate skill (BACK-657.3)", () => {
		const manifest = loadPhaseCoverageManifest(REPO_ROOT);
		const entry = manifest.find((e) => e.phase === "execution/evaluating");
		expect(entry).toBeDefined();
		expect(entry?.status).toBe("skill");
		expect(entry?.skill).toBe("epic-evaluate");

		const coverage = computeCoverage(REPO_ROOT, machineActorPhases(), manifest);
		const evaluating = coverage.find((c) => c.phase === "execution/evaluating");
		expect(evaluating?.covered).toBe(true);
	});

	it("leaves zero machine phases uncovered — full coverage achieved across all 6 phases", () => {
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
	// BACK-657.2/.3/.4 have all landed their skills; this assertion now holds for
	// real (no `.failing()` modifier — see the header comment for history).
	it("every machine-actor phase is covered by a published skill or experiment-pending pointer", () => {
		const gaps = uncoveredMachinePhases(REPO_ROOT);
		expect(gaps).toEqual([]);
	});
});

describe("coverage assertion — negative control (proves the gate really fails loud on a gap)", () => {
	it("throws a clear, gap-listing error when a machine phase has no manifest entry", () => {
		const phases = ["execution/ready", "execution/decomposing"];
		const manifest = [{ phase: "execution/ready", status: "skill" as const, skill: "does-not-exist" }];

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

		expect(gaps.map((g) => g.phase)).toEqual(["execution/ready", "execution/decomposing"]);
		expect(() => assertFullCoverage()).toThrow(
			/missing skill\/experiment-pending for: execution\/ready, execution\/decomposing/,
		);
	});

	it("does not false-positive: a phase with a correctly-registered skill IS reported covered", () => {
		// Uses the real fixture under src/test/fixtures/skill-lint/valid-extract, whose
		// contract.json declares phase "execution/ready" — proves computeCoverage can
		// report `covered: true` for a genuinely-matching skill registration, not just
		// gaps (a vacuously-always-failing assertion would be as useless as one that
		// never fails).
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
			expect(["skill", "experiment-pending"]).toContain(entry.status);
		}
	});
});
