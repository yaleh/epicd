import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { type WorktreeRunner, withWorktree } from "../engine/safety.ts";
import { createUniqueTestDir } from "./test-utils.ts";

/** Initialise a minimal git repo with one commit so worktrees can be created. */
async function initRepo(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	await $`git init -b main`.cwd(dir).quiet();
	await $`git config user.email "test@test.com"`.cwd(dir).quiet();
	await $`git config user.name "Test"`.cwd(dir).quiet();
	await writeFile(join(dir, "README.md"), "init");
	await $`git add README.md`.cwd(dir).quiet();
	await $`git commit -m "init"`.cwd(dir).quiet();
}

/** Real WorktreeRunner backed by git. */
const gitRunner: WorktreeRunner = {
	add: async (repo, wt) => {
		await $`git -C ${repo} worktree add --detach ${wt}`.quiet();
	},
	remove: async (repo, wt) => {
		await $`git -C ${repo} worktree remove --force ${wt}`.quiet();
	},
	rmrf: (path) => rm(path, { recursive: true, force: true }),
	join: (...parts) => join(...parts),
};

describe("withWorktree – worktree isolation + cleanup", () => {
	let repoDir: string;

	beforeEach(async () => {
		repoDir = createUniqueTestDir("safety-worktree");
		await initRepo(repoDir);
	});

	afterEach(async () => {
		await rm(repoDir, { recursive: true, force: true });
	});

	it("provides an isolated worktree path to fn", async () => {
		let receivedPath = "";
		await withWorktree(
			repoDir,
			"task-1",
			async (wt) => {
				receivedPath = wt;
			},
			gitRunner,
		);
		expect(receivedPath).toContain("task-1");
	});

	it("removes the worktree directory after success", async () => {
		let worktreePath = "";
		await withWorktree(
			repoDir,
			"task-2",
			async (wt) => {
				worktreePath = wt;
				expect(existsSync(wt)).toBe(true); // exists during execution
			},
			gitRunner,
		);
		expect(existsSync(worktreePath)).toBe(false); // removed after success
	});

	it("removes the worktree directory even when fn throws", async () => {
		let worktreePath = "";
		await expect(
			withWorktree(
				repoDir,
				"task-3",
				async (wt) => {
					worktreePath = wt;
					expect(existsSync(wt)).toBe(true);
					throw new Error("agent failure");
				},
				gitRunner,
			),
		).rejects.toThrow("agent failure");

		expect(existsSync(worktreePath)).toBe(false); // cleaned up despite error
	});

	it("isolates each task in its own worktree directory", async () => {
		const paths: string[] = [];

		// Run sequentially (worktrees would conflict if they shared a path)
		await withWorktree(
			repoDir,
			"task-a",
			async (wt) => {
				paths.push(wt);
			},
			gitRunner,
		);
		await withWorktree(
			repoDir,
			"task-b",
			async (wt) => {
				paths.push(wt);
			},
			gitRunner,
		);

		expect(paths[0]).not.toBe(paths[1]);
		expect(paths[0]).toContain("task-a");
		expect(paths[1]).toContain("task-b");
	});

	it("leaves no git worktree registration after cleanup", async () => {
		await withWorktree(repoDir, "task-cleanup", async () => {}, gitRunner);

		// After cleanup, `git worktree list` should only show the main worktree
		const result = await $`git -C ${repoDir} worktree list --porcelain`.quiet();
		const output = result.stdout.toString();
		expect(output).not.toContain("task-cleanup");
	});
});
