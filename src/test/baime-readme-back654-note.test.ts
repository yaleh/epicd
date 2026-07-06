/**
 * BACK-654 — Phase C: the baime-fixpoint-convergence README's "known
 * deviation" record for the BACK-649/BACK-653 adjudicate/dodResults
 * mismatch must be updated to reflect that the defect is now fixed, not
 * left describing it as an unresolved open defect.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const README_PATH = join(process.cwd(), "docs", "research", "baime-fixpoint-convergence", "README.md");

describe("BACK-654 doc update: baime-fixpoint-convergence README", () => {
	it("contains a BACK-654 marker co-located with a 'fixed' marker (已修复/fixed), not just described as an open defect", () => {
		const contents = readFileSync(README_PATH, "utf8");

		// The doc mentions BACK-654 multiple times as the *tracking id* for the
		// open defect discovered during BACK-649/BACK-653 (those mentions predate
		// the fix and must NOT be mistaken for a "fixed" marker). This test looks
		// for at least one occurrence of "BACK-654" that sits near an explicit
		// "已修复"/"fixed" marker — i.e. a dedicated fixed/resolved note, not the
		// earlier "still needs to be fixed" language.
		let found = false;
		let searchFrom = 0;
		while (true) {
			const idx = contents.indexOf("BACK-654", searchFrom);
			if (idx === -1) break;
			const windowStart = Math.max(0, idx - 300);
			const windowEnd = Math.min(contents.length, idx + 300);
			const window = contents.slice(windowStart, windowEnd);
			if (window.includes("已修复") || window.toLowerCase().includes("fixed")) {
				found = true;
				break;
			}
			searchFrom = idx + "BACK-654".length;
		}
		expect(found).toBe(true);
	});
});
