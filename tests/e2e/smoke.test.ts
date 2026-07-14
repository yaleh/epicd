import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the epicd Web UI.
 *
 * These assert on stable UI chrome (the "Kanban Board" heading and the
 * "+ New Task" button) rather than on specific status column names, so the
 * suite stays robust regardless of which statuses the served backlog directory
 * happens to configure. The Kanban Board is the heart of the app.
 */

test.describe("Web UI smoke", () => {
	test("home page loads with the epicd title", async ({ page }) => {
		await page.goto("/");
		// The document <title> is "epicd - Task Management".
		await expect(page).toHaveTitle(/epicd/i);
	});

	test("Kanban Board renders core chrome", async ({ page }) => {
		await page.goto("/");
		// Stable heading rendered by the Board component (exact match so it does
		// not collide with task cards that mention "kanban board").
		await expect(page.getByRole("heading", { name: "Kanban Board", exact: true })).toBeVisible();
		// Stable action button for creating tasks on the Board.
		await expect(page.getByRole("button", { name: "+ New Task" })).toBeVisible();
	});

	test("tasks page loads without error", async ({ page }) => {
		await page.goto("/tasks");
		await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();
		// No uncaught client error surfaced as an error boundary.
		await expect(page.getByText("Something went wrong")).toHaveCount(0);
	});
});
