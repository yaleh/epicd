import { describe, expect, it } from "bun:test";
import { FIELD_DESCRIPTORS, serializeFields } from "../core/field-registry.ts";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import { roleOf, type Task } from "../types/index.ts";

/**
 * A minimal, valid Task with only the required fields populated. Individual
 * round-trip cases layer one descriptor's field on top of this base.
 */
function baseTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Registry Task",
		status: "Backlog",
		assignee: [],
		createdDate: "2026-07-04",
		labels: [],
		dependencies: [],
		...overrides,
	};
}

/**
 * A representative in-memory value per descriptor, used to prove
 * parse(serialize(x)) === x round-trips and that presence-gating emits the key.
 */
const SAMPLES: Record<string, Partial<Task>> = {
	id: { id: "task-42" },
	title: { title: "Some Title" },
	status: { status: "In Progress" },
	assignee: { assignee: ["@alice", "@bob"] },
	reporter: { reporter: "@carol" },
	created_date: { createdDate: "2026-07-04" },
	updated_date: { updatedDate: "2026-07-05" },
	labels: { labels: ["core", "engine"] },
	milestone: { milestone: "M1" },
	dependencies: { dependencies: ["task-2", "task-3"] },
	references: { references: ["docs/adr/ADR-011.md"] },
	documentation: { documentation: ["https://example.com/doc"] },
	modified_files: { modifiedFiles: ["src/core/field-registry.ts"] },
	parent_task_id: { parentTaskId: "task-0" },
	subtasks: { subtasks: ["task-1.1", "task-1.2"] },
	priority: { priority: "high" },
	ordinal: { ordinal: 2000 },
	onStatusChange: { onStatusChange: "echo hi" },
	pipeline_id: { pipeline_id: "execution" },
	phase: { phase: "implementing" },
	parent_id: { parent_id: "task-0" },
	provenance: { provenance: { spawned_from: "task-9" } },
	dod: { dod: [{ text: "tests pass", checked: false }] },
	cap: { cap: [{ kind: "safety", value: "L2" }] },
	refine_log: { refine_log: ["drafted", "reviewed"] },
	entry_phase: { entry_phase: "authoring/refining" },
	retreat_log: {
		retreat_log: [
			{
				ts: "2026-07-05T00:00:00.000Z",
				from: "execution/adjudicating",
				toPhase: "authoring/refining",
				gapFingerprint: "abc123",
				classification: "spec",
				contract: { keep: ["AC#1"], missing: [], wrong: [] },
			},
		],
	},
	gap_history: { gap_history: ["abc123"] },
};

describe("FieldDescriptor registry", () => {
	it("registers exactly the expected fields in serialize order", () => {
		const keys = FIELD_DESCRIPTORS.map((d) => d.yamlKey);
		expect(keys).toEqual([
			"id",
			"title",
			"status",
			"assignee",
			"reporter",
			"created_date",
			"updated_date",
			"labels",
			"milestone",
			"dependencies",
			"references",
			"documentation",
			"modified_files",
			"parent_task_id",
			"subtasks",
			"priority",
			"ordinal",
			"onStatusChange",
			"pipeline_id",
			"phase",
			"parent_id",
			"provenance",
			"dod",
			"cap",
			"refine_log",
			"entry_phase",
			"retreat_log",
			"gap_history",
		]);
	});

	describe("round-trips per descriptor (parse(serialize(x)) === x + presence emitted)", () => {
		for (const descriptor of FIELD_DESCRIPTORS) {
			it(`${descriptor.yamlKey}`, () => {
				const sample = SAMPLES[descriptor.yamlKey];
				if (!sample) throw new Error(`missing sample for ${descriptor.yamlKey}`);
				const task = baseTask(sample);

				// Presence: a populated field emits its key on serialize.
				const frontmatter = serializeFields(task);
				expect(Object.hasOwn(frontmatter, descriptor.yamlKey)).toBe(true);

				// Round-trip through the real markdown serializer + parser.
				const reparsed = parseTask(serializeTask(task));
				const expectedValue = (sample as Record<string, unknown>)[descriptor.tsName];
				expect((reparsed as unknown as Record<string, unknown>)[descriptor.tsName]).toEqual(expectedValue);
			});
		}
	});

	it("omits empty/absent engine fields on serialize (presence-gating, constraint 1)", () => {
		// Empty-string and undefined engine fields must NOT emit a key.
		const task = baseTask({
			pipeline_id: "",
			phase: undefined,
			parent_id: "",
			provenance: undefined,
			dod: [],
			cap: [],
			refine_log: [],
		});
		const frontmatter = serializeFields(task);
		expect(Object.hasOwn(frontmatter, "pipeline_id")).toBe(false);
		expect(Object.hasOwn(frontmatter, "phase")).toBe(false);
		expect(Object.hasOwn(frontmatter, "parent_id")).toBe(false);
		expect(Object.hasOwn(frontmatter, "provenance")).toBe(false);
		expect(Object.hasOwn(frontmatter, "dod")).toBe(false);
		expect(Object.hasOwn(frontmatter, "cap")).toBe(false);
		expect(Object.hasOwn(frontmatter, "refine_log")).toBe(false);

		const serialized = serializeTask(task);
		expect(serialized).not.toContain("pipeline_id");
		expect(serialized).not.toContain("phase:");
		expect(serialized).not.toContain("parent_id:");
		expect(serialized).not.toContain("\ndod:");
		expect(serialized).not.toContain("\ncap:");
		expect(serialized).not.toContain("refine_log");
	});

	it("refine_log round-trips and is absent by default", () => {
		expect(Object.hasOwn(serializeFields(baseTask()), "refine_log")).toBe(false);

		const task = baseTask({ refine_log: ["step-1", "step-2"] });
		const reparsed = parseTask(serializeTask(task));
		expect(reparsed.refine_log).toEqual(["step-1", "step-2"]);
	});

	describe("mcpSchema exposure (ADR-011 D-5)", () => {
		const invisibleFields = ["id", "created_date", "updated_date", "subtasks", "cap", "refine_log", "reporter"];

		it.each(invisibleFields)("%s has mcpSchema === undefined (MCP-invisible)", (yamlKey) => {
			const descriptor = FIELD_DESCRIPTORS.find((d) => d.yamlKey === yamlKey);
			expect(descriptor?.mcpSchema).toBeUndefined();
		});

		it("labels/assignee/dependencies/references/documentation/modified_files expose JSON-Schema fragments", () => {
			for (const yamlKey of ["labels", "assignee", "dependencies", "references", "documentation", "modified_files"]) {
				const descriptor = FIELD_DESCRIPTORS.find((d) => d.yamlKey === yamlKey);
				expect(descriptor?.mcpSchema).toBeDefined();
				expect(descriptor?.mcpSchema?.type).toBe("array");
			}
		});

		it("pipeline_id/phase/parent_id expose string mcpSchema fragments", () => {
			for (const yamlKey of ["pipeline_id", "phase", "parent_id"]) {
				const descriptor = FIELD_DESCRIPTORS.find((d) => d.yamlKey === yamlKey);
				expect(descriptor?.mcpSchema).toEqual({ type: "string" });
			}
		});

		it("dod exposes mcpKey 'dodGates' with an array-of-string mcpSchema", () => {
			const descriptor = FIELD_DESCRIPTORS.find((d) => d.yamlKey === "dod");
			expect(descriptor?.mcpKey).toBe("dodGates");
			expect(descriptor?.mcpSchema?.type).toBe("array");
			expect(descriptor?.mcpSchema?.items?.type).toBe("string");
		});
	});

	describe("roleOf derivation (leaf vs compound)", () => {
		it("derives primitive for a leaf (no children)", () => {
			expect(roleOf(baseTask())).toBe("primitive");
		});

		it("derives compound when the task has children", () => {
			expect(roleOf(baseTask({ subtasks: ["task-1.1"] }))).toBe("compound");
			expect(roleOf(baseTask(), ["task-1.1"])).toBe("compound");
		});

		it("derives compound for a pre-decompose epic via kind:epic label (BACK-643)", () => {
			expect(roleOf(baseTask({ labels: ["kind:epic"] }))).toBe("compound");
		});

		it("children still win over kind:epic label when both are present", () => {
			expect(roleOf(baseTask({ labels: ["kind:epic"], subtasks: ["task-1.1"] }))).toBe("compound");
		});

		it("does not derive compound from unrelated labels", () => {
			expect(roleOf(baseTask({ labels: ["kind:bug"] }))).toBe("primitive");
		});
	});
});
