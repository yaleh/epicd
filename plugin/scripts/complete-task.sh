#!/usr/bin/env bash
# complete-task.sh TASK-ID — Steps 7-9 of the basic-ready flow.
# Called by the worker after the background Agent writes its signal file:
#   1. read + clear the signal (and drop the .active-agents entry)
#   2. independently re-verify every DoD shell-gate inside the worktree (pre-merge guard)
#   3. on done: git merge --no-ff → Basic: Done + cap:execute=done + notifyParent + worktree/branch cleanup
#      on failure/conflict/escalation: Basic: Needs Human + the matching cap: marker
# Behavior-equivalent port of the old SKILL.md merge pseudocode. Merge-serialised via
# backlog/.merge-lock so a /clear mid-merge cannot leave a half-merged main worktree.
#
# RULE: never pipe `git merge` (| tail/cat/tee) — a pipe replaces its exit code and masks abort.
set -uo pipefail

TASK_ID="${1:?usage: complete-task.sh TASK-ID}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
CAPS_DIR="${REPO_ROOT}/backlog/.caps"
WT_PATH_FILE="${CAPS_DIR}/${TASK_ID}.wt"
SIGNAL_FILE="${REPO_ROOT}/backlog/.agent-done-${TASK_ID}"
BRANCH="task/${TASK_ID}"
CAP_FILE="${CAPS_DIR}/${TASK_ID}"
ACTIVE_FILE="${REPO_ROOT}/backlog/.active-agents"
MERGE_LOCK="${REPO_ROOT}/backlog/.merge-lock"

WT_PATH="$(cat "$WT_PATH_FILE" 2>/dev/null || echo "")"
TASK_VIEW="$(backlog task view "$TASK_ID" --plain 2>/dev/null || echo "")"
TITLE="$(printf '%s\n' "$TASK_VIEW" | grep -oP '^Task \S+ - \K.+' | head -1)"
[ -z "$TITLE" ] && TITLE="$TASK_ID"

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ── merge lock (serialise concurrent merges) ─────────────────────────────────
acquire_merge_lock() {
  if [ -f "$MERGE_LOCK" ]; then
    local lp; lp="$(cat "$MERGE_LOCK" 2>/dev/null || echo "")"
    if [ -n "$lp" ] && kill -0 "$lp" 2>/dev/null; then
      while [ -f "$MERGE_LOCK" ] && kill -0 "$lp" 2>/dev/null; do sleep 1; done
    fi
    rm -f "$MERGE_LOCK"
  fi
  echo $$ > "$MERGE_LOCK"
}
release_merge_lock() { rm -f "$MERGE_LOCK"; }

# ── Step 7: read + clear signal; drop .active-agents entry ───────────────────
SIGNAL_CONTENT="$(cat "$SIGNAL_FILE" 2>/dev/null || echo "needs-human: signal file missing")"
rm -f "$SIGNAL_FILE"
if [ -f "$ACTIVE_FILE" ]; then
  local_tmp="$(mktemp)"
  grep -v "^${TASK_ID}$" "$ACTIVE_FILE" > "$local_tmp" 2>/dev/null || true
  mv "$local_tmp" "$ACTIVE_FILE"
fi

# ── pre-merge independent DoD re-verify (only when agent signalled done + worktree live) ─
if [ "$SIGNAL_CONTENT" = "done" ] && [ -n "$WT_PATH" ] && [ -d "$WT_PATH" ]; then
  dod_n=0
  while IFS= read -r dod_line; do
    dod_cmd="$(printf '%s' "$dod_line" | sed 's/^- \[.\] #[0-9]* //')"
    [ -z "$dod_cmd" ] && continue
    dod_out="$(cd "$WT_PATH" && bash -c "$dod_cmd" 2>&1)" || {
      backlog task edit "$TASK_ID" \
        --append-notes "workerLoop pre-merge DoD #${dod_n} FAIL: ${dod_cmd}" >/dev/null 2>&1 || true
      SIGNAL_CONTENT="needs-human: workerLoop DoD #${dod_n} failed: ${dod_cmd}
$(printf '%s\n' "$dod_out" | head -5)"
      break
    }
    backlog task edit "$TASK_ID" \
      --append-notes "workerLoop DoD #${dod_n}: PASS — ${dod_cmd}" >/dev/null 2>&1 || true
    dod_n=$((dod_n + 1))
  done < <(printf '%s\n' "$TASK_VIEW" | awk '/^Definition of Done:/{found=1;next} found && /^[A-Z]/{found=0} found && /^- \[.\] #[0-9]/' | grep -oP '^- \[.\] #\d+ .+')
fi

# ── Steps 8-9: merge OR escalate (merge-serialised) ──────────────────────────
acquire_merge_lock
trap release_merge_lock EXIT

cd "$REPO_ROOT"
if [ "$SIGNAL_CONTENT" = "done" ]; then
  # never pipe git merge — check its exit code directly
  if git merge --no-ff "$BRANCH" -m "merge: ${TITLE} (${TASK_ID})"; then
    # guard: MERGE_HEAD / unmerged files present → never mark Done
    if [ -f ".git/MERGE_HEAD" ] || [ -n "$(git diff --name-only --diff-filter=U)" ]; then
      backlog task edit "$TASK_ID" --status "Basic: Needs Human" \
        --append-notes "Merge guard: MERGE_HEAD/unmerged files present — worktree preserved." \
        >/dev/null 2>&1 || true
      printf 'cap:merge=failed %s\n' "$(now_iso)" >> "$CAP_FILE"
      echo "[complete-task] $TASK_ID merge guard — Needs Human"
      exit 0
    fi
    # post-merge: append the agent's execution summary (if it wrote one)
    if [ -n "$WT_PATH" ] && [ -f "${WT_PATH}/.agent-summary-${TASK_ID}" ]; then
      backlog task edit "$TASK_ID" --append-notes "$(cat "${WT_PATH}/.agent-summary-${TASK_ID}")" \
        >/dev/null 2>&1 || true
    else
      backlog task edit "$TASK_ID" \
        --append-notes "WARNING: agent-summary missing for ${TASK_ID} — execution trace unavailable" \
        >/dev/null 2>&1 || true
    fi
    backlog task edit "$TASK_ID" --status "Basic: Done" \
      --append-notes "Completed: $(now_iso)" >/dev/null 2>&1 || true
    printf 'cap:execute=done %s\n' "$(now_iso)" >> "$CAP_FILE"
    # notifyParent (parent_task_id in task frontmatter)
    parent="$(printf '%s\n' "$TASK_VIEW" | grep -oP '(?<=^Parent: )[A-Za-z][A-Za-z0-9]*-\d+(\.\d+)*' | head -1)"
    if [ -n "$parent" ]; then
      backlog task edit "$parent" --append-notes "Sub-task ${TASK_ID} completed: $(now_iso)" \
        >/dev/null 2>&1 || true
    fi
    if [ -n "$WT_PATH" ]; then
      git worktree remove "$WT_PATH" 2>/dev/null || true
    fi
    git branch -d "$BRANCH" 2>/dev/null || true
    echo "[complete-task] $TASK_ID → Basic: Done"
  else
    # merge conflict
    backlog task edit "$TASK_ID" --status "Basic: Needs Human" \
      --append-notes "Merge conflict: $(now_iso)" >/dev/null 2>&1 || true
    printf 'cap:merge=failed %s\n' "$(now_iso)" >> "$CAP_FILE"
    echo "[complete-task] $TASK_ID merge conflict — Needs Human (worktree preserved)"
  fi
else
  # agent escalated, or pre-merge DoD failed
  reason="$(printf '%s' "$SIGNAL_CONTENT" | sed 's/^needs-human: //')"
  backlog task edit "$TASK_ID" --status "Basic: Needs Human" \
    --append-notes "Escalated: ${reason}
To continue: answer in Implementation Notes, then set status → Basic: Ready." \
    >/dev/null 2>&1 || true
  printf 'cap:execute=failed %s\n' "$(now_iso)" >> "$CAP_FILE"
  echo "[complete-task] $TASK_ID escalated — Needs Human"
fi
