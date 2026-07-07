/**
 * BACK-620 — handle-basic-ready.sh must prefer the repo's own dev CLI
 * (`bun src/cli.ts`) over the bare `backlog` binary resolved off $PATH,
 * whenever that dev CLI source tree is actually present alongside the
 * script (epicd dogfooding itself, or a test fixture pointed at it).
 *
 * The bare `backlog` binary can resolve to a stale globally installed npm
 * package whose frontmatter schema doesn't know about engine structural
 * fields (pipeline_id, phase, parent_id, dod) — it silently drops them on
 * rewrite. Preferring the dev CLI removes that version-skew hazard.
 *
 * BACK-605.9 M1 made the resolution portable (EPICD_CLI_CMD override ->
 * dev-tree detection -> `backlog` fallback) so the script also works when
 * shipped standalone inside the epicd Claude Code plugin, with no epicd
 * source tree present at all. This test was updated accordingly.
 */

import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "..", "..", "plugin", "scripts", "handle-basic-ready.sh");

describe("handle-basic-ready.sh — claim invocation wiring (BACK-620)", () => {
	it("prefers the repo's own dev CLI (src/cli.ts) for the claim edit, via CLI_CMD resolution", async () => {
		const script = await readFile(SCRIPT_PATH, "utf8");

		expect(script).toMatch(/DEV_CLI_JS=.*src\/cli\.ts/);
		expect(script).toMatch(/CLI_CMD="bun \$DEV_CLI_JS"/);
		expect(script).toMatch(/\$CLI_CMD task edit/);
	});

	it("supports an EPICD_CLI_CMD override and falls back to bare `epicd` only when no dev CLI is present", async () => {
		const script = await readFile(SCRIPT_PATH, "utf8");

		expect(script).toContain("EPICD_CLI_CMD");
		expect(script).toMatch(/CLI_CMD="epicd"/);
		expect(/\bepicd task edit\b/.test(script)).toBe(false);
	});
});
