import { normalizeDate } from "../markdown/date.ts";
import type { JsonSchema } from "../mcp/validation/validators.ts";
import type { CapMarker, DoDItem, Task } from "../types/index.ts";
import { roleOf } from "../types/index.ts";

/**
 * A single source of truth for how one Task field maps to/from YAML frontmatter.
 *
 * The registry (`FIELD_DESCRIPTORS`) is iterated by both the parser and the
 * serializer so that field handling lives in exactly one place (ADR-011 D-5:
 * no `if (field === "cap")` scattered through the engine core — every field,
 * including the engine fields, is a declarative descriptor instance).
 *
 * Serialization contract (presence-gating, hard constraint from BACK-601 D2):
 * a descriptor is only emitted when `present(task)` is true. This preserves the
 * historical `...(task.phase && { phase })` behavior — an empty-string or
 * `undefined` engine field omits its key entirely and does not churn files.
 */
export interface FieldDescriptor<T = unknown> {
	/** Key as written in the YAML frontmatter. */
	readonly yamlKey: string;
	/** Property name on the in-memory `Task` object. */
	readonly tsName: keyof Task;
	/** Coarse type tag (documentation / tooling aid). */
	readonly type: "string" | "string[]" | "number" | "enum" | "dod" | "cap" | "log" | "object";
	/** Read the value from raw parsed frontmatter. */
	readonly parse: (frontmatter: Record<string, unknown>) => T;
	/** Produce the YAML value for a present field. */
	readonly serialize: (value: T) => unknown;
	/** Whether the field should be written at all (presence-gating). */
	readonly present: (task: Task) => boolean;
	/** Optional validation of a parsed value. */
	readonly validate?: (value: T) => boolean;
	/**
	 * The MCP/CLI-accepted input shape for this field (ADR-011 D-5). Undefined
	 * means the field is not exposed on the MCP create/edit schemas (e.g. it is
	 * internal-only, derived, or has genuinely different create/edit semantics
	 * that stay hand-written in schema-generators.ts).
	 */
	readonly mcpSchema?: JsonSchema;
	/**
	 * The property name to use on the MCP schema/input object when it differs
	 * from `tsName` (e.g. `dod` is stored internally as `DoDItem[]` but accepted
	 * over MCP as `dodGates: string[]`). Defaults to `tsName` when unset.
	 */
	readonly mcpKey?: string;
}

function normalizeStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Registered fields, in the exact order they must appear in serialized
 * frontmatter. Changing this order changes on-disk byte output, so keep it
 * aligned with the historical hand-written serializer key order.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous descriptor value types; each entry is authored with a concrete T.
export const FIELD_DESCRIPTORS: readonly FieldDescriptor<any>[] = [
	{
		yamlKey: "id",
		tsName: "id",
		type: "string",
		parse: (fm) => String(fm.id || ""),
		serialize: (v) => v,
		present: () => true,
	} as FieldDescriptor<string>,
	{
		yamlKey: "title",
		tsName: "title",
		type: "string",
		parse: (fm) => String(fm.title || ""),
		serialize: (v) => v,
		present: () => true,
	} as FieldDescriptor<string>,
	{
		yamlKey: "status",
		tsName: "status",
		type: "string",
		parse: (fm) => String(fm.status || ""),
		serialize: (v) => v,
		present: (task) => Boolean(task.status && !task.pipeline_id),
	} as FieldDescriptor<string>,
	{
		yamlKey: "assignee",
		tsName: "assignee",
		type: "string[]",
		parse: (fm) => (Array.isArray(fm.assignee) ? fm.assignee.map(String) : fm.assignee ? [String(fm.assignee)] : []),
		serialize: (v) => v,
		present: () => true,
		mcpSchema: {
			type: "array",
			items: {
				type: "string",
				maxLength: 100,
			},
		},
	} as FieldDescriptor<string[]>,
	{
		yamlKey: "reporter",
		tsName: "reporter",
		type: "string",
		parse: (fm) => (fm.reporter ? String(fm.reporter) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.reporter),
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "created_date",
		tsName: "createdDate",
		type: "string",
		parse: (fm) => normalizeDate(fm.created_date),
		serialize: (v) => v,
		present: () => true,
	} as FieldDescriptor<string>,
	{
		yamlKey: "updated_date",
		tsName: "updatedDate",
		type: "string",
		parse: (fm) => (fm.updated_date ? normalizeDate(fm.updated_date) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.updatedDate),
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "labels",
		tsName: "labels",
		type: "string[]",
		parse: (fm) => normalizeStringArray(fm.labels),
		serialize: (v) => v,
		present: () => true,
		mcpSchema: {
			type: "array",
			items: {
				type: "string",
				maxLength: 50,
			},
		},
	} as FieldDescriptor<string[]>,
	{
		yamlKey: "milestone",
		tsName: "milestone",
		type: "string",
		parse: (fm) => (fm.milestone ? String(fm.milestone) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.milestone),
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "dependencies",
		tsName: "dependencies",
		type: "string[]",
		parse: (fm) => normalizeStringArray(fm.dependencies),
		serialize: (v) => v,
		present: () => true,
		mcpSchema: {
			type: "array",
			items: {
				type: "string",
				maxLength: 50,
			},
		},
	} as FieldDescriptor<string[]>,
	{
		yamlKey: "references",
		tsName: "references",
		type: "string[]",
		parse: (fm) => (Array.isArray(fm.references) ? fm.references.map(String) : []),
		serialize: (v) => v,
		present: (task) => Boolean(task.references && task.references.length > 0),
		mcpSchema: {
			type: "array",
			items: {
				type: "string",
				maxLength: 500,
			},
			description: "Reference URLs or file paths related to this task",
		},
	} as FieldDescriptor<string[]>,
	{
		yamlKey: "documentation",
		tsName: "documentation",
		type: "string[]",
		parse: (fm) => (Array.isArray(fm.documentation) ? fm.documentation.map(String) : []),
		serialize: (v) => v,
		present: (task) => Boolean(task.documentation && task.documentation.length > 0),
		mcpSchema: {
			type: "array",
			items: {
				type: "string",
				maxLength: 500,
			},
			description: "Documentation URLs or file paths for understanding this task",
		},
	} as FieldDescriptor<string[]>,
	{
		yamlKey: "modified_files",
		tsName: "modifiedFiles",
		type: "string[]",
		parse: (fm) => (Array.isArray(fm.modified_files) ? fm.modified_files.map(String) : []),
		serialize: (v) => v,
		present: (task) => Boolean(task.modifiedFiles && task.modifiedFiles.length > 0),
		mcpSchema: {
			type: "array",
			items: {
				type: "string",
				maxLength: 500,
			},
			description: "Project-root-relative file paths modified by this task",
		},
	} as FieldDescriptor<string[]>,
	{
		yamlKey: "parent_task_id",
		tsName: "parentTaskId",
		type: "string",
		parse: (fm) => (fm.parent_task_id ? String(fm.parent_task_id) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.parentTaskId),
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "subtasks",
		tsName: "subtasks",
		type: "string[]",
		parse: (fm) => (Array.isArray(fm.subtasks) ? fm.subtasks.map(String) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.subtasks && task.subtasks.length > 0),
	} as FieldDescriptor<string[] | undefined>,
	{
		yamlKey: "priority",
		tsName: "priority",
		type: "enum",
		parse: (fm) => {
			const priority = fm.priority ? String(fm.priority).toLowerCase() : undefined;
			return priority && ["high", "medium", "low"].includes(priority)
				? (priority as "high" | "medium" | "low")
				: undefined;
		},
		serialize: (v) => v,
		present: (task) => Boolean(task.priority),
		validate: (v) => v === undefined || v === "high" || v === "medium" || v === "low",
	} as FieldDescriptor<"high" | "medium" | "low" | undefined>,
	{
		yamlKey: "ordinal",
		tsName: "ordinal",
		type: "number",
		parse: (fm) => (fm.ordinal !== undefined ? Number(fm.ordinal) : undefined),
		serialize: (v) => v,
		present: (task) => task.ordinal !== undefined,
	} as FieldDescriptor<number | undefined>,
	{
		yamlKey: "onStatusChange",
		tsName: "onStatusChange",
		type: "string",
		parse: (fm) => (fm.onStatusChange ? String(fm.onStatusChange) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.onStatusChange),
	} as FieldDescriptor<string | undefined>,
	// --- Engine pipeline fields (four-axis model). Presence-gated: an empty or
	// absent engine field must omit its key (hard constraint from BACK-601 D2).
	{
		yamlKey: "pipeline_id",
		tsName: "pipeline_id",
		type: "string",
		parse: (fm) => (fm.pipeline_id ? String(fm.pipeline_id) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.pipeline_id),
		mcpSchema: { type: "string" },
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "phase",
		tsName: "phase",
		type: "string",
		parse: (fm) => (fm.phase ? String(fm.phase) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.phase),
		mcpSchema: { type: "string" },
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "parent_id",
		tsName: "parent_id",
		type: "string",
		parse: (fm) => (fm.parent_id ? String(fm.parent_id) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.parent_id),
		mcpSchema: { type: "string" },
	} as FieldDescriptor<string | undefined>,
	{
		yamlKey: "provenance",
		tsName: "provenance",
		type: "object",
		// Object-valued but round-trips the same way every other presence-gated
		// field does: parse straight from frontmatter, serialize straight back,
		// omit the key when absent (BACK-603 603.2).
		parse: (fm) => {
			const raw = fm.provenance as { spawned_from?: unknown } | undefined;
			return raw && typeof raw.spawned_from === "string" ? { spawned_from: raw.spawned_from } : undefined;
		},
		serialize: (v) => v,
		present: (task) => Boolean(task.provenance?.spawned_from),
		mcpSchema: {
			type: "object",
			properties: { spawned_from: { type: "string" } },
			required: ["spawned_from"],
			description: "Cross-pipeline derivation edge: id of the task in another pipeline this task was spawned from.",
		},
	} as FieldDescriptor<{ spawned_from: string } | undefined>,
	{
		yamlKey: "dod",
		tsName: "dod",
		type: "dod",
		parse: (fm) =>
			Array.isArray(fm.dod)
				? (fm.dod as DoDItem[]).map((item) => ({ text: String(item.text), checked: Boolean(item.checked) }))
				: undefined,
		serialize: (v) => v,
		present: (task) => Boolean(task.dod && task.dod.length > 0),
		// MCP input shape diverges from the internal type on purpose (ADR-011 D-5):
		// callers pass plain shell-command strings (`dodGates: string[]`), which are
		// transformed into `DoDItem[]` (`{ text, checked: false }`) at the create/update
		// boundary — not a bug to unify, `dod` itself also carries `checked` state.
		mcpSchema: {
			type: "array",
			items: { type: "string", maxLength: 500 },
			description: "Structured executable Definition of Done gates (shell commands re-run before merging).",
		},
		mcpKey: "dodGates",
	} as FieldDescriptor<DoDItem[] | undefined>,
	{
		yamlKey: "cap",
		tsName: "cap",
		type: "cap",
		parse: (fm) => (Array.isArray(fm.cap) ? (fm.cap as CapMarker[]) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.cap && task.cap.length > 0),
	} as FieldDescriptor<CapMarker[] | undefined>,
	// Net-new field (BACK-601 A): round-trips like the others; absent by default.
	{
		yamlKey: "refine_log",
		tsName: "refine_log",
		type: "log",
		parse: (fm) => (Array.isArray(fm.refine_log) ? fm.refine_log.map(String) : undefined),
		serialize: (v) => v,
		present: (task) => Boolean(task.refine_log && task.refine_log.length > 0),
	} as FieldDescriptor<string[] | undefined>,
];

/**
 * Parse the registered fields out of raw frontmatter into a partial Task.
 * Non-registered concerns (body sections, comments, etc.) are handled by the
 * caller.
 */
export function parseFields(frontmatter: Record<string, unknown>): Partial<Task> {
	const out: Record<string, unknown> = {};
	for (const descriptor of FIELD_DESCRIPTORS) {
		out[descriptor.tsName] = descriptor.parse(frontmatter);
	}
	return out as Partial<Task>;
}

/**
 * Build the frontmatter object for a task by iterating the registry, applying
 * each descriptor's presence-gating. Key order follows FIELD_DESCRIPTORS.
 */
export function serializeFields(task: Task): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	for (const descriptor of FIELD_DESCRIPTORS) {
		if (!descriptor.present(task)) continue;
		frontmatter[descriptor.yamlKey] = descriptor.serialize(task[descriptor.tsName]);
	}
	return frontmatter;
}

/** Title-case a bare kebab-case phase name, e.g. "needs-human" → "Needs Human". */
function titleCasePhase(phase: string): string {
	return phase
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * The single `label(role, phase)` projection (BACK-601.4 / AC#5; collapsed to
 * phase-only display by BACK-664 child 1 / BACK-665 AC#2).
 *
 * Per-task persists only structural axes `(pipeline_id, bare phase)` and a
 * derived `role`; the human-facing status *display* string is computed here
 * and nowhere else. The display string is purely a function of `phase` — no
 * `Basic:`/`Epic:` role prefix is ever generated. Whether a task is compound
 * (has children) is a *separate* has-children indicator rendered independently
 * by callers, never concatenated into the status string. The `role` parameter
 * is kept for call-site compatibility but no longer affects the output.
 *
 * `turn`/`role` remain derived and are never persisted (turn = pipeline actor,
 * generalized in E3; role = tree position via roleOf()).
 */
export function label(_role: "compound" | "primitive", phase: string, statuses: readonly string[] = []): string {
	const target = titleCasePhase(phase).toLowerCase();
	const configured = statuses.find((s) => s.trim().toLowerCase() === target);
	return configured ?? titleCasePhase(phase);
}

/**
 * Resolve a task's display status — the single read the human-facing surfaces
 * (web/CLI/board/status-callback) should use. When the task carries an engine
 * `phase`, the display string is *derived* via label(roleOf(task), phase),
 * converging the implicit status-vs-phase split (the persisted `status` string
 * can go stale as the engine advances `phase`). Non-engine tasks fall back to
 * the persisted `status`.
 */
export function displayStatus(task: Task, statuses: readonly string[] = []): string {
	if (task.phase) return label(roleOf(task), task.phase, statuses);
	return task.status ?? "";
}
