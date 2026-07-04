/**
 * Phase 0 guard: assert the stub Stage 2 test file has been deleted.
 *
 * The file src/test/engine-stage2-selfhost-fixpoint.test.ts was a stub:
 *   - reconstructed pipeline spec by JSON.parse of test-planted task descriptions
 *   - rebuilt 0 source files, drove 0 workers, ran 0 suite on a rebuilt tree
 * It was not a valid Stage 2 gate (§15.1). This test asserts it is gone.
 */

import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("stage2-no-fake", () => {
	it("engine-stage2-selfhost-fixpoint.test.ts (the stub) must not exist", () => {
		// Resolve relative to this file's directory (src/test/)
		const stubPath = join(import.meta.dir, "engine-stage2-selfhost-fixpoint.test.ts");
		expect(existsSync(stubPath)).toBe(false);
	});
});
