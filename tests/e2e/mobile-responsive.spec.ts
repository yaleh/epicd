import { expect, test } from "@playwright/test";

/**
 * E2E coverage for BACK-693: mobile adaptation of the All Tasks page.
 *
 * All three phases (sidebar drawer, filter panel collapse, card view) are
 * driven by a single `useIsMobile()` hook keyed off `window.matchMedia
 * (max-width: 767px)`, forking each affected component's render at the JS
 * level rather than via CSS-only hide/show. Every test below asserts both
 * branches in the same spec: a mobile viewport (390x844) exercising the new
 * mobile UI, and a desktop viewport (1280x800) asserting the pre-existing
 * desktop UI is unchanged (no hamburger/drawer, no filter toggle, table
 * still renders).
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

test.describe("Mobile responsive: All Tasks page", () => {
	test.describe("Phase A: sidebar drawer", () => {
		test("mobile: hamburger opens an overlay drawer; sidebar hidden by default", async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			const hamburger = page.getByRole("button", { name: "Open navigation menu" });
			await expect(hamburger).toBeVisible();

			// Sidebar nav links are not visible until the drawer is opened.
			await expect(page.getByRole("navigation").getByRole("link", { name: /All Tasks/ })).toBeHidden();

			await hamburger.click();
			const drawerTasksLink = page.getByRole("navigation").getByRole("link", { name: /All Tasks/ });
			await expect(drawerTasksLink).toBeVisible();

			// Clicking a nav link inside the drawer closes it (and navigates).
			await drawerTasksLink.click();
			await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeHidden();

			// Re-open and close via the drawer's dedicated close button (BACK-694
			// bug #2 regression: this button used to sit behind the drawer panel
			// in the DOM/stacking order, so tapping it actually hit a nav link
			// underneath and navigated away instead of closing the drawer).
			await hamburger.click();
			await expect(page.getByRole("navigation").getByRole("link", { name: /All Tasks/ })).toBeVisible();
			const urlBeforeClose = page.url();
			await page.getByRole("button", { name: "Close navigation menu" }).click();
			await expect(page.getByRole("navigation").getByRole("link", { name: /All Tasks/ })).toBeHidden();
			expect(page.url()).toBe(urlBeforeClose);
		});

		test("mobile (BACK-694 bug #1): header title does not overlap the hamburger button", async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			const hamburger = page.getByRole("button", { name: "Open navigation menu" });
			await expect(hamburger).toBeVisible();
			const brandLink = page.getByRole("link", { name: "epicd" });
			await expect(brandLink).toBeVisible();

			const hamburgerBox = await hamburger.boundingBox();
			const brandBox = await brandLink.boundingBox();
			expect(hamburgerBox).not.toBeNull();
			expect(brandBox).not.toBeNull();
			if (hamburgerBox && brandBox) {
				// No horizontal overlap: the brand link starts at/after the
				// hamburger button's right edge.
				expect(brandBox.x).toBeGreaterThanOrEqual(hamburgerBox.x + hamburgerBox.width);
			}
		});

		test("desktop: sidebar renders inline with no hamburger/drawer", async ({ page }) => {
			await page.setViewportSize(DESKTOP_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			await expect(page.getByRole("button", { name: "Open navigation menu" })).toHaveCount(0);
			await expect(page.getByRole("navigation").getByRole("link", { name: /All Tasks/ })).toBeVisible();
		});
	});

	test.describe("BACK-694: mobile viewport bug fixes", () => {
		test("mobile: filter panel task count text fits within the viewport width", async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			await page.getByRole("button", { name: "Filters" }).click();
			const countText = page.getByText(/^Showing \d+ of \d+ tasks$/);
			await expect(countText).toBeVisible();

			const box = await countText.boundingBox();
			expect(box).not.toBeNull();
			if (box) {
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
			}
		});

		test("desktop: filter panel task count text still renders (no regression)", async ({ page }) => {
			await page.setViewportSize(DESKTOP_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			const countText = page.getByText(/^Showing \d+ of \d+ tasks$/);
			await expect(countText).toBeVisible();
		});
	});

	test.describe("Phase B: filter panel collapse", () => {
		test("mobile: filters collapsed behind a toggle by default", async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			const filtersToggle = page.getByRole("button", { name: "Filters" });
			await expect(filtersToggle).toBeVisible();
			await expect(page.getByRole("combobox").first()).toBeHidden();

			await filtersToggle.click();
			await expect(page.getByRole("combobox").first()).toBeVisible();
		});

		test("desktop: filter controls render inline with no toggle", async ({ page }) => {
			await page.setViewportSize(DESKTOP_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			await expect(page.getByRole("button", { name: "Filters" })).toHaveCount(0);
			await expect(page.getByRole("combobox").first()).toBeVisible();
		});
	});

	test.describe("Phase C: card view", () => {
		test("mobile: task list renders as cards, not a table", async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			await expect(page.locator("table")).toHaveCount(0);
			await expect(page.getByTestId("task-card").first()).toBeVisible();
		});

		test("desktop: task list still renders as a table with all columns", async ({ page }) => {
			await page.setViewportSize(DESKTOP_VIEWPORT);
			await page.goto("/tasks");
			await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

			await expect(page.getByTestId("task-card")).toHaveCount(0);
			const table = page.locator("table").first();
			await expect(table).toBeVisible();
			await expect(table.getByRole("columnheader", { name: /ID/ })).toBeVisible();
			await expect(table.getByRole("columnheader", { name: /Priority/ })).toBeVisible();
		});
	});
});
