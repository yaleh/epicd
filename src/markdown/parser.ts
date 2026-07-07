import matter from "gray-matter";
import { label, parseFields } from "../core/field-registry.ts";
import type { AcceptanceCriterion, Decision, Document, Milestone, ParsedMarkdown, Task } from "../types/index.ts";
import { roleOf } from "../types/index.ts";
import { normalizeDate } from "./date.ts";
import {
	AcceptanceCriteriaManager,
	CommentsManager,
	DefinitionOfDoneManager,
	extractStructuredSection,
	STRUCTURED_SECTION_KEYS,
} from "./structured-sections.ts";

function normalizeFlowList(prefix: string, rawValue: string): string | null {
	// Handle inline lists like assignee: [@user, "someone"]
	const match = rawValue.match(/^\[(.*)\]\s*(#.*)?$/);
	if (!match) return null;

	const listBody = match[1] ?? "";
	const comment = match[2];
	const items = listBody
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	const normalizedItems = items.map((entry) => {
		if (entry.startsWith("'") || entry.startsWith('"')) {
			return entry;
		}
		if (entry.startsWith("@")) {
			const escaped = entry.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			return `"${escaped}"`;
		}
		return entry;
	});

	const trailingComment = comment ? ` ${comment}` : "";
	return `${prefix}[${normalizedItems.join(", ")}]${trailingComment}`;
}

function preprocessFrontmatter(frontmatter: string): string {
	return frontmatter
		.split(/\r?\n/) // Handle both Windows (\r\n) and Unix (\n) line endings
		.map((line) => {
			// Handle both assignee and reporter fields that start with @
			const match = line.match(/^(\s*(?:assignee|reporter):\s*)(.*)$/);
			if (!match) return line;

			const prefix = match[1] ?? "";
			const raw = match[2] ?? "";
			const value = raw.trim();

			const normalizedFlowList = normalizeFlowList(prefix, value);
			if (normalizedFlowList !== null) {
				return normalizedFlowList;
			}

			if (
				value &&
				!value.startsWith("[") &&
				!value.startsWith("'") &&
				!value.startsWith('"') &&
				!value.startsWith("-")
			) {
				return `${prefix}"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
			}
			return line;
		})
		.join("\n"); // Always join with \n for consistent YAML parsing
}

export function parseMarkdown(content: string): ParsedMarkdown {
	// Updated regex to handle both Windows (\r\n) and Unix (\n) line endings
	const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
	const match = content.match(fmRegex);
	let toParse = content;

	if (match) {
		const processed = preprocessFrontmatter(match[1] || "");
		// Replace with consistent line endings
		toParse = content.replace(fmRegex, () => `---\n${processed}\n---`);
	}

	const parsed = matter(toParse);
	return {
		frontmatter: parsed.data,
		content: parsed.content.trim(),
	};
}

export function parseTask(content: string): Task {
	const { frontmatter, content: rawContent } = parseMarkdown(content);

	// Frontmatter fields are driven by the single FieldDescriptor registry.
	const fields = parseFields(frontmatter);

	// Parse structured acceptance criteria (checked/text/index) from all sections
	const structuredCriteria: AcceptanceCriterion[] = AcceptanceCriteriaManager.parseAllCriteria(rawContent);
	const structuredDefinitionOfDone: AcceptanceCriterion[] = DefinitionOfDoneManager.parseAllCriteria(rawContent);
	const comments = CommentsManager.parseAllComments(rawContent);

	// Parse other sections
	const descriptionSection = extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.description) || "";
	const planSection = extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.implementationPlan) || undefined;
	const notesSection = extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.implementationNotes) || undefined;
	const finalSummarySection = extractStructuredSection(rawContent, STRUCTURED_SECTION_KEYS.finalSummary) || undefined;

	return {
		...fields,
		id: fields.id ?? "",
		title: fields.title ?? "",
		status: fields.phase ? label(roleOf(fields as Task), fields.phase) : (fields.status ?? ""),
		assignee: fields.assignee ?? [],
		createdDate: fields.createdDate ?? "",
		labels: fields.labels ?? [],
		dependencies: fields.dependencies ?? [],
		rawContent,
		acceptanceCriteriaItems: structuredCriteria,
		definitionOfDoneItems: structuredDefinitionOfDone,
		description: descriptionSection,
		implementationPlan: planSection,
		implementationNotes: notesSection,
		comments,
		finalSummary: finalSummarySection,
	};
}

export function parseDecision(content: string): Decision {
	const { frontmatter, content: rawContent } = parseMarkdown(content);

	return {
		id: String(frontmatter.id || ""),
		title: String(frontmatter.title || ""),
		date: normalizeDate(frontmatter.date),
		status: String(frontmatter.status || "proposed") as Decision["status"],
		context: extractSection(rawContent, "Context") || "",
		decision: extractSection(rawContent, "Decision") || "",
		consequences: extractSection(rawContent, "Consequences") || "",
		alternatives: extractSection(rawContent, "Alternatives"),
		rawContent, // Raw markdown content without frontmatter
	};
}

export function parseDocument(content: string): Document {
	const { frontmatter, content: rawContent } = parseMarkdown(content);

	return {
		id: String(frontmatter.id || ""),
		title: String(frontmatter.title || ""),
		type: String(frontmatter.type || "other") as Document["type"],
		createdDate: normalizeDate(frontmatter.created_date),
		updatedDate: frontmatter.updated_date ? normalizeDate(frontmatter.updated_date) : undefined,
		rawContent,
		tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : undefined,
	};
}

export function parseMilestone(content: string): Milestone {
	const { frontmatter, content: rawContent } = parseMarkdown(content);

	return {
		id: String(frontmatter.id || ""),
		title: String(frontmatter.title || ""),
		description: extractSection(rawContent, "Description") || "",
		rawContent,
	};
}

/**
 * Extract a `## <sectionTitle>` subsection's body from raw markdown content (e.g. a
 * task's `description` field, which itself commonly nests its own `## `-headed
 * subsections like `## Integration Acceptance`). Exported so callers elsewhere in the
 * codebase (e.g. `harness/evaluator.ts` extracting an epic's own Integration
 * Acceptance) reuse this single regex-based extractor instead of re-implementing it.
 */
export function extractSection(content: string, sectionTitle: string): string | undefined {
	// Normalize to LF for reliable matching across platforms
	const src = content.replace(/\r\n/g, "\n");
	const regex = new RegExp(`## ${sectionTitle}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
	const match = src.match(regex);
	return match?.[1]?.trim();
}
