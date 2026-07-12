import { describe, expect, it } from "bun:test";

describe("web UI branding", () => {
	it("does not show the legacy 'Backlog.md' product name in user-facing strings", async () => {
		const files = ["../web/components/Navigation.tsx", "../web/components/SideNavigation.tsx", "../web/App.tsx"];

		for (const relativePath of files) {
			const path = new URL(relativePath, import.meta.url).pathname;
			const content = await Bun.file(path).text();
			expect(content).not.toMatch(/Backlog\.md/);
		}
	});
});
