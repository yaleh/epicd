#!/usr/bin/env bash
# handle-basic-ready.sh TASK-ID — crystallized capability chain Steps 1-5.
# Called by the worker after receiving a basic-ready template event.
# Establishes OS-enforced artifacts; caller (SKILL.md claimAndExecute) handles Steps 6-9.
# MUST NOT spawn any Agent or background process (ADR-014 D5 orphan-state constraint).
set -euo pipefail

TASK_ID="${1:?usage: handle-basic-ready.sh TASK-ID}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
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

# Step 2: status → In Progress + cap marker. Clear any stale completion signal FIRST
# so a leftover .agent-done-TASK from a prior run cannot cause a false-done merge.
rm -f "$SIGNAL_FILE"
backlog task edit "$TASK_ID" --status "Basic: In Progress" \
  --append-notes "claimed: $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || true
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
