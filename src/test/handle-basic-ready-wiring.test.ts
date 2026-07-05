/**
 * BACK-620 — handle-basic-ready.sh must claim tasks through the repo's own
 * dev CLI (`bun run cli`), not the bare `backlog` binary resolved off $PATH.
 *
 * The bare `backlog` binary can resolve to a stale globally installed npm
 * package whose frontmatter schema doesn't know about engine structural
 * fields (pipeline_id, phase, parent_id, dod) — it silently drops them on
 * rewrite. Pinning the claim call to the repo's dev CLI removes that
 * version-skew hazard structurally.
 */

import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "..", "..", "plugin", "scripts", "handle-basic-ready.sh");

describe("handle-basic-ready.sh — claim invocation wiring (BACK-620)", () => {
	it("invokes the repo's own dev CLI (src/cli.ts) for the claim edit", async () => {
		const script = await readFile(SCRIPT_PATH, "utf8");

		expect(script).toMatch(/bun\s+"\$CLI_JS"\s+task edit/);
		expect(script).toMatch(/CLI_JS=.*src\/cli\.ts/);
	});

	it("does not invoke the bare `backlog` binary from $PATH for the claim edit", async () => {
		const script = await readFile(SCRIPT_PATH, "utf8");

		expect(/\bbacklog task edit\b/.test(script)).toBe(false);
	});
});
