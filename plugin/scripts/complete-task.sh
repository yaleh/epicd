#!/usr/bin/env bash
# complete-task.sh TASK-ID — Steps 7-9 of the basic-ready flow.
# Called by the worker after the background Agent writes its signal file:
#   1. read + clear the signal (and drop the .active-agents entry)
#   2. independently re-verify every DoD shell-gate inside the worktree (pre-merge guard)
#   3. on done: git merge --no-ff → phase=done + cap:execute=done + notifyParent + worktree/branch cleanup
#      on failure/conflict/escalation: phase=needs-human + the matching cap: marker
# Status is a pure phase projection (BACK-664 child 1): this script sets --phase,
# never --status, and the human-facing status string is derived automatically.
# Behavior-equivalent port of the old SKILL.md merge pseudocode. Merge-serialised via
# BACKLOG_DIR/.merge-lock (resolved dynamically below — whichever candidate board
# directory exists on disk, BACK-700) so a /clear mid-merge cannot leave a
# half-merged main worktree.
#
# RULE: never pipe `git merge` (| tail/cat/tee) — a pipe replaces its exit code and masks abort.
set -uo pipefail

TASK_ID="${1:?usage: complete-task.sh TASK-ID}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# BACKLOG_DIR/BACKLOG_DIR_NAME: resolve whichever board directory actually
# exists on disk (backlog > .backlog > .epicd, BACK-700/BACK-701 shared helper).
source "${SCRIPT_DIR}/lib/resolve-backlog-dir.sh"
CAPS_DIR="${BACKLOG_DIR}/.caps"
WT_PATH_FILE="${CAPS_DIR}/${TASK_ID}.wt"
SIGNAL_FILE="${BACKLOG_DIR}/.agent-done-${TASK_ID}"
BRANCH="task/${TASK_ID}"
CAP_FILE="${CAPS_DIR}/${TASK_ID}"
ACTIVE_FILE="${BACKLOG_DIR}/.active-agents"
MERGE_LOCK="${BACKLOG_DIR}/.merge-lock"

WT_PATH="$(cat "$WT_PATH_FILE" 2>/dev/null || echo "")"
TASK_VIEW="$(epicd task view "$TASK_ID" --plain 2>/dev/null || echo "")"
# NOTE: use sed -E (BSD/GNU-portable extended regex), not `grep -P` —
# macOS's default /usr/bin/grep is BSD grep and does not support -P
# (Perl-compatible regex incl. \K/lookbehind); it errors out, silently
# starving downstream loops of any matches.
TITLE="$(printf '%s\n' "$TASK_VIEW" | sed -E -n 's/^Task [^ ]+ - (.+)$/\1/p' | head -1)"
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
# BACK-654: re-runs the STRUCTURED "DoD Gates:" section (task.dod[].text, via
# buildDodGateLines in src/formatters/task-plain-text.ts) — NOT the human-facing
# "Definition of Done:" prose checklist. The prose section is never valid shell
# and must never be executed (that was the BACK-654 root cause: this script used
# to awk-scan the prose section and execute it as literal shell commands).
if [ "$SIGNAL_CONTENT" = "done" ] && [ -n "$WT_PATH" ] && [ -d "$WT_PATH" ]; then
  dod_n=0
  gates_found=0
  while IFS= read -r dod_line; do
    gates_found=$((gates_found + 1))
    dod_cmd="$(printf '%s' "$dod_line" | sed 's/^- #[0-9]* //')"
    [ -z "$dod_cmd" ] && continue
    dod_out="$(cd "$WT_PATH" && bash -c "$dod_cmd" 2>&1)" || {
      epicd task edit "$TASK_ID" \
        --append-notes "workerLoop pre-merge DoD #${dod_n} FAIL: ${dod_cmd}" >/dev/null 2>&1 || true
      SIGNAL_CONTENT="needs-human: workerLoop DoD #${dod_n} failed: ${dod_cmd}
$(printf '%s\n' "$dod_out" | head -5)"
      break
    }
    epicd task edit "$TASK_ID" \
      --append-notes "workerLoop DoD #${dod_n}: PASS — ${dod_cmd}" >/dev/null 2>&1 || true
    dod_n=$((dod_n + 1))
  # The awk filter already guarantees every emitted line matches `- #<n> ...`,
  # so no further `grep -oP` extraction is needed (see NOTE above re: BSD grep).
  done < <(printf '%s\n' "$TASK_VIEW" | awk '/^DoD Gates:/{found=1;next} found && /^[A-Z]/{found=0} found && /^- #[0-9]/')

  # BACK-654: no structured gates declared -> never auto-merge (mirrors
  # dod-runner.ts's "no dod -> completeTask always routes needs-human" semantics).
  if [ "$SIGNAL_CONTENT" = "done" ] && [ "$gates_found" -eq 0 ]; then
    SIGNAL_CONTENT="needs-human: no structured DoD gates found for ${TASK_ID}"
  fi
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
      epicd task edit "$TASK_ID" --phase needs-human \
        --append-notes "Merge guard: MERGE_HEAD/unmerged files present — worktree preserved." \
        >/dev/null 2>&1 || true
      printf 'cap:merge=failed %s\n' "$(now_iso)" >> "$CAP_FILE"
      echo "[complete-task] $TASK_ID merge guard — Needs Human"
      exit 0
    fi
    # post-merge: append the agent's execution summary (if it wrote one)
    if [ -n "$WT_PATH" ] && [ -f "${WT_PATH}/.agent-summary-${TASK_ID}" ]; then
      epicd task edit "$TASK_ID" --append-notes "$(cat "${WT_PATH}/.agent-summary-${TASK_ID}")" \
        >/dev/null 2>&1 || true
    else
      epicd task edit "$TASK_ID" \
        --append-notes "WARNING: agent-summary missing for ${TASK_ID} — execution trace unavailable" \
        >/dev/null 2>&1 || true
    fi
    epicd task edit "$TASK_ID" --phase done \
      --append-notes "Completed: $(now_iso)" >/dev/null 2>&1 || true
    printf 'cap:execute=done %s\n' "$(now_iso)" >> "$CAP_FILE"
    # notifyParent (parent_task_id in task frontmatter)
    parent="$(printf '%s\n' "$TASK_VIEW" | sed -E -n 's/^Parent: ([A-Za-z][A-Za-z0-9]*-[0-9]+(\.[0-9]+)*).*/\1/p' | head -1)"
    if [ -n "$parent" ]; then
      epicd task edit "$parent" --append-notes "Sub-task ${TASK_ID} completed: $(now_iso)" \
        >/dev/null 2>&1 || true
    fi
    if [ -n "$WT_PATH" ]; then
      git worktree remove "$WT_PATH" 2>/dev/null || true
    fi
    git branch -d "$BRANCH" 2>/dev/null || true
    echo "[complete-task] $TASK_ID → Done"
  else
    # merge conflict
    epicd task edit "$TASK_ID" --phase needs-human \
      --append-notes "Merge conflict: $(now_iso)" >/dev/null 2>&1 || true
    printf 'cap:merge=failed %s\n' "$(now_iso)" >> "$CAP_FILE"
    echo "[complete-task] $TASK_ID merge conflict — Needs Human (worktree preserved)"
  fi
else
  # agent escalated, or pre-merge DoD failed
  reason="$(printf '%s' "$SIGNAL_CONTENT" | sed 's/^needs-human: //')"
  epicd task edit "$TASK_ID" --phase needs-human \
    --append-notes "Escalated: ${reason}
To continue: answer in Implementation Notes, then set --phase ready." \
    >/dev/null 2>&1 || true
  printf 'cap:execute=failed %s\n' "$(now_iso)" >> "$CAP_FILE"
  echo "[complete-task] $TASK_ID escalated — Needs Human"
fi
