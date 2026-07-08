/**
 * BACK-686 AC#6 / BACK-686.3 AC#5 — `kind:epic` is an overridable hint, not a
 * promote-time gate. Two things are true here, and this file is honest about
 * which is mechanically enforced by TypeScript vs which is LLM judgment:
 *
 *  1. Mechanically enforced (`gateAdjudicating`, `src/engine/adjudicate-gate.ts`):
 *     once a task reaches `adjudicating`, routing is decided by REAL children
 *     (`children.length > 0`), never by the `kind:epic` label. A label left over
 *     from before the decompose decision cannot silently misroute a task either
 *     direction. See the two precedence tests below.
 *  2. NOT mechanically enforced: the decompose test ITSELF (CLAUDE.md's two-part
 *     "≥2 deliverables AND ≥1.8x size margin" test) is applied by the LLM agent
 *     running `plugin/skills/primitive-executor/SKILL.md`'s Phase 0 — that
 *     judgment call has no deterministic TypeScript equivalent to unit-test.
 *     The override language for both directions (labeled-but-small stays leaf;
 *     unlabeled-but-large still decomposes) is documented there, not here.
 */
import { describe, expect, it } from "bun:test";
import { gateAdjudicating } from "../engine/adjudicate-gate.ts";
import type { Task } from "../types/index.ts";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Test Task",
		status: "Basic: Adjudicating",
		pipeline_id: "execution",
		phase: "adjudicating",
		assignee: [],
		labels: [],
		dependencies: [],
		body: "",
		...overrides,
	} as unknown as Task;
}

describe("gateAdjudicating routing precedence (AC#6) — real children override the kind:epic label, both directions", () => {
	it("kind:epic label but no real children (decompose test said 'stay leaf') routes through the primitive AC/DoD gate", async () => {
		const task = makeTask({
			labels: ["kind:epic"],
			acceptanceCriteriaItems: [{ index: 1, text: "works", checked: false }],
		});
		const result = await gateAdjudicating(task, [], [], "/fake/repo");
		expect(result.verdict).toBe("dispatch-skill");
	});

	it("no kind:epic label but real children exist (decompose test said 'decompose') routes through computeEpicVerdict's aggregation", async () => {
		const task = makeTask({ labels: [] });
		const child = makeTask({ id: "child-1", phase: "needs-human" });
		const result = await gateAdjudicating(task, [child], [], "/fake/repo");
		expect(result.verdict).toBe("needs-human");
	});
});
