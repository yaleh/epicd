import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Guards against BACK-700's original bug class: the shell-side board-directory
// probe (plugin/scripts/lib/resolve-backlog-dir.sh) and the JS-side probe
// (resolveBacklogDirName() in plugin/scripts/scan-loop.cjs) must encode the
// exact same backlog > .backlog > .epicd priority-with-fallback order. Rather
// than diffing source text (brittle to reformatting), this drives both
// implementations against the same matrix of on-disk directory combinations
// and asserts they always agree.

const SCAN_LOOP_PATH = join(import.meta.dir, "..", "..", "plugin", "scripts", "scan-loop.cjs");
const HELPER_SCRIPT_PATH = join(import.meta.dir, "..", "..", "plugin", "scripts", "lib", "resolve-backlog-dir.sh");

// biome-ignore lint/suspicious/noExplicitAny: dynamic require of a .cjs script for test-only introspection
const scanLoop: any = require(SCAN_LOOP_PATH);
const resolveBacklogDirNameJs: (root: string) => string = scanLoop.resolveBacklogDirName;

async function resolveBacklogDirNameShell(root: string): Promise<string> {
	const proc = Bun.spawn(
		["bash", "-c", `REPO_ROOT="$1"; source "$2"; printf '%s' "$BACKLOG_DIR_NAME"`, "--", root, HELPER_SCRIPT_PATH],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`resolve-backlog-dir.sh failed (exit ${exitCode}): ${stderr}`);
	}
	return stdout;
}

// Matrix of every combination of the three candidate directories existing or
// not — exercises the full priority order (backlog > .backlog > .epicd) plus
// the none-exist fallback, for both single- and multi-candidate cases.
const CANDIDATE_DIRS = ["backlog", ".backlog", ".epicd"] as const;
function combinations(): boolean[][] {
	const combos: boolean[][] = [];
	for (let mask = 0; mask < 1 << CANDIDATE_DIRS.length; mask++) {
		combos.push(CANDIDATE_DIRS.map((_, i) => (mask & (1 << i)) !== 0));
	}
	return combos;
}

describe("board-directory probe: shell helper vs resolveBacklogDirName() agree", () => {
	it("exposes resolveBacklogDirName from scan-loop.cjs", () => {
		expect(typeof resolveBacklogDirNameJs).toBe("function");
	});

	for (const present of combinations()) {
		const label = CANDIDATE_DIRS.filter((_, i) => present[i]).join(",") || "(none)";
		it(`agree when present = ${label || "none"}`, async () => {
			const testDir = await mkdtemp(join(tmpdir(), "resolve-backlog-dir-"));
			try {
				for (let i = 0; i < CANDIDATE_DIRS.length; i++) {
					const dir = CANDIDATE_DIRS[i];
					if (present[i] && dir) {
						await mkdir(join(testDir, dir), { recursive: true });
					}
				}
				const jsResult = resolveBacklogDirNameJs(testDir);
				const shellResult = await resolveBacklogDirNameShell(testDir);
				expect(shellResult).toBe(jsResult);
			} finally {
				await rm(testDir, { recursive: true, force: true });
			}
		});
	}

	it("both default to 'backlog' when none of the candidates exist", async () => {
		const testDir = await mkdtemp(join(tmpdir(), "resolve-backlog-dir-none-"));
		try {
			expect(resolveBacklogDirNameJs(testDir)).toBe("backlog");
			expect(await resolveBacklogDirNameShell(testDir)).toBe("backlog");
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	it("both prefer backlog/ over .backlog/ and .epicd/ when all three exist", async () => {
		const testDir = await mkdtemp(join(tmpdir(), "resolve-backlog-dir-all-"));
		try {
			for (const dir of CANDIDATE_DIRS) {
				await mkdir(join(testDir, dir), { recursive: true });
			}
			await writeFile(join(testDir, "marker"), "unused");
			expect(resolveBacklogDirNameJs(testDir)).toBe("backlog");
			expect(await resolveBacklogDirNameShell(testDir)).toBe("backlog");
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	});
});
