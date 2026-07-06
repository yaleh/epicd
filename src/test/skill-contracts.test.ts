/**
 * BACK-657.1 — L1 structural contract lint for epicd phase-execution skills.
 *
 * Exercises `plugin/scripts/skill-lint.sh` (the single implementation of the lint
 * logic — this test drives it via subprocess against fixtures rather than
 * duplicating the validation logic in TypeScript, so there is exactly one place
 * that knows how to validate a skill contract).
 *
 * Scope: structural/portability validation only (L1) — existence of the required
 * frontmatter-equivalent fields and their shape. Provenance *resolvability* rules
 * get their own dedicated coverage in src/test/skill-provenance.test.ts.
 */
import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const LINT = join(ROOT, "plugin", "scripts", "skill-lint.sh");
const FIXTURES = join(import.meta.dir, "fixtures", "skill-lint");

async function runLint(args: string[]): Promise<{ code: number; out: string }> {
	const proc = Bun.spawn(["bash", LINT, ...args], { stdout: "pipe", stderr: "pipe", cwd: ROOT });
	const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
	const code = await proc.exited;
	return { code, out };
}

describe("skill-lint.sh — single-skill mode", () => {
	it("passes a well-formed extract contract", async () => {
		const { code, out } = await runLint([join(FIXTURES, "valid-extract")]);
		expect(code).toBe(0);
		expect(out).toContain("pass:");
	});

	it("passes a well-formed mechanical contract", async () => {
		const { code, out } = await runLint([join(FIXTURES, "valid-mechanical")]);
		expect(code).toBe(0);
		expect(out).toContain("pass:");
	});

	it("passes a well-formed experiment-pending contract", async () => {
		const { code, out } = await runLint([join(FIXTURES, "valid-experiment-pending")]);
		expect(code).toBe(0);
		expect(out).toContain("pass:");
	});

	it("fails hard when contract.json is missing (explicit single-skill ask)", async () => {
		const { code, out } = await runLint([join(FIXTURES, "legacy-no-contract")]);
		expect(code).not.toBe(0);
		expect(out).toContain("no contract.json found");
	});

	it("fails and lists the missing field when a required field is absent", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-missing-field")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/missing\/empty 'provenance'/);
	});

	it("fails on an unrecognized creation_path value", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-bad-creation-path")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/creation_path.*must be one of/);
	});

	it("fails when SKILL.md is missing next to a contract.json", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-no-skill-md")]);
		expect(code).not.toBe(0);
		expect(out).toContain("no SKILL.md found");
	});

	it("fails when SKILL.md invokes a namespaced external skill (runtime-independence)", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-baime-invocation")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/runtime-independence/);
	});

	it("does not flag a documentary citation in SKILL.md prose as an invocation", async () => {
		// valid-extract's SKILL.md prose mentions an external SKILL.md path only as a
		// citation ("Cites its structural paradigm..."), never as an executable
		// step ("/<vendor>:<skill>" syntax) — this must not trip the
		// runtime-independence check.
		const { code, out } = await runLint([join(FIXTURES, "valid-extract")]);
		expect(code).toBe(0);
		expect(out).not.toMatch(/runtime-independence/);
	});
});

describe("skill-lint.sh — --all mode", () => {
	it("passes across a directory of only-valid fixtures", async () => {
		const { code } = await runLint(["--all", join(FIXTURES, "..", "skill-lint-all-valid")]);
		expect(code).toBe(0);
	});

	it("gracefully skips a legacy skill directory with no contract.json instead of failing", async () => {
		const { code, out } = await runLint(["--all", FIXTURES]);
		// FIXTURES contains legacy-no-contract (skip) alongside several invalid-* dirs
		// (real failures) — assert the skip is reported distinctly from a failure.
		expect(out).toContain("skip: legacy-no-contract (no contract.json — legacy/non-participating skill)");
		expect(code).not.toBe(0); // the invalid-* fixtures in this same dir are real failures
	});

	it("is green against the repo's real plugin/skills — all 5 legacy skills skip gracefully", async () => {
		const { code, out } = await runLint(["--all"]);
		expect(code).toBe(0);
		for (const legacy of ["inbox", "init", "promote", "propose", "run"]) {
			expect(out).toContain(`skip: ${legacy}`);
		}
	});
});
