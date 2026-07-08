import { existsSync, readFileSync } from "node:fs";
import { activeAgentsPath, worktreeMarkerPath } from "../../engine/claim.ts";

/**
 * Read-only adapter over baime coordinator's on-disk claim state
 * (soak-period Coordinator claim source; BACK-604 §AC#2 / BACK-645). Node-only
 * (uses `node:fs`) — import this from server-side code only, never from a
 * component that ships in the browser bundle.
 *
 * Path centralization (BACK-686.1 A2, AC#3): the on-disk paths themselves are
 * sourced from `src/engine/claim.ts`, the single centralization point for the
 * capability/claim directory — this module keeps its own read semantics
 * (a flat active-ids file + per-task worktree marker) unchanged.
 */
export type ClaimState = "claimed" | "unclaimed" | "stale";

function readActiveAgentIds(backlogDir: string): Set<string> {
	const activeFile = activeAgentsPath(backlogDir);
	if (!existsSync(activeFile)) return new Set();
	try {
		const content = readFileSync(activeFile, "utf8");
		return new Set(
			content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		);
	} catch {
		return new Set();
	}
}

function readClaimedWorktreePath(backlogDir: string, taskId: string): string | null {
	const wtFile = worktreeMarkerPath(backlogDir, taskId);
	if (!existsSync(wtFile)) return null;
	try {
		const content = readFileSync(wtFile, "utf8").trim();
		return content.length > 0 ? content : null;
	} catch {
		return null;
	}
}

/**
 * Resolve the claim state for a single task id. Reads the active-ids flag file
 * (flat list of currently-claimed task ids) and, when claimed, the recorded
 * per-task worktree marker path — a claim whose worktree no longer exists on
 * disk is "stale" rather than "claimed".
 */
export function getCoordinatorClaimState(backlogDir: string, taskId: string): ClaimState {
	const activeAgents = readActiveAgentIds(backlogDir);
	if (!activeAgents.has(taskId)) return "unclaimed";
	const wtPath = readClaimedWorktreePath(backlogDir, taskId);
	if (!wtPath || !existsSync(wtPath)) return "stale";
	return "claimed";
}

/**
 * Batch variant: resolves claim state for every id currently present in the
 * active-ids flag file in one pass (avoids re-reading the file per task). Ids
 * not present there are implicitly "unclaimed" and omitted from the returned
 * map — callers should treat a missing entry as "unclaimed".
 */
export function getCoordinatorClaimStates(backlogDir: string): Record<string, ClaimState> {
	const activeAgents = readActiveAgentIds(backlogDir);
	const result: Record<string, ClaimState> = {};
	for (const taskId of activeAgents) {
		const wtPath = readClaimedWorktreePath(backlogDir, taskId);
		result[taskId] = !wtPath || !existsSync(wtPath) ? "stale" : "claimed";
	}
	return result;
}
