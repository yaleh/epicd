import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

// BACK-647 604.4: gates the task API (shared by the issue-list/TaskList and the
// deprecated kanban Board) behind a configurable `webAuthToken` shared secret.

let TEST_DIR: string;
let server: BacklogServer | null = null;
let serverPort = 0;

const baseTask: Task = {
	id: "TASK-0001",
	title: "Auth-gated task",
	status: "To Do",
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

async function startServer(webAuthToken?: string) {
	TEST_DIR = createUniqueTestDir("server-auth");
	const filesystem = new FileSystem(TEST_DIR);
	await filesystem.ensureBacklogStructure();
	await filesystem.saveConfig({
		projectName: "Server Auth",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		...(webAuthToken ? { webAuthToken } : {}),
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

describe("BacklogServer task API auth", () => {
	describe("when no webAuthToken is configured", () => {
		beforeEach(async () => {
			await startServer();
		});

		it("allows requests to the task API without any Authorization header", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks`);
			expect(response.status).toBe(200);
			const tasks = (await response.json()) as Task[];
			expect(tasks.some((task) => task.id === baseTask.id)).toBe(true);
		});
	});

	describe("when a webAuthToken is configured", () => {
		beforeEach(async () => {
			await startServer("integration-test-secret");
		});

		it("rejects task list requests missing the Authorization header", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks`);
			expect(response.status).toBe(401);
		});

		it("rejects task list requests with a wrong token", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks`, {
				headers: { Authorization: "Bearer wrong-token" },
			});
			expect(response.status).toBe(401);
		});

		it("allows task list requests with the correct bearer token", async () => {
			const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks`, {
				headers: { Authorization: "Bearer integration-test-secret" },
			});
			expect(response.status).toBe(200);
			const tasks = (await response.json()) as Task[];
			expect(tasks.some((task) => task.id === baseTask.id)).toBe(true);
		});

		it("also gates single-task and statuses endpoints", async () => {
			const unauthedTask = await fetch(`http://127.0.0.1:${serverPort}/api/task/1`);
			expect(unauthedTask.status).toBe(401);

			const unauthedStatuses = await fetch(`http://127.0.0.1:${serverPort}/api/statuses`);
			expect(unauthedStatuses.status).toBe(401);

			const authedStatuses = await fetch(`http://127.0.0.1:${serverPort}/api/statuses`, {
				headers: { Authorization: "Bearer integration-test-secret" },
			});
			expect(authedStatuses.status).toBe(200);
		});

		it("also gates the coordinator-claims endpoint", async () => {
			const unauthed = await fetch(`http://127.0.0.1:${serverPort}/api/coordinator-claims`);
			expect(unauthed.status).toBe(401);

			const authed = await fetch(`http://127.0.0.1:${serverPort}/api/coordinator-claims`, {
				headers: { Authorization: "Bearer integration-test-secret" },
			});
			expect(authed.status).toBe(200);
		});
	});
});
