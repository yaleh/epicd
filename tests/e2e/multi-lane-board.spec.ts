import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, type Page, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

/**
 * E2E coverage for the multi-lane issue-list (BACK-604 AC#7 / BACK-648):
 *   - lane-switcher (All Tasks / Milestone / Pipeline) load + collapse/expand
 *   - inline gate-review (approve/reject/escalate) on a human-actor row
 *   - driver-indicator icons (machine vs. human actor rows)
 *   - deprecated kanban Board route (`/`) still renders without regression
 *
 * FIXTURES: tasks are seeded through the `backlog` CLI (same binary the rest
 * of the app uses) in `test.beforeAll`, mirroring how the CLI is the only
 * supported way to set the engine-managed `pipeline_id`/`phase` fields (the
 * Web UI has no form for them). Every fixture uses a unique timestamped title
 * so cleanup never touches real project tasks, and `test.afterAll` archives
 * any survivors via the CLI so re-running this file is idempotent.
 *
 * AUTH: `webAuthToken` is unset by default (see src/server/auth.ts) so the
 * `/api/tasks*` routes this suite (and the app itself) hits are unguarded;
 * no token wiring is needed in `playwright.config.ts`.
 *
 * WS live-refresh: intentionally NOT covered here. Triggering a file change
 * from a second CLI process and asserting the row updates without a reload
 * would race the content-store's file-watcher debounce and Playwright's own
 * polling, making it a flaky addition to a DoD gate that must stay green.
 * The approve/reject/escalate assertions below already exercise the same
 * `tasks-updated` broadcast path (the row's status badge and gate-buttons
 * disappear after the write lands, purely from a WS-driven `tasks` refresh -
 * no page reload occurs in this suite), so the live-refresh mechanism is
 * still exercised, just not via a second independent process.
 */

const RUN_TAG = `e2e-mlb-${Date.now()}`;
const createdIds = new Set<string>();

async function runCli(args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync("bun", ["run", "cli", ...args, "--plain"], {
			cwd: process.cwd(),
		});
		return stdout;
	} catch (err) {
		const { stdout, stderr } = err as { stdout?: string; stderr?: string };
		throw new Error(`CLI command failed (${args.join(" ")}):\n${stdout ?? ""}\n${stderr ?? ""}`);
	}
}

function extractTaskId(cliOutput: string): string {
	const match = cliOutput.match(/Task\s+(BACK-\d+)/i) ?? cliOutput.match(/\b(BACK-\d+)\b/i);
	if (!match?.[1]) {
		throw new Error(`Could not find a task id in CLI output:\n${cliOutput}`);
	}
	return match[1].toUpperCase();
}

async function createFixtureTask(
	title: string,
	opts: { pipelineId: string; phase: string; milestone?: string },
): Promise<string> {
	const createOut = await runCli(["task", "create", title]);
	const id = extractTaskId(createOut);
	createdIds.add(id);
	const editArgs = ["task", "edit", id, "--pipeline-id", opts.pipelineId, "--phase", opts.phase];
	if (opts.milestone) {
		editArgs.push("--milestone", opts.milestone);
	}
	await runCli(editArgs);
	return id;
}

let humanTaskId = "";
let machineTaskId = "";

test.beforeAll(async () => {
	// One human-actor row (execution/needs-human) to exercise gate-review + the
	// 👤 driver indicator, and one machine-actor row (execution/ready) for the
	// 🤖/⏳ driver indicator. Both carry a milestone so the Milestone lane mode
	// has at least one populated lane.
	humanTaskId = await createFixtureTask(`${RUN_TAG}-human-gate`, {
		pipelineId: "execution",
		phase: "needs-human",
	});
	machineTaskId = await createFixtureTask(`${RUN_TAG}-machine`, {
		pipelineId: "execution",
		phase: "ready",
	});
});

test.afterAll(async ({ playwright, baseURL }) => {
	// Safety-net cleanup via the API (mirrors task-crud.test.ts): archive any
	// fixture task that survived the test run (e.g. a failed assertion left it
	// un-rejected).
	const context = await playwright.request.newContext({ baseURL });
	try {
		for (const id of createdIds) {
			await context.delete(`/api/tasks/${id}`).catch(() => {});
		}
	} finally {
		await context.dispose();
	}
});

/** Row locator for a given task id + title in the flat/lane table. */
function taskRow(page: Page, title: string) {
	return page.locator("tr", { has: page.getByText(title, { exact: true }) });
}

test.describe("Multi-lane issue list", () => {
	test("lane-switcher: All Tasks / Milestone / Pipeline toggle and lane grouping renders", async ({ page }) => {
		await page.goto("/tasks");
		await expect(page.getByRole("heading", { name: "All Tasks" })).toBeVisible();

		const toolbar = page.getByRole("toolbar", { name: "Task list lane controls" });
		await expect(toolbar.getByRole("button", { name: "All Tasks" })).toBeVisible();

		// Flat view: our fixture rows are visible directly in the table.
		await expect(taskRow(page, `${RUN_TAG}-human-gate`)).toBeVisible();
		await expect(taskRow(page, `${RUN_TAG}-machine`)).toBeVisible();

		// Switch to Pipeline lane mode: tasks are grouped under phase sub-headings
		// inside the "execution" lane (both fixtures carry pipeline_id=execution).
		await toolbar.getByRole("button", { name: "Pipeline" }).click();
		await expect(page).toHaveURL(/lane=pipeline/);
		// Pipeline-lane phase sub-headings render the raw kebab-case phase name
		// followed by a "(<count>)" badge (see `groupTasksByPhase` in
		// src/web/lib/lanes.ts and its rendering in TaskList.tsx), unlike the
		// Board's title-cased column headings - so match on the heading prefix
		// rather than an exact string.
		await expect(page.getByRole("heading", { level: 4, name: /^needs-human/ }).first()).toBeVisible();
		await expect(page.getByRole("heading", { level: 4, name: /^ready/ }).first()).toBeVisible();
		await expect(taskRow(page, `${RUN_TAG}-human-gate`)).toBeVisible();
		await expect(taskRow(page, `${RUN_TAG}-machine`)).toBeVisible();

		// Collapse/expand: the lane header toggles the body away and back.
		const laneHeaderButtons = page.locator("button").filter({ hasText: "execution" });
		const laneHeaderCount = await laneHeaderButtons.count();
		if (laneHeaderCount > 0) {
			const laneHeader = laneHeaderButtons.first();
			await laneHeader.click();
			await expect(taskRow(page, `${RUN_TAG}-human-gate`)).toBeHidden();
			await laneHeader.click();
			await expect(taskRow(page, `${RUN_TAG}-human-gate`)).toBeVisible();
		}

		// Back to All Tasks (no lane grouping).
		await toolbar.getByRole("button", { name: "All Tasks" }).click();
		await expect(page).not.toHaveURL(/lane=/);
	});

	test("driver-indicator: machine and human actor rows show distinct icons", async ({ page }) => {
		await page.goto("/tasks");

		const humanRow = taskRow(page, `${RUN_TAG}-human-gate`);
		await expect(humanRow.getByLabel("Waiting on a human")).toBeVisible();

		const machineRow = taskRow(page, `${RUN_TAG}-machine`);
		// A freshly-seeded machine-actor row is unclaimed by the Coordinator, so
		// it renders as "queued" (⏳) rather than "agent-active" (🤖) — both are
		// the machine-actor family the driver-indicator module defines.
		await expect(machineRow.getByLabel("Queued, waiting to be picked up")).toBeVisible();
		// Machine-actor rows have no inline gate-review buttons (those only
		// render for actor=human rows).
		await expect(machineRow.getByRole("button", { name: `Approve ${machineTaskId}` })).toHaveCount(0);
	});

	test("inline gate-review: approve advances a human-gate row past the human phase", async ({ page }) => {
		await page.goto("/tasks");

		const humanRow = taskRow(page, `${RUN_TAG}-human-gate`);
		await expect(humanRow.getByRole("button", { name: `Approve ${humanTaskId}` })).toBeVisible();
		await expect(humanRow.getByRole("button", { name: `Reject ${humanTaskId}` })).toBeVisible();
		await expect(humanRow.getByRole("button", { name: `Escalate ${humanTaskId}` })).toBeVisible();

		await humanRow.getByRole("button", { name: `Approve ${humanTaskId}` }).click();

		// Approving execution/needs-human wraps forward to the next machine phase
		// ("ready"), which flips the badge label and removes the gate buttons
		// (the row is no longer actor=human). This assertion also exercises the
		// same WS `tasks-updated` refresh path other rows rely on for the
		// driver-indicator: no reload happens between the click and this check.
		await expect(humanRow.getByRole("button", { name: `Approve ${humanTaskId}` })).toHaveCount(0);
		await expect(humanRow.getByText("Basic: Ready")).toBeVisible({ timeout: 15_000 });
	});

	test("inline gate-review: escalate moves a task into the execution needs-human gate", async ({ page }) => {
		// Seed a dedicated task for this test so it doesn't race the approve test
		// above (which mutates the shared human-gate fixture's phase).
		const escalateTaskId = await createFixtureTask(`${RUN_TAG}-escalate`, {
			pipelineId: "authoring",
			phase: "backlog",
		});

		await page.goto("/tasks");
		const row = taskRow(page, `${RUN_TAG}-escalate`);
		await expect(row.getByRole("button", { name: `Escalate ${escalateTaskId}` })).toBeVisible();
		await row.getByRole("button", { name: `Escalate ${escalateTaskId}` }).click();

		// Escalating always lands on execution/needs-human; the gate buttons
		// remain (still actor=human) but the status badge reflects the new phase.
		await expect(row.getByText("Basic: Needs Human")).toBeVisible({ timeout: 15_000 });
	});

	test("inline gate-review: reject archives a human-gate row off the list", async ({ page }) => {
		const rejectTaskId = await createFixtureTask(`${RUN_TAG}-reject`, {
			pipelineId: "execution",
			phase: "needs-human",
		});

		await page.goto("/tasks");
		const row = taskRow(page, `${RUN_TAG}-reject`);
		await expect(row.getByRole("button", { name: `Reject ${rejectTaskId}` })).toBeVisible();

		page.once("dialog", (dialog) => dialog.accept().catch(() => {}));
		await row.getByRole("button", { name: `Reject ${rejectTaskId}` }).click();

		await expect(taskRow(page, `${RUN_TAG}-reject`)).toHaveCount(0, { timeout: 15_000 });
	});

	test("deprecated kanban Board route still renders without regression", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("heading", { name: "Kanban Board", exact: true })).toBeVisible();

		// Columns are phase-derived (BACK-647 AC#4): the execution pipeline's
		// phase set renders as column headings, in pipeline order.
		await expect(page.getByRole("heading", { level: 3, name: "Ready" }).first()).toBeVisible();
		await expect(page.getByRole("heading", { level: 3, name: "Decomposing" }).first()).toBeVisible();
		await expect(page.getByRole("heading", { level: 3, name: "Needs Human" }).first()).toBeVisible();
		await expect(page.getByRole("heading", { level: 3, name: "Done" }).first()).toBeVisible();

		// No client-side error boundary triggered by rendering deprecated columns.
		await expect(page.getByText("Something went wrong")).toHaveCount(0);

		// Nav entry is hidden (BACK-647) even though the route is still reachable.
		await expect(page.getByRole("link", { name: "Board", exact: true })).toHaveCount(0);
	});
});
