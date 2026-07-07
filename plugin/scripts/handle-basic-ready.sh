#!/usr/bin/env bash
# handle-basic-ready.sh TASK-ID — crystallized capability chain Steps 1-5.
# Called by the worker after receiving a basic-ready template event.
# Establishes OS-enforced artifacts; caller (SKILL.md claimAndExecute) handles Steps 6-9.
# MUST NOT spawn any Agent or background process (ADR-014 D5 orphan-state constraint).
set -euo pipefail

TASK_ID="${1:?usage: handle-basic-ready.sh TASK-ID}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
# CLI_CMD resolution (BACK-605.9 M1 — portable across install shapes, this script
# ships inside the epicd Claude Code plugin and must not assume the epicd source
# tree lives at a fixed relative path from a foreign board repo):
#   1. EPICD_CLI_CMD env var — explicit override, e.g. "epicd" when the published
#      CLI binary is on PATH (the normal case for a repo that only installed the
#      plugin, not epicd's source).
#   2. "bun <this-script's-own-dir>/../../src/cli.ts" — resolved from this script's
#      own on-disk location (NOT $REPO_ROOT) so the claim runs through the dev CLI
#      belonging to this codebase whenever that source tree actually sits alongside
#      this script (epicd dogfooding itself, or a test fixture pointed at it) — this
#      avoids the version-skew hazard where a bare `epicd` on $PATH resolves to a
#      stale globally installed package whose frontmatter schema doesn't know about
#      engine structural fields (pipeline_id, phase, parent_id, dod) and silently
#      drops them on rewrite (BACK-620).
#   3. "epicd" — fallback assuming the published bin is on PATH.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_CLI_JS="${SCRIPT_DIR}/../../src/cli.ts"
if [ -n "${EPICD_CLI_CMD:-}" ]; then
  CLI_CMD="${EPICD_CLI_CMD}"
elif [ -f "$DEV_CLI_JS" ]; then
  CLI_CMD="bun $DEV_CLI_JS"
else
  CLI_CMD="epicd"
fi
CAPS_DIR="${REPO_ROOT}/backlog/.caps"
LOCK_FILE="${CAPS_DIR}/${TASK_ID}.exec-lock"
WT_PATH="${REPO_ROOT}/../$(basename "$REPO_ROOT")-${TASK_ID}"
BRANCH="task/${TASK_ID}"
SIGNAL_FILE="${REPO_ROOT}/backlog/.agent-done-${TASK_ID}"

mkdir -p "$CAPS_DIR"

# Step 1: atomic exec-lock (flock -n: non-blocking)
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "[handle-basic-ready] lock held for $TASK_ID — another worker claimed it"; exit 0; }

release_lock() { flock -u 9 2>/dev/null || true; rm -f "$LOCK_FILE"; }
trap 'release_lock; git -C "$REPO_ROOT" worktree remove "$WT_PATH" --force 2>/dev/null || true' EXIT

# Step 2: claim marker + cap marker. Clear any stale completion signal FIRST
# so a leftover .agent-done-TASK from a prior run cannot cause a false-done merge.
# "In Progress" is a claim/runtime concept, never a persisted status (status is a
# pure phase projection, BACK-664 child 1) — the append-notes timestamp below IS
# the claim record.
rm -f "$SIGNAL_FILE"
(cd "$REPO_ROOT" && $CLI_CMD task edit "$TASK_ID" \
  --append-notes "claimed: $(date -u +%Y-%m-%dT%H:%M:%SZ)") 2>/dev/null || true
printf 'cap:claim=started\n' >> "${CAPS_DIR}/${TASK_ID}"

# Step 3: worktree add (directory = capability token #3)
if [ ! -d "$WT_PATH" ]; then
  git -C "$REPO_ROOT" worktree add "$WT_PATH" -b "$BRANCH"
fi

# Step 4: .wt capability token (path anchor for Agent cwd)
printf '%s\n' "$WT_PATH" > "${CAPS_DIR}/${TASK_ID}.wt"

# Step 5: .signal path record
printf '%s\n' "$SIGNAL_FILE" > "${CAPS_DIR}/${TASK_ID}.signal"

# Handoff: disown worktree — caller (SKILL.md) will merge and clean up
trap - EXIT
echo "[handle-basic-ready] ready: $WT_PATH"
