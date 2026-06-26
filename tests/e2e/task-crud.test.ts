import { expect, type Page, test } from "@playwright/test";

/**
 * Task CRUD E2E tests driving the real Web UI modal flow:
 *   create ("+ New Task" -> fill Title -> Create)
 *   edit   (open card -> Edit -> change Title -> Save)
 *   archive (open card -> Archive Task -> confirm)
 *
 * ISOLATION: these tests run against the worktree's own backlog directory
 * (served by Playwright's webServer). To avoid polluting it with leftover test
 * tasks, every created task is archived through the UI as part of the test, and
 * a teardown hook archives any survivors through the DELETE /api/tasks/:id
 * endpoint (which moves the task to the archive folder). Each task uses a unique
 * timestamped title so cleanup never touches real project tasks.
 */

const RUN_TAG = `e2e-${Date.now()}`;
const createdTitles = new Set<string>();

function uniqueTitle(suffix: string): string {
	const title = `${RUN_TAG}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
	createdTitles.add(title);
	return title;
}

/** Create a task via the Board UI and return its title. */
async function createTaskViaUI(page: Page, title: string): Promise<void> {
	await page.goto("/");
	await page.getByRole("button", { name: "+ New Task" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	await dialog.getByPlaceholder("Enter task title").fill(title);
	await dialog.getByRole("button", { name: "Create" }).click();

	// Modal closes and the new card appears on the board.
	await expect(dialog).toBeHidden();
	await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
}

/** Find the task id for a created title via the API (used for cleanup). */
async function findTaskIdByTitle(page: Page, title: string): Promise<string | null> {
	const res = await page.request.get("/api/tasks");
	if (!res.ok()) return null;
	const tasks = (await res.json()) as Array<{ id: string; title: string }>;
	const match = tasks.find((t) => t.title === title);
	return match?.id ?? null;
}

test.afterAll(async ({ playwright, baseURL }) => {
	// Safety-net cleanup: archive any tasks this run created that survived.
	const context = await playwright.request.newContext({ baseURL });
	try {
		const res = await context.get("/api/tasks");
		if (res.ok()) {
			const tasks = (await res.json()) as Array<{
				id: string;
				title: string;
			}>;
			for (const task of tasks) {
				if (createdTitles.has(task.title)) {
					await context.delete(`/api/tasks/${task.id}`);
				}
			}
		}
	} finally {
		await context.dispose();
	}
});

test.describe("Task CRUD via Web UI", () => {
	test("create a new task from the board", async ({ page }) => {
		const title = uniqueTitle("create");
		await createTaskViaUI(page, title);

		// Confirm it is persisted (visible on a reload).
		await page.reload();
		await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
	});

	test("edit (update) an existing task title", async ({ page }) => {
		const original = uniqueTitle("edit");
		await createTaskViaUI(page, original);

		// Open the task details modal by clicking the card.
		await page.getByText(original, { exact: true }).first().click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Plan flow: Edit -> change Title -> Save. In preview mode there is a
		// single "Edit" button (exact match avoids the editor's "Edit code"
		// toolbar buttons that only appear once we are in edit mode).
		await dialog.getByRole("button", { name: "Edit", exact: true }).click();

		// In edit mode the Title input is pre-filled with the current title;
		// select it by value to disambiguate from the other modal inputs.
		const updated = uniqueTitle("edited");
		const titleInput = dialog.locator(`input[value="${original}"]`);
		await expect(titleInput).toBeVisible();
		await titleInput.fill(updated);

		// Save persists the change via PUT /api/tasks/:id and returns the modal
		// to preview mode (it does not close). Wait for the request to settle.
		const updateResponse = page.waitForResponse(
			(res) => res.request().method() === "PUT" && res.url().includes("/api/tasks/") && res.ok(),
		);
		await dialog.getByRole("button", { name: "Save" }).click();
		await updateResponse;

		// Back in preview mode: the Save button is gone. Close the modal.
		await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0);
		await dialog.getByRole("button", { name: "Close modal" }).click();
		await expect(dialog).toBeHidden();

		// Reload to confirm the change is durable, then verify the board reflects
		// the new title and the original is gone.
		await page.reload();
		await expect(page.getByText(updated, { exact: true }).first()).toBeVisible();
		await expect(page.getByText(original, { exact: true })).toHaveCount(0);
	});

	test("archive a task removes it from the board", async ({ page }) => {
		const title = uniqueTitle("archive");
		await createTaskViaUI(page, title);

		await page.getByText(title, { exact: true }).first().click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// The Archive action fires a window.confirm — accept it.
		page.once("dialog", (d) => d.accept());
		await dialog.getByRole("button", { name: "Archive Task" }).click();

		await expect(dialog).toBeHidden();
		await expect(page.getByText(title, { exact: true })).toHaveCount(0);

		// And it is gone from the API too (already archived).
		expect(await findTaskIdByTitle(page, title)).toBeNull();
	});
});
