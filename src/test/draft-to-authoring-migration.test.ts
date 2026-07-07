/**
 * Tests for the draft-to-authoring-task migration invariants.
 *
 * These tests verify that:
 * - Migrated tasks have pipeline_id=authoring and phase=draft
 * - Title, body, created_date are preserved from the source draft
 * - No DRAFT-specific frontmatter (DRAFT-N id, status) remains
 */

import { describe, expect, it } from "bun:test";

// Minimal re-implementation of migration logic for unit-testing purposes.
// This mirrors the logic in scripts/migrate-drafts-to-tasks.ts.

function parseFrontmatter(content: string): { fm: Record<string, string>; rawFmLines: string[]; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { fm: {}, rawFmLines: [], body: content };
	const fmBlock = match[1] ?? "";
	const body = match[2] ?? "";
	const rawFmLines = fmBlock.split("\n");
	const fm: Record<string, string> = {};
	for (const line of rawFmLines) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return { fm, rawFmLines, body };
}

function buildTaskContent(newId: string, rawFmLines: string[], body: string): string {
	const skipFields = new Set(["id", "status", "updated_date"]);
	const lines: string[] = [];
	lines.push("---");
	lines.push(`id: ${newId}`);
	lines.push("pipeline_id: authoring");
	lines.push("phase: draft");

	let i = 0;
	while (i < rawFmLines.length) {
		const line = rawFmLines[i] ?? "";
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			if (!skipFields.has(key)) {
				lines.push(line);
				i++;
				while (i < rawFmLines.length && (rawFmLines[i] ?? "").startsWith("  ")) {
					lines.push(rawFmLines[i] ?? "");
					i++;
				}
				continue;
			}
		}
		i++;
	}

	lines.push("---");
	lines.push(body.trimEnd());
	return `${lines.join("\n")}\n`;
}

describe("migrate drafts to authoring/draft tasks", () => {
	it("preserves title from draft frontmatter", () => {
		const draftContent = `---
id: DRAFT-2
title: 'My Test Draft'
status: To Do
created_date: '2025-06-04'
labels: []
dependencies: []
---

## Description

Test body content.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-667", rawFmLines, body);
		expect(result).toContain("title: 'My Test Draft'");
	});

	it("sets pipeline_id=authoring and phase=draft", () => {
		const draftContent = `---
id: DRAFT-3
title: Simple Draft
status: To Do
created_date: '2025-06-09'
labels: []
dependencies: []
---

## Description

Body.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-668", rawFmLines, body);
		expect(result).toContain("pipeline_id: authoring");
		expect(result).toContain("phase: draft");
	});

	it("removes DRAFT-N id and replaces with new BACK-N id", () => {
		const draftContent = `---
id: DRAFT-5
title: Another Draft
status: To Do
created_date: '2025-06-09'
labels: []
dependencies: []
---

## Description

Content.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-670", rawFmLines, body);
		expect(result).toContain("id: BACK-670");
		expect(result).not.toMatch(/id: DRAFT-/);
	});

	it("removes status field from migrated task", () => {
		const draftContent = `---
id: DRAFT-10
title: Done Draft
status: Done
created_date: '2025-06-08'
labels:
  - cli
dependencies: []
---

## Description

Done draft.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-671", rawFmLines, body);
		// status field should not appear in frontmatter (between --- markers)
		const fmSection = result.split("---\n")[1];
		expect(fmSection).not.toContain("status:");
	});

	it("preserves created_date", () => {
		const draftContent = `---
id: DRAFT-4
title: Dated Draft
status: To Do
created_date: '2025-06-09'
labels: []
dependencies: []
---

## Description

Body.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-672", rawFmLines, body);
		expect(result).toContain("created_date: '2025-06-09'");
	});

	it("preserves description body content", () => {
		const body =
			"\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nMy detailed description here.\n<!-- SECTION:DESCRIPTION:END -->\n";
		const draftContent = `---
id: DRAFT-6
title: Body Draft
status: To Do
created_date: '2025-06-09'
labels: []
dependencies: []
---
${body}`;
		const { rawFmLines, body: parsedBody } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-673", rawFmLines, parsedBody);
		expect(result).toContain("My detailed description here.");
	});

	it("preserves labels list", () => {
		const draftContent = `---
id: DRAFT-7
title: Tagged Draft
status: To Do
created_date: '2025-06-09'
labels:
  - gui
  - feature
dependencies: []
---

## Description

Content.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-674", rawFmLines, body);
		expect(result).toContain("  - gui");
		expect(result).toContain("  - feature");
	});

	it("no DRAFT-specific frontmatter fields remain", () => {
		const draftContent = `---
id: DRAFT-8
title: Full Draft
status: To Do
created_date: '2025-06-09'
updated_date: '2025-06-10'
labels:
  - cli
dependencies: []
---

## Description

Content.
`;
		const { rawFmLines, body } = parseFrontmatter(draftContent);
		const result = buildTaskContent("BACK-675", rawFmLines, body);
		const fmSection = result.split("---\n")[1];
		// id should be BACK-N, not DRAFT-N
		expect(fmSection).not.toMatch(/id: DRAFT-/);
		// status should not appear
		expect(fmSection).not.toContain("status:");
		// updated_date should not appear
		expect(fmSection).not.toContain("updated_date:");
	});
});
