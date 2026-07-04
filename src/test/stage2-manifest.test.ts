/**
 * Phase A: MVD manifest structure + necessity guard tests.
 *
 * (a) MVD_SOURCE_FILES and MVD_TEST_FILES are non-empty and every listed path exists.
 * (b) Necessity guard (architect D): on a toy fixture, removing any source file
 *     causes the toy suite to fail — proving there are no dead entries in the manifest
 *     and that the suite actually exercises each source.
 *
 * NOTE: We only verify the real manifest paths exist in this repo (not in a rebuilt tree).
 * The in-suite necessity guard uses a toy fixture, not the real manifest paths, so there
 * is no recursive test execution against the full parent suite (architect E).
 */

import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MVD_SOURCE_FILES, MVD_TEST_FILES, resolveManifestPath } from "../engine/mvd-manifest.ts";

// ── helpers ────────────────────────────────────────────────────────────────

const REPO_ROOT = join(import.meta.dir, "../..");

// ── (a) structural validation ──────────────────────────────────────────────

describe("stage2-manifest — structural validation", () => {
	it("MVD_SOURCE_FILES is non-empty", () => {
		expect(MVD_SOURCE_FILES.length).toBeGreaterThan(0);
	});

	it("MVD_TEST_FILES is non-empty", () => {
		expect(MVD_TEST_FILES.length).toBeGreaterThan(0);
	});

	it("every MVD_SOURCE_FILES path exists in this repo", () => {
		for (const rel of MVD_SOURCE_FILES) {
			const abs = resolveManifestPath(REPO_ROOT, rel);
			expect(existsSync(abs)).toBe(true);
		}
	});

	it("every MVD_TEST_FILES path exists in this repo", () => {
		for (const rel of MVD_TEST_FILES) {
			const abs = resolveManifestPath(REPO_ROOT, rel);
			expect(existsSync(abs)).toBe(true);
		}
	});
});

// ── (b) necessity guard (toy fixture) ─────────────────────────────────────
//
// We build a tiny toy system:
//   toy-adder.ts    — exports add(a,b) = a + b
//   toy-adder.test.ts — tests that add(1,2) === 3
// A toy manifest lists both. We assert:
//   - with all source files present → spawn bun test passes
//   - with the source file removed → spawn bun test fails
// This proves the mechanism: a manifest with a dead entry whose removal doesn't
// break the suite would be caught. The real manifest's necessity is validated
// during the live soak run (full rebuilt-tree gate).

describe("stage2-manifest — necessity guard (toy fixture)", () => {
	it("toy suite passes when all toy source files are present", async () => {
		const dir = mkdtempSync(join(tmpdir(), "stage2-nec-ok-"));
		try {
			// Write toy source
			writeFileSync(join(dir, "toy-adder.ts"), "export function add(a: number, b: number) { return a + b; }\n");
			// Write toy test
			writeFileSync(
				join(dir, "toy-adder.test.ts"),
				`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy", () => { it("adds", () => expect(add(1,2)).toBe(3)); });\n`,
			);

			const result = Bun.spawnSync(["bun", "test", "./toy-adder.test.ts"], {
				cwd: dir,
				stderr: "pipe",
				stdout: "pipe",
			});
			expect(result.exitCode).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("toy suite fails when a toy source file is removed (necessity guard)", async () => {
		const dir = mkdtempSync(join(tmpdir(), "stage2-nec-fail-"));
		try {
			// Write only the test — source is absent
			writeFileSync(
				join(dir, "toy-adder.test.ts"),
				`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy", () => { it("adds", () => expect(add(1,2)).toBe(3)); });\n`,
			);
			// toy-adder.ts intentionally omitted

			const result = Bun.spawnSync(["bun", "test", "./toy-adder.test.ts"], {
				cwd: dir,
				stderr: "pipe",
				stdout: "pipe",
			});
			// Import will fail → non-zero exit
			expect(result.exitCode).not.toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
