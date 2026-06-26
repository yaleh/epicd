import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for the Backlog.md Web UI.
 *
 * IMPORTANT: This points `webServer` at a dedicated, free port (6455) and sets
 * `reuseExistingServer: false` so Playwright always starts a fresh server built
 * from THIS worktree. We must never reuse a stray `backlog browser` server that
 * may be squatting on the conventional 6420/6421 ports serving a different
 * project — doing so would run the suite against the wrong data and produce a
 * false pass.
 */
const PORT = Number(process.env.E2E_PORT ?? 6455);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: "tests/e2e",
	outputDir: "tests/e2e/.artifacts",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"]],
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: BASE_URL,
		headless: true,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `bun run cli browser --no-open --port ${PORT}`,
		url: BASE_URL,
		reuseExistingServer: false,
		timeout: 60_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
