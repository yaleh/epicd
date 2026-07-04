/**
 * no-claude-subprocess test — BACK-605.8 Phase D
 *
 * Asserts the retired claude-subprocess spawn primitive (a `Bun.spawn` call that
 * launched the `claude` CLI, formerly `realSpawnPrimitive` in
 * src/harness/real-primitives.ts) is fully gone from the repo, while the engine's
 * "tail" primitives (completeTask, gitMergeBranch) — still used by `engine complete`
 * and by BACK-609's proven pattern — remain exported.
 */

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { completeTask } from "../engine/complete.ts";
import { gitMergeBranch } from "../harness/real-primitives.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const srcDir = join(repoRoot, "src");

// Assembled from parts so this file's own source never contains a literal match
// for the pattern it's checking for (the repo-wide DoD grep must find zero hits,
// including in this file). Detects a bracketed/quoted spawn argument naming the
// retired CLI, in either single- or double-quote style.
const AGENT_CLI_NAME = ["cl", "aude"].join("");
const CLAUDE_SPAWN_RE = new RegExp(`spawn\\(\\[?["']${AGENT_CLI_NAME}`);

function collectFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			files.push(...collectFiles(fullPath));
		} else {
			files.push(fullPath);
		}
	}
	return files;
}

describe("no-claude-subprocess: claude-subprocess spawn primitive is fully retired", () => {
	it("no file under src/ contains the retired subprocess spawn call", () => {
		const offenders: string[] = [];
		for (const file of collectFiles(srcDir)) {
			const contents = readFileSync(file, "utf8");
			if (CLAUDE_SPAWN_RE.test(contents)) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("src/harness/real-primitives.ts has no retired subprocess spawn call left", () => {
		const contents = readFileSync(join(srcDir, "harness", "real-primitives.ts"), "utf8");
		expect(CLAUDE_SPAWN_RE.test(contents)).toBe(false);
	});

	it("completeTask is still exported as a function (tail survives)", () => {
		expect(typeof completeTask).toBe("function");
	});

	it("gitMergeBranch is still exported as a function (tail survives)", () => {
		expect(typeof gitMergeBranch).toBe("function");
	});
});
