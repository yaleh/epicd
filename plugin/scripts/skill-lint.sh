#!/usr/bin/env bash
# skill-lint.sh — L1 structural lint for epicd phase-execution skills.
#
# Validates a skill directory's `contract.json` against the schema documented in
# plugin/skills/README.md: presence of phase/creation_path/provenance, provenance
# resolvability appropriate to creation_path, and SKILL.md runtime independence from
# any external framework (no namespaced "/<vendor>:<skill>" invocation).
#
# This is a structural/portability gate (L1) — it does NOT and cannot validate
# whether a skill's underlying methodology is actually effective (L3); that comes
# from the source methodology-bootstrapping experiment (creation_path: extract) or
# does not apply (creation_path: mechanical).
#
# Usage:
#   skill-lint.sh <skill-dir>               # single-skill mode
#   skill-lint.sh --all [skills-root]       # walk every immediate subdir of
#                                            # skills-root (default: plugin/skills);
#                                            # directories with no contract.json are
#                                            # skipped gracefully (pre-existing
#                                            # operation skills predate this schema).
#
# Exit 0 iff every checked skill passes (skips do not count as failures).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Must match the literal sentinel documented in plugin/skills/README.md.
MECHANICAL_SENTINEL="mechanical: no methodology"

fail_any=0

# Resolve a path-like provenance value against the repo root (absolute paths pass
# through unchanged). Prints nothing; return code signals existence.
path_resolves() {
	local value="$1"
	if [[ "$value" == /* ]]; then
		[[ -e "$value" ]]
	else
		[[ -e "${REPO_ROOT}/${value}" ]]
	fi
}

# Resolve an experiment-pending pointer (a task id, e.g. BACK-658) to a real task
# file under backlog/tasks/.
pointer_resolves() {
	local pointer="$1"
	local id
	id="$(grep -oE '[A-Za-z]+-[0-9]+(\.[0-9]+)*' <<<"$pointer" | head -1)"
	[[ -n "$id" ]] || return 1
	local slug
	slug="$(tr '[:upper:]' '[:lower:]' <<<"$id")"
	compgen -G "${REPO_ROOT}/backlog/tasks/${slug} - *" >/dev/null 2>&1
}

# Validate one skill directory. Echoes a one-line verdict. Returns 0/1.
lint_skill_dir() {
	local dir="$1"
	local mode="$2" # "hard" (single-skill mode) or "lenient" (--all mode)
	local name
	name="$(basename "$dir")"
	local contract="${dir}/contract.json"

	if [[ ! -f "$contract" ]]; then
		if [[ "$mode" == "lenient" ]]; then
			echo "skip: ${name} (no contract.json — legacy/non-participating skill)"
			return 0
		else
			echo "FAIL: ${name} — no contract.json found at ${contract}"
			return 1
		fi
	fi

	if ! jq -e . "$contract" >/dev/null 2>&1; then
		echo "FAIL: ${name} — contract.json is not valid JSON"
		return 1
	fi

	local phase creation_path provenance
	phase="$(jq -r '.phase // empty' "$contract")"
	creation_path="$(jq -r '.creation_path // empty' "$contract")"
	provenance="$(jq -r '.provenance // empty' "$contract")"

	local errors=()

	[[ -n "$phase" ]] || errors+=("missing/empty 'phase'")
	[[ -n "$creation_path" ]] || errors+=("missing/empty 'creation_path'")
	[[ -n "$provenance" ]] || errors+=("missing/empty 'provenance'")

	if [[ -n "$phase" && ! "$phase" =~ ^[a-z][a-z0-9]*/[a-z][a-z0-9-]*$ ]]; then
		errors+=("'phase' must look like '<pipeline_id>/<phase_name>' (got: ${phase})")
	fi

	case "$creation_path" in
	extract | mechanical | experiment-pending) ;;
	"") ;; # already reported above
	*)
		errors+=("'creation_path' must be one of extract|mechanical|experiment-pending (got: ${creation_path})")
		;;
	esac

	if [[ -n "$provenance" ]]; then
		case "$creation_path" in
		extract)
			if [[ "$provenance" == "$MECHANICAL_SENTINEL" ]]; then
				errors+=("'provenance' for creation_path=extract must not be the mechanical sentinel")
			elif ! path_resolves "$provenance"; then
				errors+=("'provenance' (${provenance}) does not resolve to a file/dir on disk (required for creation_path=extract)")
			fi
			;;
		mechanical)
			if [[ "$provenance" != "$MECHANICAL_SENTINEL" ]]; then
				errors+=("'provenance' for creation_path=mechanical must be exactly '${MECHANICAL_SENTINEL}' (got: ${provenance})")
			fi
			;;
		experiment-pending)
			if ! pointer_resolves "$provenance"; then
				errors+=("'provenance' (${provenance}) does not resolve to a task file under backlog/tasks/ (required for creation_path=experiment-pending)")
			fi
			;;
		esac
	fi

	local skill_md="${dir}/SKILL.md"
	if [[ ! -f "$skill_md" ]]; then
		errors+=("no SKILL.md found alongside contract.json")
	else
		# Runtime-independence check, deliberately framework-agnostic: a skill's
		# executable instructions must never invoke a namespaced external skill
		# (any "/<vendor>:<skill>" invocation syntax, e.g. an external framework's
		# knowledge-extractor). This script never names any specific external
		# framework itself (not even in a comment) so that everything under
		# plugin/ stays verifiably free of any such reference — see
		# src/test/epicd-plugin-synthetic-repo.test.ts, which packages this whole
		# directory into a scratch repo and asserts exactly that. A documentary
		# citation of an external artifact belongs in contract.json's
		# `provenance` field (plain data, never executed), not here.
		if grep -Eq '(^|[[:space:]`])/[A-Za-z][A-Za-z0-9_-]*:[A-Za-z]' "$skill_md"; then
			errors+=("SKILL.md invokes a namespaced external skill ('/<vendor>:<skill>') — runtime-independence violation")
		fi
	fi

	if [[ ${#errors[@]} -gt 0 ]]; then
		echo "FAIL: ${name}"
		for e in "${errors[@]}"; do
			echo "  - ${e}"
		done
		return 1
	fi

	echo "pass: ${name} (${phase}, ${creation_path})"
	return 0
}

usage() {
	echo "Usage: $0 <skill-dir> | --all [skills-root]" >&2
}

if [[ $# -lt 1 ]]; then
	usage
	exit 2
fi

if [[ "$1" == "--all" ]]; then
	skills_root="${2:-${REPO_ROOT}/plugin/skills}"
	if [[ ! -d "$skills_root" ]]; then
		echo "FAIL: skills root not found: ${skills_root}" >&2
		exit 1
	fi
	any_checked=0
	for dir in "$skills_root"/*/; do
		[[ -d "$dir" ]] || continue
		any_checked=1
		lint_skill_dir "${dir%/}" "lenient" || fail_any=1
	done
	if [[ "$any_checked" -eq 0 ]]; then
		echo "FAIL: no skill directories found under ${skills_root}" >&2
		exit 1
	fi
else
	if [[ ! -d "$1" ]]; then
		echo "FAIL: not a directory: $1" >&2
		exit 1
	fi
	lint_skill_dir "${1%/}" "hard" || fail_any=1
fi

exit "$fail_any"
