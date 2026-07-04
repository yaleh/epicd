/**
 * DoD runner — harness primitive that re-runs each DoD shell command in a
 * given worktree directory and returns per-command pass/fail results.
 *
 * Lives in src/harness/ — not src/engine/ — because it shells out via
 * Bun.spawn (engine core must stay free of subprocess calls).
 *
 * ENG-8: the engine cannot rely on the worker self-attesting "done" via
 * checkbox ticks; instead the harness re-runs the DoD commands verbatim
 * and the engine adjudicates the results.
 *
 * BACK-613: the executed gates are the STRUCTURED `task.dod` field (a list of
 * shell-command DoDItems), NOT the prose `## Definition of Done` checklist
 * (`definitionOfDoneItems`). The prose checklist is human-facing and is never
 * executed — running it as `sh -c` produced false failures and nondeterministic
 * spurious passes. Tasks declare machine gates in `dod`; a task with no `dod`
 * gates yields `[]`, which the engine (completeTask) routes to needs-human —
 * it never auto-merges an ungated task.
 */

import type { Task } from "../types/index.js";

export interface DodResult {
	cmd: string;
	passed: boolean;
}

/**
 * Runs each structured `task.dod[].text` as a shell command inside `cwd`.
 *
 * - Empty/absent `dod` → returns `[]` (no machine gate declared).
 * - Each command is run with `sh -c <cmd>` in `cwd`; exit 0 = passed.
 * - Errors during spawn are treated as failures (passed: false).
 */
export async function runDoD(task: Task, cwd: string): Promise<DodResult[]> {
	const items = task.dod ?? [];
	if (items.length === 0) return [];

	const results: DodResult[] = [];
	for (const item of items) {
		const cmd = item.text;
		let passed = false;
		try {
			const proc = Bun.spawn(["sh", "-c", cmd], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;
			passed = exitCode === 0;
		} catch {
			passed = false;
		}
		results.push({ cmd, passed });
	}
	return results;
}
