import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createUniqueTestDir } from "./test-utils.ts";
import { withMergeLock, MERGE_LOCK_FILENAME, type MergeLockFs } from "../engine/safety.ts";

/** Default MergeLockFs backed by real node fs for integration tests. */
const realFs: MergeLockFs = {
	mkdir: (dir, opts) => mkdir(dir, opts),
	writeFile: (p, d) => writeFile(p, d),
	exists: (p) => existsSync(p),
	join: (...parts) => join(...parts),
};

describe("withMergeLock – merge serialization", () => {
	let backlogDir: string;

	beforeEach(async () => {
		backlogDir = createUniqueTestDir("safety-merge");
		await mkdir(backlogDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(backlogDir, { recursive: true, force: true });
	});

	it("runs a single fn and returns its result", async () => {
		const result = await withMergeLock(backlogDir, async () => "ok", realFs);
		expect(result).toBe("ok");
	});

	it("serialises two concurrent merge attempts (no interleaving)", async () => {
		const log: string[] = [];

		const first = withMergeLock(
			backlogDir,
			async () => {
				log.push("first:start");
				// yield to allow the second to try to acquire
				await new Promise((r) => setTimeout(r, 50));
				log.push("first:end");
			},
			realFs,
		);

		// Small delay so `first` gets the lock before `second` tries
		await new Promise((r) => setTimeout(r, 10));

		const second = withMergeLock(
			backlogDir,
			async () => {
				log.push("second:start");
				log.push("second:end");
			},
			realFs,
		);

		await Promise.all([first, second]);

		// Serialised: first must finish before second starts
		expect(log).toEqual(["first:start", "first:end", "second:start", "second:end"]);
	});

	it("releases the lock after success so a subsequent call can proceed", async () => {
		await withMergeLock(backlogDir, async () => {}, realFs);
		// If lock was not released, this would time out
		await expect(withMergeLock(backlogDir, async () => "released", realFs)).resolves.toBe("released");
	});

	it("releases the lock after a thrown error", async () => {
		await expect(
			withMergeLock(
				backlogDir,
				async () => {
					throw new Error("oops");
				},
				realFs,
			),
		).rejects.toThrow("oops");

		// Lock must be released even after the throw
		await expect(withMergeLock(backlogDir, async () => "after-error", realFs)).resolves.toBe("after-error");
	});

	it("creates the lock at the shared .merge-lock path", async () => {
		const lockPath = join(backlogDir, MERGE_LOCK_FILENAME);
		let lockExistedDuring = false;

		await withMergeLock(
			backlogDir,
			async () => {
				lockExistedDuring = existsSync(lockPath);
			},
			realFs,
		);

		expect(lockExistedDuring).toBe(true);
		// Lock is released (directory removed) after exit
		expect(existsSync(lockPath)).toBe(false);
	});
});
