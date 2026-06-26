import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

describe("epicd identity", () => {
	it('package.json name is "epicd"', () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
		expect(pkg.name).toBe("epicd");
	});

	it("README first heading contains epicd", () => {
		const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
		const firstHeading = readme.match(/<h1[^>]*>.*?<\/h1>/s)?.[0] ?? readme.split("\n").find((l) => l.startsWith("# ")) ?? "";
		expect(firstHeading.toLowerCase()).toContain("epicd");
	});
});
