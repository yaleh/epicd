/**
 * MVD Manifest — the explicit "minimum viable driver core" definition.
 *
 * MVD_SOURCE_FILES: source files that constitute the minimal driver core.
 *   Each path is relative to the repo root (src/engine/* + src/harness/*).
 *   A rebuilt driver must include non-empty copies of all these files to be
 *   considered a valid reconstruction.
 *
 * MVD_TEST_FILES: test files that form the "same suite" referenced in Stage 2.
 *   Running these on a rebuilt repo tree must pass to satisfy the gate criterion.
 *   This is the engine sub-suite — NOT the full test suite (which includes CLI,
 *   MCP, and other tests that depend on the full installed package surface).
 *
 * Both lists are used by:
 *   - stage2-manifest.test.ts (structure validation + necessity guard on a toy fixture)
 *   - `engine stage2-gate --rebuilt <path>` CLI (real manifest gate against a rebuilt tree)
 *
 * IMPORTANT: These manifests are only consumed via the CLI command for real gate runs.
 * In-suite tests use toy fixtures (never the real manifest paths) to avoid
 * recursive test execution and parent bunfig bleed-through (architect E).
 */

import { join } from "node:path";

/** Source files constituting the minimal driver core (relative to repo root). */
export const MVD_SOURCE_FILES: string[] = [
	// Engine core
	"src/engine/pipeline.ts",
	"src/engine/interpreter.ts",
	"src/engine/driver.ts",
	"src/engine/adjudicate.ts",
	"src/engine/complete.ts",
	"src/engine/run.ts",
	"src/engine/safety.ts",
	"src/engine/store.ts",
	"src/engine/sandbox.ts",
	"src/engine/spawn.ts",
	// Harness seam
	"src/harness/worker-runner.ts",
	"src/harness/decomposer.ts",
	"src/harness/dod-runner.ts",
	"src/harness/real-primitives.ts",
];

/**
 * Test files that constitute the "same suite" for Stage 2.
 * These are the engine-specific tests that exercise the MVD source files.
 * Running `bun test <...MVD_TEST_FILES>` on the rebuilt tree must pass.
 */
export const MVD_TEST_FILES: string[] = [
	"src/test/engine-interpreter.test.ts",
	"src/test/engine-driver.test.ts",
	"src/test/engine-adjudicate.test.ts",
	"src/test/engine-complete.test.ts",
	"src/test/engine-run.test.ts",
	"src/test/engine-safety-cap.test.ts",
	"src/test/engine-safety-merge.test.ts",
	"src/test/engine-safety-worktree.test.ts",
	"src/test/engine-spawn-complete.test.ts",
	"src/test/engine-tracer-fixpoint.test.ts",
];

/**
 * Resolve a manifest entry to an absolute path given the repo root.
 * Exported for test use (join with a temp dir for toy fixtures).
 */
export function resolveManifestPath(repoRoot: string, relativePath: string): string {
	return join(repoRoot, relativePath);
}
