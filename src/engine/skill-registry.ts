/**
 * (pipeline_id, phase) -> skill registry (BACK-657.1).
 *
 * Single source of truth: `plugin/skills/phase-coverage.json` — the SAME manifest
 * file serves both `src/test/phase-skill-coverage.test.ts` (today) and the future
 * monitor runtime (BACK-660, dispatch-time skill injection). Do not add a second
 * manifest — extend that one file.
 *
 * This module only reads data (the manifest, `ALL_PIPELINES`, and skill
 * `contract.json` files) — it does not implement the contract *lint* itself
 * (that is `plugin/scripts/skill-lint.sh`, the single implementation of the L1
 * structural gate). This module answers a different question: "which machine
 * phases are covered, and by what?" — the L2 coverage question, not the L1
 * contract-shape question.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_PIPELINES } from "./pipeline";

/**
 * `mechanical` (BACK-686.2): the phase is resolved by an in-tick script call
 * (`kind: "script"`), never a dispatched skill — there is no `plugin/skills/<name>`
 * to resolve against, so it is trivially covered.
 */
export type CoverageStatus = "skill" | "experiment-pending" | "mechanical";

/**
 * Actor-fidelity subdivision of a machine-actor phase (BACK-686.2 proposal §11.3
 * child B): `skill` — dispatch spawns a fresh session; `script` — a mechanical
 * in-tick function call, never dispatched (no spawn cost); `gate` — a mechanical
 * check runs first, only escalating to a `skill` dispatch on the non-trivial path.
 */
export type CoverageKind = "skill" | "script" | "gate";

export interface ManifestEntry {
	phase: string; // "<pipeline_id>/<phase_name>"
	status: CoverageStatus;
	/** Present when status === "experiment-pending": a task id, e.g. "BACK-658". */
	pointer?: string;
	/** Present when status === "skill": the skill directory name under plugin/skills/. */
	skill?: string;
	/** BACK-686.2: every entry declares exactly one kind. */
	kind?: CoverageKind;
}

interface RawManifest {
	entries?: ManifestEntry[];
}

/** The literal sentinel `contract.json` must use for `provenance` when `creation_path` is "mechanical". */
export const MECHANICAL_PROVENANCE_SENTINEL = "mechanical: no methodology";

export function manifestPath(repoRoot: string): string {
	return join(repoRoot, "plugin", "skills", "phase-coverage.json");
}

/** Loads the (pipeline_id, phase) -> skill registry manifest. Empty entries if the file is missing. */
export function loadPhaseCoverageManifest(repoRoot: string): ManifestEntry[] {
	const path = manifestPath(repoRoot);
	if (!existsSync(path)) return [];
	const raw = JSON.parse(readFileSync(path, "utf8")) as RawManifest;
	return raw.entries ?? [];
}

/** Every `<pipeline_id>/<phase_name>` phase whose `actor` is `"machine"`, across all declared pipelines. */
export function machineActorPhases(): string[] {
	return ALL_PIPELINES.flatMap((p) => p.states.filter((s) => s.actor === "machine").map((s) => `${p.id}/${s.name}`));
}

/** True when `taskId` (e.g. "BACK-658") resolves to a real task file under backlog/tasks/. */
export function taskFileExists(repoRoot: string, taskId: string): boolean {
	const match = /^([A-Za-z]+-\d+(?:\.\d+)*)/.exec(taskId.trim());
	const id = match?.[1];
	if (!id) return false;
	const slug = id.toLowerCase();
	const tasksDir = join(repoRoot, "backlog", "tasks");
	if (!existsSync(tasksDir)) return false;
	return readdirSync(tasksDir).some((f) => f.toLowerCase().startsWith(`${slug} - `));
}

/** True when a skill directory `plugin/skills/<name>/contract.json` exists and declares this exact `phase`. */
export function skillRegisteredForPhase(repoRoot: string, skillName: string, phase: string): boolean {
	const contractFile = join(repoRoot, "plugin", "skills", skillName, "contract.json");
	if (!existsSync(contractFile)) return false;
	try {
		const contract = JSON.parse(readFileSync(contractFile, "utf8")) as { phase?: string };
		return contract.phase === phase;
	} catch {
		return false;
	}
}

export interface PhaseCoverage {
	phase: string;
	covered: boolean;
	status?: CoverageStatus;
	detail: string;
}

/**
 * Computes coverage for a given set of machine phases against a given manifest,
 * resolving pointers/skills against `repoRoot`. Pure w.r.t. its inputs except for
 * the two on-disk resolvability lookups (`taskFileExists` / `skillRegisteredForPhase`),
 * which are themselves pure functions of `repoRoot` — this is what lets the coverage
 * test run the SAME logic against both the real repo state and fixture manifests
 * (see phase-skill-coverage.test.ts's negative-control test).
 */
export function computeCoverage(repoRoot: string, phases: string[], manifest: ManifestEntry[]): PhaseCoverage[] {
	const byPhase = new Map(manifest.map((e) => [e.phase, e]));
	return phases.map((phase) => {
		const entry = byPhase.get(phase);
		if (!entry) {
			return { phase, covered: false, detail: "no manifest entry — neither a registered skill nor experiment-pending" };
		}
		if (entry.status === "experiment-pending") {
			const resolved = !!entry.pointer && taskFileExists(repoRoot, entry.pointer);
			return {
				phase,
				covered: resolved,
				status: "experiment-pending",
				detail: resolved
					? `experiment-pending -> ${entry.pointer}`
					: `experiment-pending pointer "${entry.pointer ?? ""}" does not resolve to a real task file`,
			};
		}
		if (entry.status === "mechanical") {
			// kind: "script" — resolved by an in-tick function call, never a dispatched
			// skill (BACK-686.2 AC#2) — nothing to resolve on disk, trivially covered.
			return { phase, covered: true, status: "mechanical", detail: "mechanical -> in-tick script (no skill dispatch)" };
		}
		// status === "skill"
		const resolved = !!entry.skill && skillRegisteredForPhase(repoRoot, entry.skill, phase);
		return {
			phase,
			covered: resolved,
			status: "skill",
			detail: resolved
				? `skill -> plugin/skills/${entry.skill}`
				: `manifest names skill "${entry.skill ?? ""}" but its contract.json is missing or declares a different phase`,
		};
	});
}

/** BACK-686.2 AC#6: the declared `kind` for a `<pipeline_id>/<phase_name>` phase, or `undefined` if unregistered. */
export function kindForPhase(repoRoot: string, phase: string): CoverageKind | undefined {
	return loadPhaseCoverageManifest(repoRoot).find((e) => e.phase === phase)?.kind;
}

/** Convenience: the list of currently-uncovered machine-actor phases in the real repo at `repoRoot`. */
export function uncoveredMachinePhases(repoRoot: string): string[] {
	const manifest = loadPhaseCoverageManifest(repoRoot);
	return computeCoverage(repoRoot, machineActorPhases(), manifest)
		.filter((c) => !c.covered)
		.map((c) => c.phase);
}
