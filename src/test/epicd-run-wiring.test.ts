/**
 * epicd-run wiring test – BACK-614 (crystallization norm); flipped by BACK-625 / ADR-015.
 *
 * Asserts that:
 *  (a) plugin/scripts/scan-loop.cjs is PURE TRANSPORT: it reads the engine's scan
 *      lines and dispatch payload (never a template), while its runtime hardening
 *      (---EVENT--- delimiter protocol, edge-triggered notified dedup, EPIPE self-reap,
 *      convergeSingleton single-instance enforcement) survives. It no longer authors
 *      instruction text — renderEvent / resolveTemplatesDir / template-dir reads are gone.
 *  (b) .codex/skills/epicd-run/SKILL.md is the baime-minimal form: a SINGLE persistent
 *      Monitor calling scan-loop.cjs (a script — NOT inline bash), with no `while true`
 *      loop, no `engine scan --once` carving, and no retired claude-subprocess wiring.
 *  (c) The basic-ready dispatch payload is authored by the ENGINE (src/engine/dispatch.ts),
 *      not the .codex template: the engine block describes the worktree + background Agent +
 *      .agent-done sentinel + engine complete flow, and the template file is retired as the
 *      dispatch authority (BACK-625 / ADR-015 D3).
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

function read(relPath: string): string {
	return readFileSync(join(repoRoot, relPath), "utf8");
}

describe("epicd-run wiring (BACK-625 / ADR-015)", () => {
	describe("plugin/scripts/scan-loop.cjs — pure transport", () => {
		const contents = read("plugin/scripts/scan-loop.cjs");

		it("routes to the engine CLI through a single invocation seam (runEngineCli)", () => {
			expect(contents).toContain("runEngineCli");
			expect(contents).toContain("engineCliCommand(repoRoot) + ' ' + args");
		});

		it("resolves the engine CLI command portably (EPICD_ENGINE_CMD override, no hardcoded absolute repo path)", () => {
			expect(contents).toContain("EPICD_ENGINE_CMD");
			expect(contents).toContain("function engineCliCommand(repoRoot)");
		});

		it("uses `engine scan --once` as its scan (dedup) source", () => {
			expect(contents).toContain("scan --once");
		});

		it("fetches the basic-ready payload via `engine dispatch <id>` (engine authors it)", () => {
			expect(contents).toContain("dispatch ' + id");
		});

		it("no longer hardcodes baime's 'basic: ready' status predicate literal", () => {
			expect(contents.toLowerCase()).not.toContain("basic: ready");
		});

		it("preserves the ---EVENT--- delimiter protocol (transport framing is the adapter's job)", () => {
			expect(contents).toContain("---EVENT---");
		});

		it("no longer authors instruction text: renderEvent is gone", () => {
			expect(contents).not.toContain("renderEvent");
		});

		it("no longer reads a template directory: resolveTemplatesDir / templatesDir / --templates-dir are gone", () => {
			expect(contents).not.toContain("resolveTemplatesDir");
			expect(contents).not.toContain("templatesDir");
			expect(contents).not.toContain("--templates-dir");
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

		it("calls scan-loop.cjs as a single script (not inline bash)", () => {
			expect(body).toContain("scan-loop.cjs --loop");
		});

		it("does NOT wrap the Monitor in an inline bash loop (crystallization norm)", () => {
			expect(body).not.toContain("while true");
		});

		it("does NOT carve `engine scan --once` into the skill (that lives in scan-loop.cjs)", () => {
			expect(body).not.toContain("engine scan --once");
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

	describe("src/engine/dispatch.ts — the basic-ready dispatch authority", () => {
		const contents = read("src/engine/dispatch.ts");

		it("emits the machine key as the first payload line (basic-ready:<id>)", () => {
			expect(contents).toContain("basic-ready:");
		});

		it("describes the worktree + background Agent + .agent-done sentinel + engine complete flow", () => {
			expect(contents).toContain("handle-basic-ready.sh");
			expect(contents).toContain("Agent(run_in_background=true)");
			expect(contents).toContain(".agent-done-");
			expect(contents).toContain("engine complete");
		});

		it("keeps the BACK-619 board-file exclusion in the commit guidance", () => {
			expect(contents).toMatch(/:!backlog\/tasks|:\(exclude\)backlog\/tasks/);
		});

		it("does not reference `claude --print`", () => {
			expect(contents).not.toContain("claude --print");
		});

		it("is distribution-agnostic: authors the payload in-code, no template file read", () => {
			// No filesystem read and no __dirname-relative path lookup — the payload is a
			// compiled-in template literal (prose mentions of the words are fine; usage is not).
			expect(contents).not.toContain("readFileSync");
			expect(contents).not.toContain("readFile(");
			expect(contents).not.toContain("path.join(__dirname");
		});
	});

	describe(".codex/skills/epicd-run/templates/basic-ready.md — retired", () => {
		const contents = read(".codex/skills/epicd-run/templates/basic-ready.md");

		it("is no longer the dispatch authority (no substitution tokens)", () => {
			expect(contents).not.toContain("__TASK_ID__");
			expect(contents).not.toContain("__TASK_TITLE__");
		});

		it("points at the engine as the current authority", () => {
			expect(contents).toContain("engine dispatch");
		});
	});
});
