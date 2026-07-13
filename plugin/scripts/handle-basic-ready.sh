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
# BACKLOG_DIR/BACKLOG_DIR_NAME: resolve whichever board directory actually
# exists on disk (backlog > .backlog > .epicd, BACK-700/BACK-701 shared helper).
source "${SCRIPT_DIR}/lib/resolve-backlog-dir.sh"
CAPS_DIR="${BACKLOG_DIR}/.caps"
LOCK_FILE="${CAPS_DIR}/${TASK_ID}.exec-lock"
WT_PATH="${REPO_ROOT}/../$(basename "$REPO_ROOT")-${TASK_ID}"
BRANCH="task/${TASK_ID}"
SIGNAL_FILE="${BACKLOG_DIR}/.agent-done-${TASK_ID}"

mkdir -p "$CAPS_DIR"

# Step 1: atomic exec-lock (non-blocking). Prefer flock(1) where available
# (Linux: releases automatically if this process is killed -9). macOS does not
# ship GNU flock by default, so fall back to an mkdir-based lock there: mkdir
# is atomic on every POSIX filesystem, giving the same non-blocking mutual-
# exclusion guarantee without depending on a util-linux-only binary. Without
# this fallback, `flock: command not found` makes the `flock -n 9 || ...`
# branch fire unconditionally, so the script exits 0 having never reached
# Step 4 — silently skipping worktree creation and the `.wt` token write.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  flock -n 9 || { echo "[handle-basic-ready] lock held for $TASK_ID — another worker claimed it"; exit 0; }
  release_lock() { flock -u 9 2>/dev/null || true; rm -f "$LOCK_FILE"; }
else
  LOCK_DIR="${LOCK_FILE}.d"
  mkdir "$LOCK_DIR" 2>/dev/null || { echo "[handle-basic-ready] lock held for $TASK_ID — another worker claimed it"; exit 0; }
  release_lock() { rmdir "$LOCK_DIR" 2>/dev/null || true; }
fi
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
