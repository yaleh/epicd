/**
 * Normalize a frontmatter date value into a canonical string.
 *
 * - `Date` objects at midnight UTC are treated as date-only (`YYYY-MM-DD`).
 * - `Date` objects with a time component keep `YYYY-MM-DD HH:mm`.
 * - Strings in known formats (ISO, legacy dd-mm-yy / dd/mm/yy / dd.mm.yy) are
 *   normalized; anything else is returned trimmed and unquoted.
 *
 * Shared by the task/decision/document parsers and the field registry so date
 * coercion lives in exactly one place.
 */
export function normalizeDate(value: unknown): string {
	if (!value) return "";
	if (value instanceof Date) {
		// Check if this Date object came from a date-only string (time is midnight UTC)
		const hours = value.getUTCHours();
		const minutes = value.getUTCMinutes();
		const seconds = value.getUTCSeconds();

		if (hours === 0 && minutes === 0 && seconds === 0) {
			// This was likely a date-only value, preserve it as date-only
			return value.toISOString().slice(0, 10);
		}
		// This has actual time information, preserve it
		return value.toISOString().slice(0, 16).replace("T", " ");
	}
	const str = String(value)
		.trim()
		.replace(/^['"]|['"]$/g, "");
	if (!str) return "";

	// Check for datetime format first (YYYY-MM-DD HH:mm)
	let match: RegExpMatchArray | null = str.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
	if (match) {
		// Already in correct format, return as-is
		return str;
	}

	// Check for ISO datetime format (YYYY-MM-DDTHH:mm)
	match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
	if (match) {
		// Convert T separator to space
		return str.replace("T", " ");
	}

	// Check for date-only format (YYYY-MM-DD) - backward compatibility
	match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match) {
		return `${match[1]}-${match[2]}-${match[3]}`;
	}

	// Legacy date formats (date-only for backward compatibility)
	match = str.match(/^(\d{2})-(\d{2})-(\d{2})$/);
	if (match) {
		const [day, month, year] = match.slice(1);
		return `20${year}-${month}-${day}`;
	}
	match = str.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
	if (match) {
		const [day, month, year] = match.slice(1);
		return `20${year}-${month}-${day}`;
	}
	match = str.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
	if (match) {
		const [day, month, year] = match.slice(1);
		return `20${year}-${month}-${day}`;
	}
	return str;
}
