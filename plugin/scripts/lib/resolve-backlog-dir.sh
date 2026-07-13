# resolve-backlog-dir.sh — shared board-directory probe for plugin/scripts/ shell
# scripts. Source this file (not execute it) after REPO_ROOT is set.
#
# Implements the same backlog > .backlog > .epicd priority-with-fallback probe
# as resolveBuiltInBacklogDirectory / resolveBacklogDirectory in
# src/utils/backlog-directory.ts and resolveBacklogDirName() in
# plugin/scripts/scan-loop.cjs (kept in sync via a bun test, see
# src/test/resolve-backlog-dir.test.ts). Probes existence only — never creates
# one; defaults to 'backlog' for backward compatibility with a
# never-initialized repo.
#
# Requires: REPO_ROOT already set by the caller.
# Sets: BACKLOG_DIR_NAME (e.g. "backlog", ".backlog", ".epicd")
#       BACKLOG_DIR      (absolute path: "${REPO_ROOT}/${BACKLOG_DIR_NAME}")

if [ -d "${REPO_ROOT}/backlog" ]; then
	BACKLOG_DIR_NAME="backlog"
elif [ -d "${REPO_ROOT}/.backlog" ]; then
	BACKLOG_DIR_NAME=".backlog"
elif [ -d "${REPO_ROOT}/.epicd" ]; then
	BACKLOG_DIR_NAME=".epicd"
else
	BACKLOG_DIR_NAME="backlog"
fi
BACKLOG_DIR="${REPO_ROOT}/${BACKLOG_DIR_NAME}"
