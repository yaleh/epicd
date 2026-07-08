import { describe, expect, it } from "bun:test";
import { validateRetreatContract } from "../engine/retreat.ts";
import type { RetreatContract } from "../types/index.ts";

describe("validateRetreatContract (BACK-682 schema #3)", () => {
	it("rejects a wrong-classified entry missing obsoleteBlock", () => {
		const contract = {
			keep: [],
			missing: [],
			wrong: [{ ac: "AC#4", description: "bad impl" }],
		} as unknown as RetreatContract;
		expect(() => validateRetreatContract(contract)).toThrow(/obsoleteBlock/);
	});

	it("rejects a wrong entry with a partial obsoleteBlock (missing a required sub-field)", () => {
		const contract: RetreatContract = {
			keep: [],
			missing: [],
			wrong: [
				{
					ac: "AC#4",
					description: "bad impl",
					obsoleteBlock: { file: "src/x.ts", lines: "", reason: "misread" },
				},
			],
		};
		expect(() => validateRetreatContract(contract)).toThrow(/obsoleteBlock/);
	});

	it("accepts a legal combination of keep/missing/wrong (wrong entries carrying full obsoleteBlock)", () => {
		const contract: RetreatContract = {
			keep: ["AC#1", "AC#2"],
			missing: [{ ac: "AC#3", description: "not started" }],
			wrong: [
				{
					ac: "AC#4",
					description: "wrong interpretation",
					obsoleteBlock: { file: "src/x.ts", lines: "10-20", reason: "misread the AC" },
				},
			],
		};
		expect(() => validateRetreatContract(contract)).not.toThrow();
	});

	it("accepts an all-empty contract (nothing to keep/missing/wrong yet)", () => {
		const contract: RetreatContract = { keep: [], missing: [], wrong: [] };
		expect(() => validateRetreatContract(contract)).not.toThrow();
	});
});
