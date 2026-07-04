/**
 * Phase A — real worktree merge: branch creation + gitMergeBranch.
 *
 * Tests use a real (tmp) git repo and real git commands:
 *   1. gitWorktreeRunner.add creates branch task/<id> (not detached HEAD).
 *   2. Commit on branch → gitMergeBranch merges to main; branch cleaned up.
 *   3. gitMergeBranch conflict → {merged:false, conflict:true} + clean abort state.
 *   4. Pre-existing task/<id> branch is removed before add (crash-residue handling).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { gitMergeBranch, gitWorktreeRunner } from "../harness/real-primitives.ts";
import { createUniqueTestDir } from "./test-utils.ts";

/** Initialise a minimal git repo with one commit on `main`. */
async function initRepo(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
	await $`git init -b main`.cwd(dir).quiet();
	await $`git config user.email "test@test.com"`.cwd(dir).quiet();
	await $`git config user.name "Test"`.cwd(dir).quiet();
	await writeFile(join(dir, "README.md"), "init");
	await $`git add README.md`.cwd(dir).quiet();
	await $`git commit -m "init"`.cwd(dir).quiet();
}

describe("gitWorktreeRunner.add — branch-based worktree (not detached)", () => {
	let repoDir: string;

	beforeEach(async () => {
		repoDir = createUniqueTestDir("merge-add");
		await initRepo(repoDir);
	});

	afterEach(async () => {
		// Clean up any leftover worktrees before removing repoDir
		await $`git -C ${repoDir} worktree prune`.quiet().catch(() => {});
		await rm(repoDir, { recursive: true, force: true });
	});

	it("creates a branch task/<id> in the worktree (not detached HEAD)", async () => {
		const worktreePath = join(repoDir, ".worktrees", "TASK-1");
		await gitWorktreeRunner.add(repoDir, worktreePath);

		// The worktree should be on branch task/TASK-1, not detached
		const result = await $`git -C ${worktreePath} branch --show-current`.quiet();
		const branch = result.stdout.toString().trim();
		expect(branch).toBe("task/TASK-1");

		// Cleanup
		await $`git -C ${repoDir} worktree remove --force ${worktreePath}`.quiet().catch(() => {});
		await $`git -C ${repoDir} branch -D task/TASK-1`.quiet().catch(() => {});
	});

	it("removes a pre-existing task/<id> branch before creating the worktree (crash-residue)", async () => {
		// Simulate crash residue: create branch task/TASK-2 without worktree
		await $`git -C ${repoDir} branch task/TASK-2`.quiet();

		const worktreePath = join(repoDir, ".worktrees", "TASK-2");
		// Should not throw even though branch already exists
		await expect(gitWorktreeRunner.add(repoDir, worktreePath)).resolves.toBeUndefined();

		const result = await $`git -C ${worktreePath} branch --show-current`.quiet();
		expect(result.stdout.toString().trim()).toBe("task/TASK-2");

		// Cleanup
		await $`git -C ${repoDir} worktree remove --force ${worktreePath}`.quiet().catch(() => {});
		await $`git -C ${repoDir} branch -D task/TASK-2`.quiet().catch(() => {});
	});
});

describe("gitMergeBranch — real git merge under test", () => {
	let repoDir: string;

	beforeEach(async () => {
		repoDir = createUniqueTestDir("merge-branch");
		await initRepo(repoDir);
	});

	afterEach(async () => {
		await $`git -C ${repoDir} worktree prune`.quiet().catch(() => {});
		await rm(repoDir, { recursive: true, force: true });
	});

	it("merges a branch commit into main and deletes the branch", async () => {
		// Create branch and commit
		await $`git -C ${repoDir} checkout -b task/TASK-3`.quiet();
		await writeFile(join(repoDir, "feature.txt"), "new feature");
		await $`git -C ${repoDir} add feature.txt`.quiet();
		await $`git -C ${repoDir} commit -m "feat: add feature"`.quiet();
		await $`git -C ${repoDir} checkout main`.quiet();

		const result = await gitMergeBranch(repoDir, "TASK-3");

		expect(result.merged).toBe(true);
		expect(result.conflict).toBeFalsy();

		// The commit should be on main now
		const log = await $`git -C ${repoDir} log --oneline`.quiet();
		expect(log.stdout.toString()).toContain("feat: add feature");

		// Branch should be deleted
		const branches = await $`git -C ${repoDir} branch`.quiet();
		expect(branches.stdout.toString()).not.toContain("task/TASK-3");
	});

	it("returns {merged:false, conflict:true} on conflict and leaves clean state", async () => {
		// Create conflicting change on branch
		await $`git -C ${repoDir} checkout -b task/TASK-4`.quiet();
		await writeFile(join(repoDir, "README.md"), "branch version");
		await $`git -C ${repoDir} add README.md`.quiet();
		await $`git -C ${repoDir} commit -m "conflict"`.quiet();
		await $`git -C ${repoDir} checkout main`.quiet();

		// Make conflicting change on main
		await writeFile(join(repoDir, "README.md"), "main version");
		await $`git -C ${repoDir} add README.md`.quiet();
		await $`git -C ${repoDir} commit -m "main change"`.quiet();

		const result = await gitMergeBranch(repoDir, "TASK-4");

		expect(result.merged).toBe(false);
		expect(result.conflict).toBe(true);

		// Repo should be in clean state (merge aborted)
		const status = await $`git -C ${repoDir} status --porcelain`.quiet();
		expect(status.stdout.toString().trim()).toBe("");

		// Should not be mid-merge
		const mergeHead = await $`git -C ${repoDir} rev-parse -q --verify MERGE_HEAD`.quiet().catch(() => ({ stdout: "" }));
		expect(mergeHead.stdout.toString().trim()).toBe("");

		// Cleanup branch
		await $`git -C ${repoDir} branch -D task/TASK-4`.quiet().catch(() => {});
	});

	it("uses --no-ff so a merge commit is always created", async () => {
		await $`git -C ${repoDir} checkout -b task/TASK-5`.quiet();
		await writeFile(join(repoDir, "only.txt"), "only on branch");
		await $`git -C ${repoDir} add only.txt`.quiet();
		await $`git -C ${repoDir} commit -m "feat: only branch"`.quiet();
		await $`git -C ${repoDir} checkout main`.quiet();

		await gitMergeBranch(repoDir, "TASK-5");

		// With --no-ff, there's a merge commit even for fast-forward eligible branches
		const log = await $`git -C ${repoDir} log --oneline`.quiet();
		const lines = log.stdout.toString().trim().split("\n");
		// init commit + branch commit + merge commit = 3 lines
		expect(lines.length).toBe(3);
		expect(lines[0]).toContain("Merge branch");
	});
});
