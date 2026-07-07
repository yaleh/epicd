/**
 * Phase C — primitive-executor inner-loop root-cause classification (BACK-682 AC#6).
 *
 * `plugin/skills/primitive-executor/SKILL.md` is a prose methodology document, not
 * executable code — so its coverage is a text-content assertion (same pattern as
 * `skill-contracts.test.ts` driving `skill-lint.sh` against real files): it must
 * document the root-cause classification rule (implementation-layer gaps stay in
 * the inner loop; spec/decomposition/goal-layer gaps are thrown outward to
 * `execution/adjudicating`, never patched around), and must literally contain the
 * red-line sentence "只改实现满足 AC,绝不改 AC 适配实现".
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_MD = join(import.meta.dir, "..", "..", "plugin", "skills", "primitive-executor", "SKILL.md");

function readSkill(): string {
	return readFileSync(SKILL_MD, "utf8");
}

describe("primitive-executor SKILL.md — root-cause classification (BACK-682 AC#6)", () => {
	it("contains the literal red-line sentence: 只改实现满足 AC,绝不改 AC 适配实现", () => {
		expect(readSkill()).toContain("只改实现满足 AC,绝不改 AC 适配实现");
	});

	it("documents that implementation-layer DoD-red gaps are fixed in the inner loop", () => {
		const text = readSkill();
		expect(text).toMatch(/implementation/i);
		expect(text).toMatch(/inner loop/i);
	});

	it("documents that spec/decomposition/goal-layer gaps are thrown outward, never patched around", () => {
		const text = readSkill();
		expect(text).toMatch(/spec/i);
		expect(text).toMatch(/decomposition/i);
		expect(text).toMatch(/goal/i);
	});

	it("references execution/adjudicating as the outward-throw destination, not a direct phase edit", () => {
		const text = readSkill();
		expect(text).toContain("adjudicating");
	});

	it("does not claim primitive-executor itself writes retreat_log (write access stays with adjudicating)", () => {
		const text = readSkill();
		expect(text).toMatch(/does not write|never writes|not.*write.*retreat_log/i);
	});
});
