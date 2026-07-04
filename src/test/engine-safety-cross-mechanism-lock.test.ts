/**
 * Cross-mechanism lock test – AC #1
 *
 * Verifies that the engine's merge lock and the old loop-backlog's .merge-lock
 * convention are mutually exclusive via the SAME file system path.
 *
 * Mechanism:
 *   - Engine:    proper-lockfile creates `<backlogDir>/.merge-lock` as a DIRECTORY
 *                (atomic mkdir – this is how proper-lockfile works).
 *   - Old loop:  complete-task.sh writes a PID to `<backlogDir>/.merge-lock` as a FILE
 *                (`echo $$ > .merge-lock`).
 *
 * Cross-exclusion:
 *   - While the engine holds the lock, `.merge-lock` is a directory; the old loop's
 *     file-write fails with EISDIR.
 *   - While the old loop holds the lock, `.merge-lock` is a file; proper-lockfile's
 *     `mkdir .merge-lock` fails with EEXIST.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile, open } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { createUniqueTestDir } from "./test-utils.ts";
import { MERGE_LOCK_FILENAME, withMergeLock, type MergeLockFs } from "../engine/safety.ts";

const realFs: MergeLockFs = {
	mkdir: (dir, opts) => mkdir(dir, opts).then(() => {}),
	writeFile: (p, d) => writeFile(p, d),
	exists: (p) => existsSync(p),
	join: (...parts) => join(...parts),
};

describe("Cross-mechanism lock – engine vs old loop-backlog", () => {
	let backlogDir: string;
	let mergeLockPath: string;

	beforeEach(async () => {
		backlogDir = createUniqueTestDir("safety-xlock");
		await mkdir(backlogDir, { recursive: true });
		mergeLockPath = join(backlogDir, MERGE_LOCK_FILENAME);
	});

	afterEach(async () => {
		await rm(backlogDir, { recursive: true, force: true });
	});

	it("engine lock creates .merge-lock as a directory (proper-lockfile behaviour)", async () => {
		await withMergeLock(
			backlogDir,
			async () => {
				expect(existsSync(mergeLockPath)).toBe(true);
				const stat = statSync(mergeLockPath);
				expect(stat.isDirectory()).toBe(true);
			},
			realFs,
		);
	});

	it("old-loop write fails while engine holds the lock (engine blocks old loop)", async () => {
		await withMergeLock(
			backlogDir,
			async () => {
				// Simulate old loop: `echo $$ > .merge-lock`
				let writeError: Error | undefined;
				try {
					const fh = await open(mergeLockPath, "w");
					await fh.close();
				} catch (err) {
					writeError = err as Error;
				}
				// Writing a file to an existing directory path fails with EISDIR or EEXIST
				expect(writeError).toBeDefined();
				expect((writeError as { code?: string }).code).toMatch(/EISDIR|EEXIST/);
			},
			realFs,
		);
	});

	it("engine lock fails while old loop holds the lock (old loop blocks engine)", async () => {
		// Simulate old loop acquiring the lock: create .merge-lock as a file
		await writeFile(mergeLockPath, String(process.pid));

		// Sentinel for withMergeLock
		const sentinelPath = join(backlogDir, ".merge-lock-sentinel");
		await writeFile(sentinelPath, "");

		// proper-lockfile tries mkdir .merge-lock – should fail because it's a file
		let lockError: Error | undefined;
		try {
			await lockfile.lock(sentinelPath, {
				lockfilePath: mergeLockPath,
				stale: 1_000,
				retries: 0, // no retry – we want the failure immediately
			});
		} catch (err) {
			lockError = err as Error;
		}
		expect(lockError).toBeDefined();

		// Clean up the old-loop simulation
		await rm(mergeLockPath, { force: true });
	});

	it("engine proceeds after old loop releases its lock file", async () => {
		// Old loop holds the lock as a file
		await writeFile(mergeLockPath, String(process.pid));
		// Release: old loop removes its lock file
		await rm(mergeLockPath, { force: true });

		// Engine can now acquire
		const result = await withMergeLock(backlogDir, async () => "engine-ok", realFs);
		expect(result).toBe("engine-ok");
	});

	it("MERGE_LOCK_FILENAME constant equals the old loop's .merge-lock convention", () => {
		expect(MERGE_LOCK_FILENAME).toBe(".merge-lock");
	});
});
