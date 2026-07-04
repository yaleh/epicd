/**
 * epicd-run wiring test – BACK-605.8 Phase C
 *
 * Asserts that:
 *  (a) plugin/scripts/scan-loop.js's board-scanning predicate now shells out
 *      to `engine watch` instead of hardcoding baime's "basic: ready" status
 *      string, while its runtime hardening (---EVENT--- delimiter protocol,
 *      renderEvent templating, edge-triggered notified dedup, EPIPE self-reap,
 *      convergeSingleton single-instance enforcement) survives untouched.
 *  (b) .codex/skills/epicd-run/SKILL.md describes a Monitor-hosted driver and
 *      no longer references the retired claude-subprocess wiring.
 *  (c) .codex/skills/epicd-run/templates/basic-ready.md describes the
 *      worktree + background Agent + .agent-done sentinel + engine complete
 *      flow proven by BACK-609, and no longer references claude --print or
 *      the hardcoded "Basic: Done" status literal.
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

		it("describes hosting a Monitor", () => {
			expect(contents).toContain("Monitor");
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
