#!/usr/bin/env bun
/**
 * migrate-remove-status.ts
 *
 * Strips `status:` from all task frontmatter.
 *
 * - Tasks WITH pipeline_id: just remove the status: line.
 * - Tasks WITHOUT pipeline_id: map status → (pipeline_id, phase), insert before status:, then remove status:.
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const STATUS_MAP: Record<string, { pipeline_id: string; phase: string }> = {
	"Basic: Draft": { pipeline_id: "authoring", phase: "draft" },
	Draft: { pipeline_id: "authoring", phase: "draft" },
	"Basic: Proposal": { pipeline_id: "authoring", phase: "proposing" },
	Proposal: { pipeline_id: "authoring", phase: "proposing" },
	"Basic: Plan": { pipeline_id: "authoring", phase: "refining" },
	Plan: { pipeline_id: "authoring", phase: "refining" },
	"Basic: Backlog": { pipeline_id: "execution", phase: "backlog" },
	Backlog: { pipeline_id: "execution", phase: "backlog" },
	"Basic: Ready": { pipeline_id: "execution", phase: "ready" },
	Ready: { pipeline_id: "execution", phase: "ready" },
	"Basic: In Progress": { pipeline_id: "execution", phase: "ready" },
	"In Progress": { pipeline_id: "execution", phase: "ready" },
	"Basic: Done": { pipeline_id: "execution", phase: "done" },
	Done: { pipeline_id: "execution", phase: "done" },
	"Basic: Needs Human": { pipeline_id: "execution", phase: "needs-human" },
	"Needs Human": { pipeline_id: "execution", phase: "needs-human" },
	"Basic: Decomposing": { pipeline_id: "execution", phase: "decomposing" },
	Decomposing: { pipeline_id: "execution", phase: "decomposing" },
	"Basic: Awaiting Children": { pipeline_id: "execution", phase: "awaiting-children" },
	"Awaiting Children": { pipeline_id: "execution", phase: "awaiting-children" },
	"Basic: Evaluating": { pipeline_id: "execution", phase: "evaluating" },
	Evaluating: { pipeline_id: "execution", phase: "evaluating" },
	"Epic: Backlog": { pipeline_id: "execution", phase: "backlog" },
	"Epic: Done": { pipeline_id: "execution", phase: "done" },
	"Epic: Ready": { pipeline_id: "execution", phase: "ready" },
	"Epic: In Progress": { pipeline_id: "execution", phase: "ready" },
};

function mapStatus(raw: string): { pipeline_id: string; phase: string } {
	if (STATUS_MAP[raw]) return STATUS_MAP[raw];
	// Epic: X fallback
	if (raw.startsWith("Epic:")) return { pipeline_id: "execution", phase: "backlog" };
	// Basic: X fallback
	if (raw.startsWith("Basic:")) return { pipeline_id: "execution", phase: "backlog" };
	return { pipeline_id: "execution", phase: "backlog" };
}

const tasksDir = join(import.meta.dir, "../backlog/tasks");
const files = readdirSync(tasksDir).filter((f) => f.endsWith(".md"));

let modified = 0;
let skipped = 0;

for (const filename of files) {
	const filepath = join(tasksDir, filename);
	const content = readFileSync(filepath, "utf-8");

	// Only process if status: exists in frontmatter
	// Frontmatter is between first --- and second ---
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		skipped++;
		continue;
	}

	const statusLineMatch = content.match(/^status:\s*(.+)$/m);
	if (!statusLineMatch) {
		skipped++;
		continue;
	}

	const hasPipelineId = /^pipeline_id:/m.test(content);

	let newContent: string;

	if (hasPipelineId) {
		// Simply remove the status: line
		newContent = content.replace(/^status:.*\n/m, "");
	} else {
		// Extract status value (handle single-quoted values)
		let statusValue = (statusLineMatch[1] ?? "").trim();
		if (statusValue.startsWith("'") && statusValue.endsWith("'")) {
			statusValue = statusValue.slice(1, -1);
		}

		const mapped = mapStatus(statusValue);
		const insertionLines = `pipeline_id: ${mapped.pipeline_id}\nphase: ${mapped.phase}\n`;

		// Replace `status: ...\n` with pipeline_id + phase lines
		newContent = content.replace(/^status:.*\n/m, insertionLines);
	}

	if (newContent !== content) {
		writeFileSync(filepath, newContent, "utf-8");
		modified++;
		console.log(`  modified: ${filename}`);
	}
}

console.log(`\nDone. Modified: ${modified}, Skipped (no status line): ${skipped}`);
