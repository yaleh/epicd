import { describe, expect, it } from "bun:test";
import { FIELD_DESCRIPTORS } from "../core/field-registry.ts";
import { generateTaskCreateSchema, generateTaskEditSchema } from "../mcp/utils/schema-generators.ts";
import type { BacklogConfig } from "../types/index.ts";

const REGISTRY_DERIVED_FIELDS = ["labels", "assignee", "dependencies", "references", "documentation", "modifiedFiles"];

function testConfig(): BacklogConfig {
	return {
		projectName: "Schema Generators Test",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		dateFormat: "yyyy-mm-dd",
	};
}

describe("schema-generators derive from FIELD_DESCRIPTORS", () => {
	it("generateTaskCreateSchema derives labels/assignee/dependencies/references/documentation/modifiedFiles from FIELD_DESCRIPTORS", () => {
		const schema = generateTaskCreateSchema(testConfig());
		for (const tsName of REGISTRY_DERIVED_FIELDS) {
			const descriptor = FIELD_DESCRIPTORS.find((d) => d.tsName === tsName);
			expect(descriptor?.mcpSchema).toBeDefined();
			expect(schema.properties?.[tsName]).toEqual(descriptor?.mcpSchema);
		}
	});

	it("generateTaskEditSchema derives the same base field shapes as create, plus add/remove variants reusing the field's item schema", () => {
		const editSchema = generateTaskEditSchema(testConfig());
		for (const tsName of REGISTRY_DERIVED_FIELDS) {
			const descriptor = FIELD_DESCRIPTORS.find((d) => d.tsName === tsName);
			expect(editSchema.properties?.[tsName]).toEqual(descriptor?.mcpSchema);
		}

		expect(editSchema.properties?.addReferences?.items).toEqual(editSchema.properties?.references?.items);
		expect(editSchema.properties?.removeReferences?.items).toEqual(editSchema.properties?.references?.items);
		expect(editSchema.properties?.addDocumentation?.items).toEqual(editSchema.properties?.documentation?.items);
		expect(editSchema.properties?.removeDocumentation?.items).toEqual(editSchema.properties?.documentation?.items);
	});

	it("status/milestone/ordinal/id/title schema fragments are unchanged by the refactor", () => {
		const config = testConfig();
		const createSchema = generateTaskCreateSchema(config);
		const editSchema = generateTaskEditSchema(config);

		expect(createSchema.properties?.title).toEqual({ type: "string", minLength: 1, maxLength: 200 });
		expect(createSchema.properties?.milestone).toEqual({
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "Optional milestone label (trimmed).",
		});
		expect(createSchema.properties?.ordinal).toEqual({
			type: "number",
			minimum: 0,
			description:
				"Optional non-negative ordering value for manual task ordering. Lower values sort earlier. Prefer spaced integers such as 1000, 2000, 3000 to leave room for inserts.",
		});

		expect(editSchema.properties?.id).toEqual({ type: "string", minLength: 1, maxLength: 50 });
		expect(editSchema.properties?.title).toEqual({ type: "string", maxLength: 200 });
		expect(editSchema.properties?.milestone).toEqual({
			type: "string",
			minLength: 1,
			maxLength: 100,
			description: "Set milestone label (string) or clear it (null).",
		});
		expect(editSchema.properties?.ordinal).toEqual({
			type: "number",
			minimum: 0,
			description:
				"Set task ordinal for manual ordering. Lower values sort earlier. Prefer spaced integers such as 1000, 2000, 3000 to leave room for inserts.",
		});
	});

	it("createSchema and editSchema expose identical engine-field shapes (pipeline_id, phase, parent_id, dodGates)", () => {
		const config = testConfig();
		const createSchema = generateTaskCreateSchema(config);
		const editSchema = generateTaskEditSchema(config);

		for (const field of ["pipeline_id", "phase", "parent_id", "dodGates"]) {
			expect(createSchema.properties?.[field]).toBeDefined();
			expect(createSchema.properties?.[field]).toEqual(editSchema.properties?.[field]);
		}
		expect(editSchema.properties?.dodGates?.items).toEqual({ type: "string", maxLength: 500 });
	});
});
