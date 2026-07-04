/**
 * epicd-run wiring test – BACK-614 (crystallization norm; was BACK-605.8 Phase C)
 *
 * Asserts that:
 *  (a) plugin/scripts/scan-loop.js's board-scanning predicate reads `engine
 *      watch`'s machine lines instead of hardcoding baime's "basic: ready"
 *      status string, while its runtime hardening (---EVENT--- delimiter
 *      protocol, renderEvent templating, edge-triggered notified dedup, EPIPE
 *      self-reap, convergeSingleton single-instance enforcement) survives.
 *  (b) .codex/skills/epicd-run/SKILL.md is the baime-minimal form: a SINGLE
 *      persistent Monitor calling scan-loop.js (a script — NOT inline bash),
 *      with no `while true` loop, no `engine watch --once` carving, and no
 *      retired claude-subprocess wiring.
 *  (c) .codex/skills/epicd-run/templates/basic-ready.md describes the
 *      worktree + background Agent + .agent-done sentinel + engine complete
 *      flow, and no longer references claude --print or a hardcoded status
 *      literal.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

function read(relPath: string): string {
	return readFileSync(join(repoRoot, relPath), "utf8");
}

describe("epicd-run wiring (BACK-605.8 Phase C)", () => {
	describe("plugin/scripts/scan-loop.js", () => {
		const contents = read("plugin/scripts/scan-loop.js");

		it("shells out to `engine watch` as its scan source", () => {
			expect(contents).toContain("engine watch");
		});

		it("no longer hardcodes baime's 'basic: ready' status predicate literal", () => {
			expect(contents.toLowerCase()).not.toContain("basic: ready");
		});

		it("preserves the ---EVENT--- delimiter protocol", () => {
			expect(contents).toContain("---EVENT---");
		});

		it("preserves renderEvent templating", () => {
			expect(contents).toContain("renderEvent");
		});

		it("preserves edge-triggered notified dedup", () => {
			expect(contents).toContain("notified");
		});

		it("preserves EPIPE self-reap", () => {
			expect(contents).toContain("EPIPE");
		});

		it("preserves convergeSingleton single-instance enforcement", () => {
			expect(contents).toContain("convergeSingleton");
		});
	});

	describe(".codex/skills/epicd-run/SKILL.md", () => {
		const contents = read(".codex/skills/epicd-run/SKILL.md");
		// The crystallization norm applies to the instruction BODY. The frontmatter
		// `contracts:` block legitimately names the forbidden tokens (as not-grep
		// declarations), so not-contain checks must run against the body only.
		const body = contents
			.split(/^---\s*$/m)
			.slice(2)
			.join("---");

		it("arms a persistent Monitor", () => {
			expect(body).toContain("Monitor(persistent=true");
		});

		it("calls scan-loop.js as a single script (not inline bash)", () => {
			expect(body).toContain("scan-loop.js --loop");
		});

		it("does NOT wrap the Monitor in an inline bash loop (crystallization norm)", () => {
			expect(body).not.toContain("while true");
		});

		it("does NOT carve `engine watch --once` into the skill (that lives in scan-loop.js)", () => {
			expect(body).not.toContain("engine watch --once");
		});

		it("declares allowed-tools: Monitor", () => {
			expect(contents).toContain("allowed-tools: Monitor");
		});

		it("does not reference the retired `engine run` wiring", () => {
			expect(contents).not.toContain("engine run");
		});

		it("does not reference realSpawnPrimitive", () => {
			expect(contents).not.toContain("realSpawnPrimitive");
		});

		it("does not reference `claude --print`", () => {
			expect(contents).not.toContain("claude --print");
		});
	});

	describe(".codex/skills/epicd-run/templates/basic-ready.md", () => {
		const contents = read(".codex/skills/epicd-run/templates/basic-ready.md");

		it("describes the worktree step", () => {
			expect(contents).toContain("worktree");
		});

		it("describes spawning a background Agent", () => {
			expect(contents).toContain("Agent");
		});

		it("describes the engine complete handoff", () => {
			expect(contents).toContain("engine complete");
		});

		it("describes waiting for the .agent-done sentinel", () => {
			expect(contents).toContain(".agent-done");
		});

		it("does not reference `claude --print`", () => {
			expect(contents).not.toContain("claude --print");
		});

		it("does not hardcode the literal 'Basic: Done' status", () => {
			expect(contents).not.toContain("Basic: Done");
		});
	});
});
