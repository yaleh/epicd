/**
 * epicd-run assets test – BACK-605.8 Phase A
 *
 * Asserts that the copy-first assets from baime's scan-loop.js / loop-backlog
 * skill have landed at their reconciled paths, and that the stale
 * claude-subprocess wiring ("engine run") from BACK-605.1 is gone from the
 * skill directory.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

function expectNonEmptyFile(relPath: string) {
	const fullPath = join(repoRoot, relPath);
	expect(existsSync(fullPath)).toBe(true);
	const contents = readFileSync(fullPath, "utf8");
	expect(contents.length).toBeGreaterThan(0);
}

function collectFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir);
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			files.push(...collectFiles(fullPath));
		} else if (stat.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

function assertNoLiteralStringInDir(dir: string, needle: string) {
	for (const file of collectFiles(dir)) {
		const contents = readFileSync(file, "utf8");
		expect(contents.includes(needle)).toBe(false);
	}
}

describe("epicd-run assets (BACK-605.8 Phase A)", () => {
	it("scan-loop.js exists and is non-empty at plugin/scripts/scan-loop.js", () => {
		expectNonEmptyFile("plugin/scripts/scan-loop.js");
	});

	it("epicd-run SKILL.md exists and is non-empty", () => {
		expectNonEmptyFile(".codex/skills/epicd-run/SKILL.md");
	});

	it("basic-ready.md template exists and is non-empty", () => {
		expectNonEmptyFile(".codex/skills/epicd-run/templates/basic-ready.md");
	});

	it("handle-basic-ready.sh and complete-task.sh exist and are non-empty", () => {
		expectNonEmptyFile("plugin/scripts/handle-basic-ready.sh");
		expectNonEmptyFile("plugin/scripts/complete-task.sh");
	});

	it("does not contain the stale 'engine run' wiring under .codex/skills/epicd-run", () => {
		assertNoLiteralStringInDir(join(repoRoot, ".codex", "skills", "epicd-run"), "engine run");
	});

	it("does not contain the stale 'engine run' wiring under .claude/skills/epicd-run", () => {
		assertNoLiteralStringInDir(join(repoRoot, ".claude", "skills", "epicd-run"), "engine run");
	});
});
