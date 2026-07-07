#!/usr/bin/env bun
/**
 * migrate-drafts-to-tasks.ts
 *
 * Migrates all backlog/drafts/*.md files (except readme.md) into
 * backlog/tasks/ as authoring/draft-phase Tasks.
 *
 * For each draft:
 *  - Assigns the next available BACK-N ID
 *  - Adds pipeline_id: authoring and phase: draft
 *  - Preserves title, body, created_date, labels, dependencies, and all
 *    other frontmatter except DRAFT-specific fields (id, status)
 *  - Removes the source draft file on success
 */

import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";

const draftsDir = join(import.meta.dir, "../backlog/drafts");
const tasksDir = join(import.meta.dir, "../backlog/tasks");

// --- Helpers ---

function parseFrontmatter(content: string): { fm: Record<string, string>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { fm: {}, body: content };
	const fmRaw = match[1] ?? "";
	const body = match[2] ?? "";
	const fm: Record<string, string> = {};
	// Parse line by line (simple key: value, not deep YAML)
	for (const line of fmRaw.split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return { fm, body };
}

function sanitizeFilename(title: string): string {
	return title
		.replace(/[/\\:*?"<>|#%&{}$!'@`=+]/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function getMaxTaskId(): number {
	const files = readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
	let max = 666; // current known max
	for (const f of files) {
		const m = f.match(/^back-(\d+)/i);
		if (m && m[1]) {
			const n = parseInt(m[1], 10);
			if (n > max) max = n;
		}
	}
	return max;
}

function buildTaskContent(newId: string, rawFmLines: string[], body: string): string {
	// Build frontmatter lines; skip draft-specific fields
	const skipFields = new Set(["id", "status", "updated_date"]);

	const lines: string[] = [];
	lines.push("---");
	lines.push(`id: ${newId}`);
	lines.push("pipeline_id: authoring");
	lines.push("phase: draft");

	// Preserve all other lines from original frontmatter except skipped fields
	// We iterate raw lines to preserve multi-line values (like lists)
	let i = 0;
	while (i < rawFmLines.length) {
		const line = rawFmLines[i] ?? "";
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			if (!skipFields.has(key)) {
				// Collect this key and any continuation lines (list items)
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
	return lines.join("\n") + "\n";
}

// --- Main ---

const draftFiles = readdirSync(draftsDir)
	.filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
	.sort();

if (draftFiles.length === 0) {
	console.log("No draft files found (excluding readme.md). Nothing to migrate.");
	process.exit(0);
}

console.log(`Found ${draftFiles.length} draft(s) to migrate.`);

let nextId = getMaxTaskId() + 1;
const migrated: string[] = [];
const failed: string[] = [];

for (const filename of draftFiles) {
	const sourcePath = join(draftsDir, filename);
	const raw = readFileSync(sourcePath, "utf-8");

	// Split frontmatter
	const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!fmMatch) {
		console.error(`  SKIP ${filename}: no valid frontmatter`);
		failed.push(filename);
		continue;
	}

	const fmBlock = fmMatch[1] ?? "";
	const body = fmMatch[2] ?? "";
	const rawFmLines = fmBlock.split("\n");

	// Parse key fields
	const { fm } = parseFrontmatter(raw);
	const title = fm.title?.replace(/^['"]|['"]$/g, "") ?? filename.replace(/\.md$/, "");

	const newId = `BACK-${nextId}`;
	const safeTitle = sanitizeFilename(title);
	const targetFilename = `back-${nextId} - ${safeTitle}.md`;
	const targetPath = join(tasksDir, targetFilename);

	try {
		const content = buildTaskContent(newId, rawFmLines, body);
		writeFileSync(targetPath, content, "utf-8");
		console.log(`  ${fm.id ?? filename} → ${newId} (${targetFilename})`);
		migrated.push(filename);
		nextId++;
	} catch (err) {
		console.error(`  FAILED ${filename}:`, err);
		failed.push(filename);
	}
}

// Remove source draft files only if all succeeded (or partial success - remove those that succeeded)
for (const filename of migrated) {
	const sourcePath = join(draftsDir, filename);
	try {
		unlinkSync(sourcePath);
	} catch (err) {
		console.error(`  Warning: could not delete source ${filename}:`, err);
	}
}

console.log(`\nMigration complete: ${migrated.length} migrated, ${failed.length} failed.`);
if (failed.length > 0) {
	console.error("Failed files:", failed);
	process.exit(1);
}
