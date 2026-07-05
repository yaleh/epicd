/**
 * BACK-626.3 — historical cochange overlap signal (ADR-016 D2/D3).
 *
 * Uses a fake GitLogPrimitive (raw `git log --pretty=format:%ct%x00 --name-only -z` output)
 * so these tests don't depend on this repo's real history.
 */

import { describe, expect, it } from "bun:test";
import { findCochangeOverlaps } from "../harness/cochange.ts";

/** Build fake `git log --pretty=format:%ct%x00 --name-only -z` output from a list of
 *  per-commit file lists (oldest commit first, matching real `git log`'s newest-first order
 *  is not required — the parser doesn't care about ordering). */
function fakeGitLog(commits: string[][]): string {
	let ts = 1700000000;
	return commits.map((files) => [String(ts++), ...files].join("\0")).join("\0");
}

describe("findCochangeOverlaps", () => {
	it("returns [] when no children declare touches", async () => {
		const overlaps = await findCochangeOverlaps([{ title: "A" }, { title: "B" }], ".", {
			gitLog: async () => fakeGitLog([["src/a.ts", "src/b.ts"]]),
		});
		expect(overlaps).toEqual([]);
	});

	it("flags a cross-sibling file pair that cochanges >= threshold times", async () => {
		const children = [
			{ title: "Alpha", touches: ["src/a.ts"] },
			{ title: "Beta", touches: ["src/b.ts"] },
		];
		const gitLog = async () =>
			fakeGitLog([
				["src/a.ts", "src/b.ts"],
				["src/a.ts", "src/b.ts", "src/unrelated.ts"],
				["src/a.ts", "src/b.ts"],
				["src/a.ts"], // doesn't cochange this time — shouldn't inflate the count
			]);

		const overlaps = await findCochangeOverlaps(children, ".", { gitLog, threshold: 3 });
		expect(overlaps).toEqual([{ a: "Alpha", b: "Beta", files: ["src/a.ts", "src/b.ts"], count: 3 }]);
	});

	it("does not flag a pair below the threshold", async () => {
		const children = [
			{ title: "Alpha", touches: ["src/a.ts"] },
			{ title: "Beta", touches: ["src/b.ts"] },
		];
		const gitLog = async () =>
			fakeGitLog([
				["src/a.ts", "src/b.ts"],
				["src/a.ts", "src/b.ts"],
			]);

		const overlaps = await findCochangeOverlaps(children, ".", { gitLog, threshold: 3 });
		expect(overlaps).toEqual([]);
	});

	it("ignores cochange counts for files outside any declared touches set", async () => {
		const children = [
			{ title: "Alpha", touches: ["src/a.ts"] },
			{ title: "Beta", touches: ["src/b.ts"] },
		];
		const gitLog = async () =>
			fakeGitLog([
				["src/unrelated1.ts", "src/unrelated2.ts"],
				["src/unrelated1.ts", "src/unrelated2.ts"],
				["src/unrelated1.ts", "src/unrelated2.ts"],
			]);

		const overlaps = await findCochangeOverlaps(children, ".", { gitLog, threshold: 1 });
		expect(overlaps).toEqual([]);
	});

	it("does not flag a file declared by only one child, even if it cochanges a lot", async () => {
		// Same-child files aren't cross-sibling pairs — D2 only cares about cross-sibling coupling.
		const children = [{ title: "Alpha", touches: ["src/a.ts", "src/b.ts"] }, { title: "Beta" }];
		const gitLog = async () =>
			fakeGitLog([
				["src/a.ts", "src/b.ts"],
				["src/a.ts", "src/b.ts"],
				["src/a.ts", "src/b.ts"],
			]);

		const overlaps = await findCochangeOverlaps(children, ".", { gitLog, threshold: 1 });
		expect(overlaps).toEqual([]);
	});
});
