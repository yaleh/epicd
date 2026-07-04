/**
 * Phase B — Cutover with loop-backlog preserved
 *
 * Asserts:
 *   1. The engine self-drive configuration is enabled in backlog/config.yml.
 *   2. The legacy loop-backlog skill file still exists (fallback preserved).
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Locate the repo root by walking up from this file's directory. */
function repoRoot(): string {
	// __dirname is src/test, so two levels up is the repo root
	return join(import.meta.dirname, "..", "..");
}

describe("engine-cutover — self-drive enabled + loop-backlog preserved", () => {
	it("backlog/config.yml sets engine_self_drive: true", async () => {
		const configPath = join(repoRoot(), "backlog", "config.yml");
		expect(existsSync(configPath)).toBe(true);

		const content = await readFile(configPath, "utf-8");
		expect(content).toContain("engine_self_drive: true");
	});

	it("backlog/config.yml names loop-backlog as the fallback skill", async () => {
		const configPath = join(repoRoot(), "backlog", "config.yml");
		const content = await readFile(configPath, "utf-8");
		expect(content).toContain("loop-backlog");
	});

	it("loop-backlog skill file still exists (fallback not deleted)", () => {
		const root = repoRoot();

		// Search for any file/directory whose name contains 'loop-backlog'
		function findLoopBacklog(dir: string, depth = 0): string | null {
			if (depth > 4) return null;
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.name === "node_modules") continue;
				if (entry.name.toLowerCase().includes("loop-backlog")) {
					return join(dir, entry.name);
				}
				if (entry.isDirectory()) {
					const found = findLoopBacklog(join(dir, entry.name), depth + 1);
					if (found) return found;
				}
			}
			return null;
		}

		const found = findLoopBacklog(root);
		expect(found).not.toBeNull();
	});

	it("engine src modules are all present (no missing files)", () => {
		const engineDir = join(repoRoot(), "src", "engine");
		const required = ["driver.ts", "interpreter.ts", "pipeline.ts", "complete.ts", "safety.ts", "sandbox.ts"];
		for (const f of required) {
			expect(existsSync(join(engineDir, f))).toBe(true);
		}
	});
});
