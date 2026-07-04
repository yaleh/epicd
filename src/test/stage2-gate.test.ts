/**
 * Phase B: stage2 gate runner — anti-stub self-proof using toy fixtures.
 *
 * All four distinguishable states are tested against minimal toy repos
 * (not the real MVD manifest, to avoid recursive parent-suite execution — architect E).
 *
 * Toy layout (written to temp dirs):
 *   toy-adder.ts        — export function add(a, b) { return a + b; }
 *   toy-adder.test.ts   — verifies add(1,2)===3  (unit suite)
 *   toy-tracer.test.ts  — simulates "driver drives tracer to fixpoint" (drives inline)
 *
 * Gate states asserted:
 *   good          → { passed: true }
 *   broken-unit   → { passed: false, reason: "suite-failed" }
 *   broken-drive  → { passed: false, reason: "drive-failed" }   ← crux C fixture
 *   incomplete    → { passed: false, reason: "missing-source" }
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStage2Fixpoint } from "../harness/stage2-gate.ts";

// ── toy fixture builder ────────────────────────────────────────────────────

function buildToyGoodRepo(dir: string): void {
	// Source: a function that works
	writeFileSync(join(dir, "toy-adder.ts"), "export function add(a: number, b: number) { return a + b; }\n");
	// Unit test: passes when source is present and correct
	writeFileSync(
		join(dir, "toy-adder.test.ts"),
		`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy-unit", () => { it("adds", () => expect(add(1,2)).toBe(3)); });\n`,
	);
	// Tracer-drive test: simulates "driver drives tracer to fixpoint" inline
	// The "driver" here just calls add iteratively until a sum threshold — trivial,
	// but captures the self-application pattern (runs inside the rebuilt tree).
	writeFileSync(
		join(dir, "toy-tracer.test.ts"),
		`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy-tracer-drive", () => {\n  it("driver drives tracer to fixpoint", () => {\n    let v = 0;\n    for (let i = 0; i < 5; i++) v = add(v, 1);\n    expect(v).toBe(5); // fixpoint: 5 ticks\n  });\n});\n`,
	);
}

function buildToyBrokenUnitRepo(dir: string): void {
	// Source: function returns wrong value (unit test will fail)
	writeFileSync(join(dir, "toy-adder.ts"), "export function add(a: number, b: number) { return a - b; } // broken\n");
	writeFileSync(
		join(dir, "toy-adder.test.ts"),
		`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy-unit", () => { it("adds", () => expect(add(1,2)).toBe(3)); });\n`,
	);
	writeFileSync(
		join(dir, "toy-tracer.test.ts"),
		`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy-tracer-drive", () => {\n  it("driver drives tracer to fixpoint", () => {\n    let v = 0;\n    for (let i = 0; i < 5; i++) v = add(v, 1);\n    expect(v).toBe(5);\n  });\n});\n`,
	);
}

function buildToyBrokenDriveRepo(dir: string): void {
	// Source: add() works correctly (unit test will PASS)
	writeFileSync(join(dir, "toy-adder.ts"), "export function add(a: number, b: number) { return a + b; }\n");
	// Unit test: passes (add is correct)
	writeFileSync(
		join(dir, "toy-adder.test.ts"),
		`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy-unit", () => { it("adds", () => expect(add(1,2)).toBe(3)); });\n`,
	);
	// Tracer-drive test: driver logic is broken — it never reaches fixpoint
	// (loop runs 0 iterations because the "driver" condition is wrong)
	writeFileSync(
		join(dir, "toy-tracer.test.ts"),
		`import { describe, expect, it } from "bun:test";\nimport { add } from "./toy-adder.ts";\ndescribe("toy-tracer-drive", () => {\n  it("driver drives tracer to fixpoint", () => {\n    // broken: loop condition inverted, driver never advances\n    let v = 0;\n    for (let i = 0; i > 5; i++) v = add(v, 1); // i > 5 never true\n    expect(v).toBe(5); // fails: v is still 0\n  });\n});\n`,
	);
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("stage2-gate — four-state self-proof (toy fixtures)", () => {
	it("good: passes all checks → { passed: true }", async () => {
		const dir = mkdtempSync(join(tmpdir(), "s2-good-"));
		try {
			buildToyGoodRepo(dir);
			const result = await runStage2Fixpoint({
				rebuiltRepoPath: dir,
				sourceFiles: ["toy-adder.ts"],
				testFiles: ["./toy-adder.test.ts"],
				tracerEntry: "./toy-tracer.test.ts",
			});
			expect(result.passed).toBe(true);
			expect(result.reason).toBeUndefined();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("broken-unit: unit suite fails → { passed: false, reason: 'suite-failed' }", async () => {
		const dir = mkdtempSync(join(tmpdir(), "s2-broken-unit-"));
		try {
			buildToyBrokenUnitRepo(dir);
			const result = await runStage2Fixpoint({
				rebuiltRepoPath: dir,
				sourceFiles: ["toy-adder.ts"],
				testFiles: ["./toy-adder.test.ts"],
				tracerEntry: "./toy-tracer.test.ts",
			});
			expect(result.passed).toBe(false);
			expect(result.reason).toBe("suite-failed");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("broken-drive (crux C): unit passes but driver can't drive → { passed: false, reason: 'drive-failed' }", async () => {
		const dir = mkdtempSync(join(tmpdir(), "s2-broken-drive-"));
		try {
			buildToyBrokenDriveRepo(dir);
			const result = await runStage2Fixpoint({
				rebuiltRepoPath: dir,
				sourceFiles: ["toy-adder.ts"],
				testFiles: ["./toy-adder.test.ts"],
				tracerEntry: "./toy-tracer.test.ts",
			});
			expect(result.passed).toBe(false);
			expect(result.reason).toBe("drive-failed");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("incomplete: missing source file → { passed: false, reason: 'missing-source' }", async () => {
		const dir = mkdtempSync(join(tmpdir(), "s2-incomplete-"));
		try {
			// Only write the tests, not the source
			writeFileSync(
				join(dir, "toy-adder.test.ts"),
				`import { describe, expect, it } from "bun:test";\ndescribe("t", () => { it("x", () => expect(1).toBe(1)); });\n`,
			);
			// toy-adder.ts intentionally absent
			const result = await runStage2Fixpoint({
				rebuiltRepoPath: dir,
				sourceFiles: ["toy-adder.ts"], // <-- missing
				testFiles: ["./toy-adder.test.ts"],
				tracerEntry: "./toy-adder.test.ts",
			});
			expect(result.passed).toBe(false);
			expect(result.reason).toBe("missing-source");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
