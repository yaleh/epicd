import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import type { BacklogConfig, Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

// BACK-695: POST /api/tasks/:id/actions/:actionId - fire-and-forget dispatcher for
// config-defined task action commands. Frontend sends only actionId+taskId; the command
// string is resolved and executed server-side and never crosses the network. Gated by
// remoteOperations + webAuthToken (stricter than the plain webAuthToken gate on read/write
// task routes, since this route executes an arbitrary maintainer-configured shell command).

let TEST_DIR: string;
let server: BacklogServer | null = null;
let serverPort = 0;

const baseTask: Task = {
	id: "TASK-0001",
	title: "Task Action Target",
	status: "To Do",
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

async function startServer(config: Partial<BacklogConfig>) {
	TEST_DIR = createUniqueTestDir("server-task-actions");
	const filesystem = new FileSystem(TEST_DIR);
	await filesystem.ensureBacklogStructure();
	await filesystem.saveConfig({
		projectName: "Server Task Actions",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		...config,
	});
	await filesystem.saveTask(baseTask);

	server = new BacklogServer(TEST_DIR);
	await server.start(0, false);
	const port = server.getPort();
	expect(port).not.toBeNull();
	serverPort = port ?? 0;
	expect(serverPort).toBeGreaterThan(0);
}

afterEach(async () => {
	if (server) {
		await server.stop();
		server = null;
	}
	await safeCleanup(TEST_DIR);
});

describe("BacklogServer task actions endpoint", () => {
	describe("gating (AC #5)", () => {
		it("rejects with 403 when webAuthToken is not configured, even with remoteOperations on", async () => {
			await startServer({ remoteOperations: true, taskActions: [{ id: "echo", label: "Echo", command: "echo hi" }] });

			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/echo`, {
				method: "POST",
			});
			expect(response.status).toBe(403);
		});

		it("rejects with 403 when remoteOperations is disabled, even with a token configured", async () => {
			await startServer({
				remoteOperations: false,
				webAuthToken: "secret-token",
				taskActions: [{ id: "echo", label: "Echo", command: "echo hi" }],
			});

			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/echo`, {
				method: "POST",
				headers: { Authorization: "Bearer secret-token" },
			});
			expect(response.status).toBe(403);
		});

		it("rejects with 401 when a token is configured but the request omits it", async () => {
			await startServer({
				remoteOperations: true,
				webAuthToken: "secret-token",
				taskActions: [{ id: "echo", label: "Echo", command: "echo hi" }],
			});

			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/echo`, {
				method: "POST",
			});
			expect(response.status).toBe(401);
		});
	});

	describe("execution (AC #2/#4)", () => {
		beforeEach(async () => {
			await startServer({
				remoteOperations: true,
				webAuthToken: "secret-token",
				taskActions: [
					{ id: "echo-vars", label: "Echo vars", command: 'echo "$TASK_ID|$TASK_TITLE|$TASK_STATUS"' },
					{ id: "fail", label: "Fail", command: "exit 3" },
				],
			});
		});

		it("only accepts actionId+taskId - not a command string - and returns {exitCode, stdout, stderr}", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/echo-vars`, {
				method: "POST",
				headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
				// Even if a client tried to smuggle a command, the server must ignore the body
				// entirely and only use the config-resolved command for the given actionId.
				body: JSON.stringify({ command: "echo should-not-run" }),
			});
			expect(response.status).toBe(200);
			const body = (await response.json()) as { exitCode: number; stdout?: string; stderr?: string };
			expect(body.exitCode).toBe(0);
			expect(body.stdout).toBe(`${baseTask.id}|${baseTask.title}|${baseTask.status}`);
			expect(body.stdout).not.toContain("should-not-run");
		});

		it("returns a non-zero exitCode receipt without throwing when the command fails", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/fail`, {
				method: "POST",
				headers: { Authorization: "Bearer secret-token" },
			});
			expect(response.status).toBe(200);
			const body = (await response.json()) as { exitCode: number };
			expect(body.exitCode).toBe(3);
		});

		it("returns 404 for an unknown actionId", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/does-not-exist`, {
				method: "POST",
				headers: { Authorization: "Bearer secret-token" },
			});
			expect(response.status).toBe(404);
		});

		it("returns 404 for an unknown taskId", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/TASK-9999/actions/echo-vars`, {
				method: "POST",
				headers: { Authorization: "Bearer secret-token" },
			});
			expect(response.status).toBe(404);
		});

		it("does not change task status", async () => {
			const before = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}`, {
				headers: { Authorization: "Bearer secret-token" },
			});
			const beforeTask = (await before.json()) as Task;
			expect(beforeTask.status).toBe("To Do");

			await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}/actions/echo-vars`, {
				method: "POST",
				headers: { Authorization: "Bearer secret-token" },
			});

			const after = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${baseTask.id}`, {
				headers: { Authorization: "Bearer secret-token" },
			});
			const afterTask = (await after.json()) as Task;
			expect(afterTask.status).toBe("To Do");
		});
	});
});
