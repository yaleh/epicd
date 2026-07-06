/**
 * Phase B wire tests — merge conflict routing + merge-lock serialisation.
 *
 * Verifies that:
 *   1. completeTask with a merge that signals conflict → task phase → "needs-human"
 *      (engine decides; worker cannot self-declare done after conflict).
 *   2. completeTask with a successful merge + passing DoD → task phase → "done".
 *   3. merge runs inside withMergeLock: the .merge-lock file exists while the
 *      merge callback is executing (ENG-3 production path).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { displayStatus } from "../core/field-registry.ts";
import type { TaskStore } from "../engine/complete.ts";
import { completeTask } from "../engine/complete.ts";
import { MERGE_LOCK_FILENAME, type MergeLockFs } from "../engine/safety.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir } from "./test-utils.ts";

const realFs: MergeLockFs = {
	mkdir: (dir, opts) => mkdir(dir, opts).then(() => {}),
	writeFile: (p, d) => writeFile(p, d),
	exists: (p) => existsSync(p),
	join: (...parts) => join(...parts),
};

function makeTask(id: string, dod: Array<{ text: string; checked: boolean }> = []): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "Basic: Ready",
		pipeline_id: "execution",
		phase: "ready",
		filePath: `/fake/${id}.md`,
		body: "",
		definitionOfDoneItems: dod,
	} as unknown as Task;
}

function makeStore(task: Task): { store: TaskStore; savedPhase: () => string | undefined } {
	let saved: Task = task;
	const store: TaskStore = {
		getTask: async (id) => (id === task.id ? saved : null),
		updateTask: async (t) => {
			saved = t;
		},
	};
	return { store, savedPhase: () => saved.phase };
}

describe("completeTask — conflict routing → needs-human", () => {
	it("sets phase to needs-human when merge returns conflict:true", async () => {
		const task = makeTask("TASK-W1");
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-W1", { success: true }, store, {
			merge: async (_id, _res) => ({ conflict: true }),
		});

		expect(savedPhase()).toBe("needs-human");
	});

	it("does not reach adjudication on conflict (DoD items ignored)", async () => {
		// All DoD items checked — but conflict should still → needs-human
		const task = makeTask("TASK-W2", [{ text: "passes", checked: true }]);
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-W2", { success: true }, store, {
			merge: async () => ({ conflict: true }),
		});

		expect(savedPhase()).toBe("needs-human");
	});
});

describe("completeTask — successful merge → adjudication proceeds", () => {
	it("sets phase to done when merge succeeds and result.success is true with no unchecked DoD", async () => {
		const task = makeTask("TASK-W3", [{ text: "step", checked: true }]);
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-W3", { success: true }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(savedPhase()).toBe("done");
	});

	it("sets phase to needs-human when merge succeeds but result.success is false", async () => {
		const task = makeTask("TASK-W4");
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-W4", { success: false, error: "worker crashed" }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(savedPhase()).toBe("needs-human");
	});
});

describe("completeTask — merge runs under withMergeLock (ENG-3)", () => {
	let backlogDir: string;

	beforeEach(async () => {
		backlogDir = createUniqueTestDir("merge-wire-lock");
		await mkdir(backlogDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(backlogDir, { recursive: true, force: true });
	});

	it("holds the .merge-lock while the merge callback executes", async () => {
		const task = makeTask("TASK-W5");
		const { store } = makeStore(task);
		const lockPath = join(backlogDir, MERGE_LOCK_FILENAME);

		let lockExistedDuringMerge = false;

		await completeTask("TASK-W5", { success: true }, store, {
			merge: async () => {
				lockExistedDuringMerge = existsSync(lockPath);
				return { merged: true };
			},
			safety: { backlogDir, lockFs: realFs },
		});

		expect(lockExistedDuringMerge).toBe(true);
	});

	it("lock is released after completeTask completes", async () => {
		const task = makeTask("TASK-W6");
		const { store } = makeStore(task);

		await completeTask("TASK-W6", { success: true }, store, {
			merge: async () => ({ merged: true }),
			safety: { backlogDir, lockFs: realFs },
		});

		// Lock must be released — a second completeTask should not hang
		const task2 = makeTask("TASK-W6b");
		const { store: store2, savedPhase: savedPhase2 } = makeStore(task2);
		await completeTask("TASK-W6b", { success: true }, store2, {
			merge: async () => ({ merged: true }),
			safety: { backlogDir, lockFs: realFs },
		});
		expect(savedPhase2()).toBe("done");
	});
});

describe("completeTask — commit hook (BACK-616)", () => {
	it("calls options.commit(taskId, verdict) after the final adjudicated updateTask", async () => {
		const task = makeTask("TASK-C1", [{ text: "step", checked: true }]);
		const { store, savedPhase } = makeStore(task);
		const calls: Array<[string, string]> = [];

		await completeTask("TASK-C1", { success: true }, store, {
			merge: async () => ({ merged: true }),
			commit: async (id, verdict) => {
				calls.push([id, verdict]);
			},
		});

		expect(savedPhase()).toBe("done");
		expect(calls).toEqual([["TASK-C1", "done"]]);
	});

	it("calls options.commit(taskId, 'needs-human') on merge conflict (before adjudication)", async () => {
		const task = makeTask("TASK-C2");
		const { store, savedPhase } = makeStore(task);
		const calls: Array<[string, string]> = [];

		await completeTask("TASK-C2", { success: true }, store, {
			merge: async () => ({ conflict: true }),
			commit: async (id, verdict) => {
				calls.push([id, verdict]);
			},
		});

		expect(savedPhase()).toBe("needs-human");
		expect(calls).toEqual([["TASK-C2", "needs-human"]]);
	});

	it("calls options.commit(taskId, 'needs-human') when dodResults fail (pre-merge early return)", async () => {
		const task = makeTask("TASK-C3");
		const { store, savedPhase } = makeStore(task);
		const calls: Array<[string, string]> = [];

		await completeTask("TASK-C3", { success: true, dodResults: [{ cmd: "false", passed: false }] }, store, {
			merge: async () => ({ merged: true }),
			commit: async (id, verdict) => {
				calls.push([id, verdict]);
			},
		});

		expect(savedPhase()).toBe("needs-human");
		expect(calls).toEqual([["TASK-C3", "needs-human"]]);
	});

	it("does not throw and behaves as before when options.commit is omitted", async () => {
		const task = makeTask("TASK-C4", [{ text: "step", checked: true }]);
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-C4", { success: true }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(savedPhase()).toBe("done");
	});

	it("commit runs while the .merge-lock is still held (single lock scope covers merge+commit)", async () => {
		const backlogDir = createUniqueTestDir("merge-wire-commit-lock");
		await mkdir(backlogDir, { recursive: true });
		try {
			const task = makeTask("TASK-C5", [{ text: "step", checked: true }]);
			const { store } = makeStore(task);
			const lockPath = join(backlogDir, MERGE_LOCK_FILENAME);
			let lockExistedDuringCommit = false;

			await completeTask("TASK-C5", { success: true }, store, {
				merge: async () => ({ merged: true }),
				commit: async () => {
					lockExistedDuringCommit = existsSync(lockPath);
				},
				safety: { backlogDir, lockFs: realFs },
			});

			expect(lockExistedDuringCommit).toBe(true);
		} finally {
			await rm(backlogDir, { recursive: true, force: true });
		}
	});
});

describe("completeTask — displayed status stays in sync with phase (BACK-617, re-centralized BACK-627)", () => {
	// BACK-627: complete.ts no longer hand-writes `status` alongside `phase` — that
	// derivation is centralized in Core.updateTask. Against a bare TaskStore double
	// (not Core-backed), the phase alone is authoritative; displayStatus(task) is the
	// single read that projects it, which is what these assertions now verify.
	it("phase: 'done' displays as 'Done' on adjudicated success", async () => {
		const task = makeTask("TASK-S1", [{ text: "step", checked: true }]);
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-S1", { success: true }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(savedPhase()).toBe("done");
		expect(displayStatus((await store.getTask("TASK-S1")) as Task)).toBe("Done");
	});

	it("phase: 'needs-human' displays as 'Needs Human' on dodResults failure", async () => {
		const task = makeTask("TASK-S2");
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-S2", { success: true, dodResults: [{ cmd: "false", passed: false }] }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(savedPhase()).toBe("needs-human");
		expect(displayStatus((await store.getTask("TASK-S2")) as Task)).toBe("Needs Human");
	});

	it("phase: 'needs-human' displays as 'Needs Human' on merge conflict", async () => {
		const task = makeTask("TASK-S3");
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-S3", { success: true }, store, {
			merge: async () => ({ conflict: true }),
		});

		expect(savedPhase()).toBe("needs-human");
		expect(displayStatus((await store.getTask("TASK-S3")) as Task)).toBe("Needs Human");
	});

	it("phase: 'done' displays as 'Done' for a compound task (has children) — role never affects the status text", async () => {
		const task = { ...makeTask("TASK-S4", [{ text: "step", checked: true }]), subtasks: ["TASK-S4.1"] };
		const { store, savedPhase } = makeStore(task);

		await completeTask("TASK-S4", { success: true }, store, {
			merge: async () => ({ merged: true }),
		});

		expect(savedPhase()).toBe("done");
		expect(displayStatus((await store.getTask("TASK-S4")) as Task)).toBe("Done");
	});
});
