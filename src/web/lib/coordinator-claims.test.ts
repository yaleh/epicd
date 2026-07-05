import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCoordinatorClaimState, getCoordinatorClaimStates } from "./coordinator-claims";

describe("coordinator-claims (baime read-only adapter)", () => {
	let backlogDir: string;
	let existingWorktree: string;

	beforeEach(() => {
		backlogDir = mkdtempSync(join(tmpdir(), "back-645-backlog-"));
		mkdirSync(join(backlogDir, ".caps"), { recursive: true });
		existingWorktree = mkdtempSync(join(tmpdir(), "back-645-wt-"));
	});

	afterEach(() => {
		rmSync(backlogDir, { recursive: true, force: true });
		rmSync(existingWorktree, { recursive: true, force: true });
	});

	it("returns unclaimed when .active-agents is missing entirely", () => {
		expect(getCoordinatorClaimState(backlogDir, "task-1")).toBe("unclaimed");
	});

	it("returns unclaimed when .active-agents exists but does not list the task", () => {
		writeFileSync(join(backlogDir, ".active-agents"), "task-2\ntask-3\n");
		expect(getCoordinatorClaimState(backlogDir, "task-1")).toBe("unclaimed");
	});

	it("returns claimed when listed and its .caps/<id>.wt worktree dir exists", () => {
		writeFileSync(join(backlogDir, ".active-agents"), "task-1\n");
		writeFileSync(join(backlogDir, ".caps", "task-1.wt"), `${existingWorktree}\n`);
		expect(getCoordinatorClaimState(backlogDir, "task-1")).toBe("claimed");
	});

	it("returns stale when listed but the recorded .wt path does not exist on disk", () => {
		writeFileSync(join(backlogDir, ".active-agents"), "task-1\n");
		writeFileSync(join(backlogDir, ".caps", "task-1.wt"), `${join(tmpdir(), "does-not-exist-back-645")}\n`);
		expect(getCoordinatorClaimState(backlogDir, "task-1")).toBe("stale");
	});

	it("returns stale when listed but has no .wt marker file at all", () => {
		writeFileSync(join(backlogDir, ".active-agents"), "task-1\n");
		expect(getCoordinatorClaimState(backlogDir, "task-1")).toBe("stale");
	});

	it("getCoordinatorClaimStates batches the same result for every active id", () => {
		const staleWorktree = join(tmpdir(), "does-not-exist-back-645-batch");
		writeFileSync(join(backlogDir, ".active-agents"), "task-1\ntask-2\n");
		writeFileSync(join(backlogDir, ".caps", "task-1.wt"), `${existingWorktree}\n`);
		writeFileSync(join(backlogDir, ".caps", "task-2.wt"), `${staleWorktree}\n`);

		const states = getCoordinatorClaimStates(backlogDir);
		expect(states["task-1"]).toBe("claimed");
		expect(states["task-2"]).toBe("stale");
		expect(states["task-3"]).toBeUndefined();
	});
});
