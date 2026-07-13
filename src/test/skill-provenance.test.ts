/**
 * BACK-657.1 — provenance gate: every registered skill must declare a `provenance`
 * that is resolvable in the way appropriate to its `creation_path` (see
 * plugin/skills/README.md):
 *
 *   - extract              -> a repo-relative path that exists on disk
 *   - mechanical            -> the exact literal sentinel "mechanical: no methodology"
 *   - experiment-pending    -> a task id that resolves to a real task file under
 *                              the repo's board tasks directory (backlog/tasks/,
 *                              .backlog/tasks/, or .epicd/tasks/ — whichever exists)
 *
 * This is the rule that distinguishes "an experiment actually converged this
 * methodology" from "someone hand-wrote a skill and a structural lint let it
 * through" (BACK-657's core discipline). The validation logic lives in
 * plugin/scripts/skill-lint.sh (single implementation, see skill-contracts.test.ts);
 * this file exercises specifically its provenance branch, with fixtures built to
 * hit each pass/fail path.
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

describe("provenance — creation_path: extract", () => {
	it("passes when provenance resolves to a real file on disk", async () => {
		const { code } = await runLint([join(FIXTURES, "valid-extract")]);
		expect(code).toBe(0);
	});

	it("fails when provenance does not resolve to anything on disk", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-extract-unresolvable")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/does not resolve to a file\/dir on disk/);
	});

	it("fails when provenance is the mechanical sentinel (extract must cite a real experiment)", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-extract-mechanical-sentinel")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/must not be the mechanical sentinel/);
	});
});

describe("provenance — creation_path: mechanical", () => {
	it("passes when provenance is exactly the 'no methodology' sentinel", async () => {
		const { code } = await runLint([join(FIXTURES, "valid-mechanical")]);
		expect(code).toBe(0);
	});

	it("fails when provenance is a different string claiming 'no methodology' informally", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-mechanical-wrong-sentinel")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/must be exactly 'mechanical: no methodology'/);
	});
});

describe("provenance — creation_path: experiment-pending", () => {
	it("passes when the pointer resolves to a real task file under the board tasks directory", async () => {
		const { code } = await runLint([join(FIXTURES, "valid-experiment-pending")]);
		expect(code).toBe(0);
	});

	it("fails when the pointer does not resolve to any task file", async () => {
		const { code, out } = await runLint([join(FIXTURES, "invalid-experiment-pending-bogus")]);
		expect(code).not.toBe(0);
		expect(out).toMatch(/does not resolve to a task file under \.?[a-zA-Z]*\/tasks/);
	});
});
