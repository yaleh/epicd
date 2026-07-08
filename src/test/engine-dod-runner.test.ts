/**
 * DoD runner tests (ENG-8; BACK-613 — structured gates).
 *
 * Asserts:
 *  1. runDoD runs each STRUCTURED `task.dod[].text` as a shell command in cwd.
 *  2. Exit 0 → passed: true; non-zero → passed: false.
 *  3. Empty/absent dod → returns [].
 *  4. One failing command does not stop the rest (all are run).
 *  5. The prose `definitionOfDoneItems` checklist is NEVER executed (BACK-613).
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runDoD } from "../harness/dod-runner.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir } from "./test-utils.ts";

function makeTask(items: { text: string; checked?: boolean }[] = []): Task {
	return {
		id: "task-dod-test",
		title: "DoD Runner Test",
		status: "Basic: Implementing",
		pipeline_id: "execution",
		phase: "implementing",
		body: "",
		dod: items.map((item) => ({
			text: item.text,
			checked: item.checked ?? false,
		})),
	} as unknown as Task;
}

let tmpDir: string;

beforeAll(async () => {
	tmpDir = createUniqueTestDir("dod-runner");
	await mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("runDoD", () => {
	it("returns empty array when task has no DoD items", async () => {
		const task = makeTask([]);
		const results = await runDoD(task, tmpDir);
		expect(results).toEqual([]);
	});

	it("returns empty array when dod is undefined", async () => {
		const task = { ...makeTask([]), dod: undefined } as unknown as Task;
		const results = await runDoD(task, tmpDir);
		expect(results).toEqual([]);
	});

	it("never executes the prose definitionOfDoneItems checklist (BACK-613)", async () => {
		// Prose (would fail if shelled out) present, but NO structured dod → nothing runs.
		const task = {
			...makeTask([]),
			definitionOfDoneItems: [{ index: 1, text: "bunx tsc --noEmit passes when TypeScript touched", checked: false }],
		} as unknown as Task;
		const results = await runDoD(task, tmpDir);
		expect(results).toEqual([]);
	});

	it("passes for a command that exits 0", async () => {
		const task = makeTask([{ text: "true" }]);
		const results = await runDoD(task, tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({ cmd: "true", passed: true });
	});

	it("fails for a command that exits non-zero", async () => {
		const task = makeTask([{ text: "false" }]);
		const results = await runDoD(task, tmpDir);
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({ cmd: "false", passed: false });
	});

	it("runs all commands even when one fails", async () => {
		const task = makeTask([{ text: "true" }, { text: "false" }, { text: "true" }]);
		const results = await runDoD(task, tmpDir);
		expect(results).toHaveLength(3);
		expect(results[0]).toEqual({ cmd: "true", passed: true });
		expect(results[1]).toEqual({ cmd: "false", passed: false });
		expect(results[2]).toEqual({ cmd: "true", passed: true });
	});

	it("runs command in the given cwd", async () => {
		// Create a sentinel file; verify the command can detect it
		const sentinelFile = join(tmpDir, "sentinel.txt");
		await Bun.write(sentinelFile, "ok");

		const task = makeTask([{ text: "test -f sentinel.txt" }]);
		const results = await runDoD(task, tmpDir);
		expect(results[0]?.passed).toBe(true);
	});

	it("passes cmd through verbatim", async () => {
		const cmd = "echo hello > /dev/null";
		const task = makeTask([{ text: cmd }]);
		const results = await runDoD(task, tmpDir);
		expect(results[0]?.cmd).toBe(cmd);
		expect(results[0]?.passed).toBe(true);
	});

	it("ignores checked status — only shell exit code matters", async () => {
		// Even if item is checked=true, a failing command should still fail
		const task = makeTask([{ text: "false", checked: true }]);
		const results = await runDoD(task, tmpDir);
		expect(results[0]?.passed).toBe(false);
	});
});
