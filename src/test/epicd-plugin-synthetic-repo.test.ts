/**
 * BACK-605.9 M1 — synthetic empty-repo plugin verification.
 *
 * Proves the packaged epicd Claude Code plugin (`.claude-plugin/marketplace.json` +
 * `plugin/.claude-plugin/plugin.json` + `plugin/skills/{propose,promote,inbox,run,init}`)
 * is reusable OUTSIDE the epicd source tree, without any baime dependency:
 *
 *   1. Build the standalone `dist/backlog` binary (the only epicd artifact the scratch
 *      repo receives — no `src/` tree is copied in).
 *   2. Create a brand-new git repo under `os.tmpdir()`, copy in ONLY the packaged
 *      plugin assets (`plugin/`, `.claude-plugin/`) and the built binary.
 *   3. Run the `init` skill's command (`backlog init --defaults`) against it, then
 *      extend `backlog/config.yml`'s `statuses` list with the engine's Basic:/Epic:
 *      pipeline vocabulary (a documented contract of `engine promote`/`engine scan`,
 *      not an epicd-repo path — any board wanting engine-driven pipelines configures
 *      this the same way epicd's own `backlog/config.yml` does).
 *   4. Run the `propose` skill's command (`task create --status "Basic: Backlog"`).
 *   5. Run the `promote` skill's command (`engine promote <id>`).
 *   6. Run the `run` skill's underlying worker chain — `handle-basic-ready.sh` (claim +
 *      worktree) with `EPICD_CLI_CMD` pointed at the scratch binary, a simulated agent
 *      commit + done sentinel, then `engine complete --worktree <path>` — driving the
 *      task's phase to `done` (the same real merge-tail machinery
 *      epicd-run-integration.test.ts exercises, here run entirely against the scratch
 *      repo + scratch binary).
 *   7. Run the `inbox` skill's command (`engine gate-log`) against a fabricated
 *      GateEvent line.
 *   8. Assert: nowhere under the scratch repo does any file contain "baime" (any
 *      case) or this epicd checkout's own absolute repo path.
 */

import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync, execSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
const BIN_PATH = join(repoRoot, "dist", "backlog");

function collectFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === ".git") continue; // git internals aren't plugin/board content
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) files.push(...collectFiles(fullPath));
		else if (stat.isFile()) files.push(fullPath);
	}
	return files;
}

function sh(cmd: string, cwd: string, env: Record<string, string> = {}): string {
	return execSync(cmd, { cwd, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
}

describe("BACK-605.9 M1 — synthetic scratch-repo plugin verification", () => {
	let scratchDir: string;
	let siblingWorktreeDir: string | undefined;

	beforeAll(() => {
		// Build the standalone CLI binary fresh (bun --compile, ~1-2s) — the only
		// epicd artifact the scratch repo below receives.
		execSync("bun run build", { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
		expect(existsSync(BIN_PATH)).toBe(true);
	});

	afterEach(async () => {
		if (siblingWorktreeDir) {
			try {
				sh(
					`git -C ${JSON.stringify(scratchDir)} worktree remove --force ${JSON.stringify(siblingWorktreeDir)}`,
					repoRoot,
				);
			} catch {
				/* best-effort */
			}
			rmSync(siblingWorktreeDir, { recursive: true, force: true });
			siblingWorktreeDir = undefined;
		}
		if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
	});

	it("propose -> promote -> run(handle-basic-ready + engine complete) -> Done, plus inbox, with no baime reference and no epicd-repo hardcoded path", () => {
		scratchDir = mkdtempSync(join(tmpdir(), "epicd-plugin-synthetic-"));

		// ---- fresh empty git repo, nothing epicd about it except the artifacts we copy in ----
		sh("git init -q -b main", scratchDir);
		sh("git config user.email test@test.com", scratchDir);
		sh("git config user.name Test", scratchDir);

		// ---- install ONLY the packaged plugin (skills + scripts + manifests) ----
		cpSync(join(repoRoot, "plugin"), join(scratchDir, "plugin"), { recursive: true });
		cpSync(join(repoRoot, ".claude-plugin"), join(scratchDir, ".claude-plugin"), { recursive: true });

		// The CLI binary is kept OUTSIDE the scratch repo (its own directory would
		// otherwise collide with `backlog init`'s "backlog/" board directory).
		const binDir = mkdtempSync(join(tmpdir(), "epicd-plugin-bin-"));
		const scratchBin = join(binDir, "epicd-cli");
		cpSync(BIN_PATH, scratchBin);
		chmodSync(scratchBin, 0o755);

		// ---- init skill: `backlog init --defaults` ----
		sh(`${scratchBin} init "scratch" --defaults`, scratchDir);
		const configPath = join(scratchDir, "backlog", "config.yml");
		expect(existsSync(configPath)).toBe(true);

		// Extend the engine's Basic:/Epic: pipeline status vocabulary — a documented
		// contract of `engine promote`/`engine scan` (src/cli.ts), not an epicd-repo path.
		let config = readFileSync(configPath, "utf8");
		config = config.replace(
			/^statuses:.*$/m,
			'statuses: ["To Do", "In Progress", "Done", "Basic: Backlog", "Basic: Ready", "Basic: In Progress", "Basic: Done", "Basic: Needs Human"]',
		);
		writeFileSync(configPath, config);

		// ---- propose skill: `backlog task create ... --status "Basic: Backlog"` ----
		const createOut = sh(
			`${scratchBin} task create "Synthetic smoke task" --status "Basic: Backlog" --labels "kind:basic" --description "synthetic smoke task" --dod-gate "true" --plain`,
			scratchDir,
		);
		const taskIdMatch = createOut.match(/^Task (\S+)/m);
		expect(taskIdMatch).not.toBeNull();
		const taskId = taskIdMatch?.[1] ?? "";
		expect(taskId).not.toBe("");

		sh("git add -A", scratchDir);
		sh('git commit -q -m "init board"', scratchDir);

		// ---- promote skill: `backlog engine promote <id>` ----
		const promoteOut = sh(`${scratchBin} engine promote ${taskId}`, scratchDir);
		expect(promoteOut).toContain("execution/ready");

		// ---- run skill's worker chain: handle-basic-ready.sh (claim + worktree) ----
		const handleBasicReadySh = join(scratchDir, "plugin", "scripts", "handle-basic-ready.sh");
		execFileSync("bash", [handleBasicReadySh, taskId], {
			cwd: scratchDir,
			env: { ...process.env, EPICD_CLI_CMD: scratchBin },
			stdio: ["ignore", "pipe", "pipe"],
		});

		const capsDir = join(scratchDir, "backlog", ".caps");
		const worktreeDir = readFileSync(join(capsDir, `${taskId}.wt`), "utf8").trim();
		const signalFile = readFileSync(join(capsDir, `${taskId}.signal`), "utf8").trim();
		siblingWorktreeDir = worktreeDir;
		expect(existsSync(worktreeDir)).toBe(true);

		// Simulate the Agent step: one commit in the worktree + the done sentinel.
		writeFileSync(join(worktreeDir, `${taskId}.txt`), "work done by simulated agent");
		sh(`git add ${taskId}.txt`, worktreeDir);
		sh(`git -c user.email=test@test.com -c user.name=Test commit -q -m "work for ${taskId}"`, worktreeDir);
		writeFileSync(signalFile, "done");

		// engine自治驱动至Done: `engine complete --worktree <path>`.
		sh(`${scratchBin} engine complete ${taskId} --worktree ${JSON.stringify(worktreeDir)}`, scratchDir);

		const taskFileDir = join(scratchDir, "backlog", "tasks");
		const taskFile = readdirSync(taskFileDir).find((f) => f.toUpperCase().startsWith(taskId.toUpperCase()));
		expect(taskFile).toBeDefined();
		const taskContents = readFileSync(join(taskFileDir, taskFile as string), "utf8");
		expect(taskContents).toContain("phase: done");
		expect(taskContents).toContain("status: 'Basic: Done'");

		// ---- inbox skill: `backlog engine gate-log` over a fabricated GateEvent ----
		const gateLogDir = join(scratchDir, "docs", "research");
		execSync(`mkdir -p ${JSON.stringify(gateLogDir)}`);
		const gateEventLine = JSON.stringify({
			id: "g1",
			item_id: taskId,
			pipeline_id: "execution",
			gate: "dod",
			actor: "engine",
			verdict: "pass",
			timestamp: "2026-07-05T00:00:00Z",
			payload: {},
		});
		writeFileSync(join(gateLogDir, "gate-events.jsonl"), `${gateEventLine}\n`);
		const inboxOut = sh(`${scratchBin} engine gate-log --pipeline-id execution`, scratchDir);
		expect(inboxOut).toContain(taskId);
		expect(inboxOut).toContain('"gate":"dod"');

		// ---- no baime reference, no epicd-repo-hardcoded path, anywhere in the scratch repo ----
		for (const file of collectFiles(scratchDir)) {
			const contents = readFileSync(file, "utf8").toString();
			expect(contents.toLowerCase()).not.toContain("baime");
			expect(contents).not.toContain(repoRoot);
		}

		rmSync(binDir, { recursive: true, force: true });
	}, 60_000);
});
