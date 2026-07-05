/**
 * Historical co-change signal (ADR-016 D2/D3) — the second, more expensive orthogonality
 * tier: file pairs that don't overlap in this decompose's declared `touches` (BACK-626.2 /
 * ADR-016 D1) but have historically changed together often enough to suggest hidden coupling
 * (the baime TASK-206→210 daemon-lifecycle shape: looked independent, wasn't).
 *
 * Design note (BACK-626.3 research): baime's task-148 ("skill 库本征维度度量原型") is the
 * origin of this signal, but it is an unstarted Epic (status "Epic: Proposal") with no
 * runnable code — only a design sketch (git log --name-only cochange counts → coupling
 * matrix → spectral/eigenvalue analysis for an intrinsic-dimension estimate). There is
 * nothing to port; only the git log --name-only counting idea carries over. ADR-016 D3
 * already narrows the contract to pairwise coupling counts + a threshold (no matrix, no
 * spectral analysis — that machinery solves a different problem, estimating a library-wide
 * intrinsic dimension, not flagging pairwise overlap for a single decompose), so this is a
 * from-scratch implementation of the D3 contract rather than a migration of baime code.
 */

import type { ProposedChild } from "./decomposer.ts";

/** Primitive that returns raw `git log` history for cochange counting (real Bun.spawn or a
 *  test double). Runs once per decompose call — no caching (see perf note below). */
export type GitLogPrimitive = (repoPath: string) => Promise<string>;

export const realGitLog: GitLogPrimitive = async (repoPath) => {
	const proc = Bun.spawn(["git", "log", "--pretty=format:%ct%x00", "--name-only", "-z"], {
		cwd: repoPath,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "ignore",
	});
	const stdout = proc.stdout ? await new Response(proc.stdout).text() : "";
	await proc.exited;
	return stdout;
};

/** Parse `git log --pretty=format:%ct%x00 --name-only -z` output into one file-list per
 *  commit (timestamp markers are pure-digit tokens; everything else is a changed file). */
function parseCommits(raw: string): string[][] {
	const parts = raw.split("\0").filter(Boolean);
	const commits: string[][] = [];
	let current: string[] | null = null;
	for (const part of parts) {
		const trimmed = part.trim();
		if (/^\d+$/.test(trimmed)) {
			current = [];
			commits.push(current);
		} else if (current) {
			current.push(trimmed);
		}
	}
	return commits;
}

/** One cross-sibling file pair whose historical cochange count meets the threshold (ADR-016 D2/D3). */
export interface CochangeOverlap {
	a: string;
	b: string;
	files: [string, string];
	count: number;
}

/**
 * For all sibling pairs with declared `touches` (BACK-626.2), find cross-set file pairs that
 * historically changed together at least `threshold` times.
 *
 * Perf bound (ADR-016 D3): one full `git log --name-only` walk per call (O(commits)), and
 * pairwise counting is restricted to the union of declared `touches` files, not the whole
 * repo (so cost doesn't scale with total file count). No caching — decompose runs once per
 * epic, so a single full-history walk is acceptable at current scale. If repo history growth
 * makes this slow, the fix is caching/incremental update (explicitly deferred to future work
 * by ADR-016 D3, not implemented here since there is no proven need yet).
 */
export async function findCochangeOverlaps(
	children: ProposedChild[],
	repoPath: string,
	opts?: { threshold?: number; gitLog?: GitLogPrimitive },
): Promise<CochangeOverlap[]> {
	const threshold = opts?.threshold ?? 3;
	const gitLog = opts?.gitLog ?? realGitLog;

	const interesting = new Set(children.flatMap((c) => c.touches ?? []));
	if (interesting.size === 0) return [];

	const commits = parseCommits(await gitLog(repoPath));

	const pairCounts = new Map<string, number>();
	for (const files of commits) {
		const present = files.filter((f) => interesting.has(f));
		for (const [pi, fileA] of present.entries()) {
			for (const fileB of present.slice(pi + 1)) {
				const [x, y] = fileA < fileB ? [fileA, fileB] : [fileB, fileA];
				const key = `${x}\0${y}`;
				pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
			}
		}
	}

	const overlaps: CochangeOverlap[] = [];
	for (const [i, childA] of children.entries()) {
		if (!childA.touches || childA.touches.length === 0) continue;
		for (const childB of children.slice(i + 1)) {
			if (!childB.touches || childB.touches.length === 0) continue;
			for (const fileA of childA.touches) {
				for (const fileB of childB.touches) {
					if (fileA === fileB) continue; // declared overlap is D1's job, not D2's
					const [x, y] = fileA < fileB ? [fileA, fileB] : [fileB, fileA];
					const count = pairCounts.get(`${x}\0${y}`) ?? 0;
					if (count >= threshold) {
						overlaps.push({ a: childA.title, b: childB.title, files: [fileA, fileB], count });
					}
				}
			}
		}
	}
	return overlaps;
}
