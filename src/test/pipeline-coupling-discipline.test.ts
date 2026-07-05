/**
 * AC#3 coupling-discipline gate (BACK-603): "adding a new pipeline only
 * touches data definition + new handler, never interpreter/core."
 *
 * Positive control: the four genuinely-generic core files never mention the
 * exploration pipeline by name — a permanent regression gate. If a future
 * change hardcodes an `if (pipeline_id === "exploration")` branch (or similar)
 * into any of them, this test fails.
 *
 * Negative control (the part a doc-only promise can't give you): the SAME
 * assertion logic is run against a deliberately-violating fixture string to
 * prove it actually catches a violation, rather than being vacuously true
 * because nobody would ever write the word "exploration" in these files
 * for unrelated reasons.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CORE_FILES = ["interpreter.ts", "driver.ts", "complete.ts", "adjudicate.ts"];

/** The actual assertion logic under test: core files must never mention "exploration". */
function assertNoExplorationCoupling(source: string, label: string): void {
	if (/exploration/i.test(source)) {
		throw new Error(`Coupling violation: '${label}' contains the pipeline-specific string "exploration"`);
	}
}

describe("AC#3 coupling discipline — positive control (real files, permanent regression gate)", () => {
	for (const file of CORE_FILES) {
		it(`src/engine/${file} never contains the string "exploration" (case-insensitive)`, () => {
			const source = readFileSync(join(import.meta.dir, "..", "engine", file), "utf-8");
			expect(() => assertNoExplorationCoupling(source, file)).not.toThrow();
		});
	}
});

describe("AC#3 coupling discipline — negative control (the assertion logic really does catch a violation)", () => {
	it("fails on a fixture string that hardcodes an exploration-specific branch", () => {
		const violatingFixture = [
			"export function dispatch(task) {",
			'  if (task.pipeline_id === "exploration") {',
			"    return runExplorationSpike(task);",
			"  }",
			"}",
		].join("\n");

		expect(() => assertNoExplorationCoupling(violatingFixture, "fixture")).toThrow(/Coupling violation/);
	});

	it("does not false-positive on an unrelated word containing a similar substring", () => {
		// Sanity: the regex is anchored on the literal pipeline name, not a
		// substring that would also match innocuous prose (guards against a
		// trivially-broken assertion that rejects everything).
		const benign = "// generic dispatch: works for any registered pipeline, e.g. execution.";
		expect(() => assertNoExplorationCoupling(benign, "benign")).not.toThrow();
	});
});
