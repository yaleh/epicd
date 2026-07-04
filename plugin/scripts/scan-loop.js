#!/usr/bin/env node
// daemon-version: v14
/**
 * scan-loop.js — UNIFIED B″ poller. Self-sufficient: at --loop startup it reaps any
 * prior same-field scanner (reapSameFieldScanners), then polls the epicd board and emits
 * event channels to stdout:
 *
 *
 *   basic-ready:TASK-N       actionable (pipeline_id/phase-derived, via `bun run cli engine
 *                            watch --once`, BACK-605.8) → worker executes task
 *   epic-eval-due:TASK-N     kind:epic at "Epic: Awaiting Children" AND ALL children in a
 *                            terminal state (Basic: Done or Basic: Needs Human).
 *                            Single whole-dir scan replaces per-file isChildDone; suppresses
 *                            partial completion and cold-start bursts. → worker runs epicEvaluate
 *   stale-in-progress:TASK-N kind:basic AND status "Basic: In Progress" AND claimed more than
 *                            30 min ago (isReapDue) → informational only, no status/worktree
 *                            mutation; human decides recovery — see TASK-242.
 *
 *   basic-draft:TASK-N       status "Basic: Draft"  (draft mode only) → worker claims
 *                            (→ "Basic: Refining") then inline-calls feature-to-backlog /
 *                            task-to-backlog per label routing (see loop-draft skill).
 *   epic-draft:TASK-N        status "Epic: Draft"   (draft mode only) → worker claims
 *                            (→ "Epic: Refining") then inline-calls epic-to-backlog.
 *
 * NOTE (BACK-605.8 Phase C): the `basic-ready` channel's board-scanning predicate no
 * longer hardcodes a status-string literal. It shells out to the epicd engine's own
 * data-derived scanner (`bun run cli engine watch --once`, which reuses
 * Interpreter.scan over (pipeline_id, phase) — see src/engine/watch.ts) and parses the
 * emitted task ids out of its rendered `---EVENT---`-delimited blobs (engineWatchOnce
 * below). `epic-ready`/draft/eval channels are unaffected by this task (out of scope;
 * still baime's file-predicate scan, retained for reference/back-compat).
 *
 * CLI flag --mode <ready|draft> selects which channel GROUP this scanner instance polls
 * (MODE_CHANNELS below). Default 'ready' — identical channel set/behavior to the pre-mode
 * scanner. 'draft' is the loop-draft skill's mode: only basic-draft/epic-draft are polled.
 * Replaces the old --only=<comma-separated-prefixes> flag (retired — --mode groups channels
 * by session/skill rather than by arbitrary prefix list; TASK-244).
 *
 * Modes (ADR-012):
 *   --loop (default): foreground loop emitting event lines to stdout on interval
 *   --scan-once:      emit current actionable event lines once → exit 0
 *
 * Stdout: event lines only (basic-ready:TASK-N, etc.)
 * Stderr: diagnostics, heartbeat, errors (never goes to Monitor event stream)
 *
 * Non-detached: no pidfile, no detach. Monitor runs this script directly as its command.
 * require.main guard prevents side-effects on require() — safe to import in tests.
 */
'use strict';
const fs          = require('fs');
const path        = require('path');
const { execSync } = require('child_process');

const EPIC_READY_STATUS  = 'epic: ready';
const BASIC_DRAFT_STATUS = 'basic: draft';
const EPIC_DRAFT_STATUS  = 'epic: draft';
const BASIC_PROPOSAL_STATUS = 'basic: proposal';
const EPIC_PROPOSAL_STATUS  = 'epic: proposal';
const BASIC_DONE_STATUS  = 'basic: done';
const BASIC_IN_PROGRESS_STATUS = 'basic: in progress';
const BASIC_NEEDS_HUMAN_STATUS = 'basic: needs human';
const EPIC_AWAITING_CHILDREN_STATUS = 'epic: awaiting children';
const BASIC_REFINING_STATUS = 'basic: refining';
const EPIC_REFINING_STATUS  = 'epic: refining';
const REAP_THRESHOLD_MS = 1800000; // 30 minutes

// MODE_CHANNELS: --mode <name> selects which channel group a scanner instance polls.
// 'ready' (default) reproduces the pre-mode scanner's full channel set unchanged.
// 'draft' is the loop-draft skill's mode — only Draft-lane channels.
const MODE_CHANNELS = {
  ready: ['basic-ready', 'epic-ready', 'epic-eval-due', 'review-due', 'stale-in-progress'],
  draft: ['basic-draft', 'epic-draft'],
};

function parseArgs(argv) {
  const args = {
    tasksDir:       null,   // null → resolveTasksDir() derives from git toplevel
    stopFile:       'backlog/.loop-stop',
    interval:       2,
    scanOnce:       false,
    reviewInterval: 10,
    templatesDir:   null,
    mode:           'ready',  // 'ready' (default) | 'draft' — selects MODE_CHANNELS group
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--tasks-dir':        args.tasksDir = argv[++i]; break;
      case '--stop-file':        args.stopFile = argv[++i]; break;
      case '--interval':         args.interval = parseFloat(argv[++i]); break;
      case '--scan-once':        args.scanOnce = true; break;
      case '--loop':             args.scanOnce = false; break;
      case '--review-interval':  args.reviewInterval = parseInt(argv[++i], 10); break;
      case '--templates-dir':    args.templatesDir = argv[++i]; break;
      case '--mode':              args.mode = argv[++i] || 'ready'; break;
    }
  }
  return args;
}

function resolveTemplatesDir(args) {
  return args.templatesDir || path.join(__dirname, '..', 'skills', 'loop-backlog', 'templates');
}

// resolveTasksDir: self-resolving tasks-dir (ADR-012 §151 / TASK-232). Returns
// args.tasksDir when explicitly set; otherwise derives <git-toplevel>/backlog/tasks.
// On git failure falls back to the relative 'backlog/tasks'. Kept separate from
// parseArgs so parseArgs stays pure and require-able (git resolution isolated here).
function resolveTasksDir(args) {
  if (args && args.tasksDir) return args.tasksDir;
  try {
    const root = execSync('git rev-parse --show-toplevel').toString().trim();
    return path.join(root, 'backlog', 'tasks');
  } catch (_) {
    return 'backlog/tasks';
  }
}

// selfBootstrap: idempotent session disk-prep folded from the old SKILL.md
// scannerBootstrap fence (ADR-012 §151 / TASK-232). Runs ONCE at --loop startup
// (never in --scan-once — the probe path must stay side-effect-free). Each step is
// wrapped in its own try/catch and silently degrades; git failures are skipped
// best-effort so a non-git or detached checkout never crashes the scanner.
function selfBootstrap(backlogDir, repoRoot) {
  // 1. Remove stale .loop-stop sentinel left by a previous run.
  try {
    const stopFile = path.join(backlogDir, '.loop-stop');
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  } catch (_) { /* silent degrade */ }

  // 2. Clear stale .merge-lock when its pid is no longer alive (e.g. /clear killed
  //    the worker mid-merge).
  try {
    const mergeLock = path.join(backlogDir, '.merge-lock');
    if (fs.existsSync(mergeLock)) {
      const lockPid = parseInt(fs.readFileSync(mergeLock, 'utf8').trim(), 10);
      let alive = false;
      if (!Number.isNaN(lockPid)) {
        try { process.kill(lockPid, 0); alive = true; } catch (_) { alive = false; }
      }
      if (!alive) fs.unlinkSync(mergeLock);
    }
  } catch (_) { /* silent degrade */ }

  // 3. Reconcile .active-agents: keep only entries with no done-signal that are still
  //    "In Progress"; drop entries already done / no longer In Progress.
  try {
    const activeFile = path.join(backlogDir, '.active-agents');
    if (fs.existsSync(activeFile)) {
      const kept = [];
      for (const raw of fs.readFileSync(activeFile, 'utf8').split('\n')) {
        const tid = raw.trim();
        if (!tid) continue;
        if (fs.existsSync(path.join(backlogDir, '.agent-done-' + tid))) continue;
        let status = '';
        try {
          status = execSync('backlog task view ' + tid + ' --plain',
            { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        } catch (_) { status = ''; }
        if (/In Progress/i.test(status)) kept.push(tid);
      }
      fs.writeFileSync(activeFile, kept.length ? kept.join('\n') + '\n' : '');
    }
  } catch (_) { /* silent degrade */ }

  // 4. Seed .last-review-commit with HEAD if missing so the review-due predicate
  //    starts counting from now (ADR-009 review-due row).
  try {
    const reviewMarker = path.join(backlogDir, '.last-review-commit');
    if (!fs.existsSync(reviewMarker)) {
      const head = execSync('git rev-parse HEAD',
        { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (head) fs.writeFileSync(reviewMarker, head + '\n');
    }
  } catch (_) { /* git failure → skip best-effort */ }
}

// reapSameFieldScanners: self-sufficient startup singleton. Before taking the field,
// find any OTHER `node .../scan-loop.js` process scanning THIS tasks-dir and SIGTERM it,
// then SIGKILL stragglers after a grace window. This replaces the old `.scanner.lock`
// exit(3)-on-conflict path AND the SKILL.md PATH-3 `pgrep | xargs kill` text.
//
// Match rule (critical): the candidate must be a REAL scanner — argv[0] is `node` AND
// argv[1] is the scan-loop.js script. This excludes the Monitor's own bash wrapper (argv[0]
// is `bash`, but its `eval "node …/scan-loop.js --loop"` cmdline also contains "scan-loop.js").
// Matching the wrapper would SIGTERM our own parent → Monitor "failed (exit 144)".
// selfPid additionally excludes this process. Linux-only (no-op where /proc is absent).
//
// Singleton key is (tasksDir, mode) — TASK-244. Two scanner instances can legitimately
// coexist on the SAME tasks-dir when they run different --mode values (loop-backlog
// --mode ready + loop-draft --mode draft): each must reap only same-tasks-dir/same-mode
// peers, never the other mode's scanner. `mode` defaults to 'ready' (matching parseArgs'
// default) when omitted from either the caller or the candidate's argv.
// findSameFieldPeers: scan /proc for OTHER `node .../scan-loop.js` processes that
// target THIS tasks-dir AND THIS mode. Shared candidate-discovery logic used by both
// reapSameFieldScanners (unconditional startup supersede) and convergeSingleton
// (per-tick tiebreak convergence). Returns an array of peer pids (never includes selfPid).
function findSameFieldPeers(selfPid, tasksDir, mode) {
  const myTasksDir = path.resolve(tasksDir);
  const myMode = mode || 'ready';
  let pids = [];
  try { pids = fs.readdirSync('/proc').filter(s => /^\d+$/.test(s)); }
  catch (_) { return []; }  // not Linux — nothing to find

  const peers = [];
  for (const pidStr of pids) {
    const pid = parseInt(pidStr, 10);
    if (Number.isNaN(pid) || pid === selfPid) continue;
    let argv;
    try { argv = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').filter(Boolean); }
    catch (_) { continue; }
    // Real scanner only: argv[0] is node and argv[1] is the scan-loop.js script.
    // (Excludes bash wrappers, `node -e` snippets, test runners, etc.)
    if (path.basename(argv[0] || '') !== 'node') continue;
    if (!argv[1] || !/scan-loop\.js$/.test(argv[1])) continue;
    // Resolve the candidate's tasks-dir the same way resolveTasksDir does.
    let target = null;
    const tdIdx = argv.indexOf('--tasks-dir');
    if (tdIdx >= 0 && argv[tdIdx + 1]) {
      target = path.resolve(argv[tdIdx + 1]);
    } else {
      try {
        const cwd = fs.readlinkSync('/proc/' + pid + '/cwd');
        const root = execSync('git rev-parse --show-toplevel',
          { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        target = path.join(root, 'backlog', 'tasks');
      } catch (_) { target = null; }
    }
    // Resolve the candidate's mode the same way parseArgs does (default 'ready').
    let candMode = 'ready';
    const mIdx = argv.indexOf('--mode');
    if (mIdx >= 0 && argv[mIdx + 1]) {
      candMode = argv[mIdx + 1];
    } else {
      const eq = argv.find(a => a.startsWith('--mode='));
      if (eq) candMode = eq.slice('--mode='.length);
    }
    if (target && path.resolve(target) === myTasksDir && candMode === myMode) peers.push(pid);
  }
  return peers;
}

function killAndEscalate(victims) {
  if (!victims.length) return;
  for (const pid of victims) { try { process.kill(pid, 'SIGTERM'); } catch (_) { /* gone */ } }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const alive = victims.filter(pid => { try { process.kill(pid, 0); return true; } catch (_) { return false; } });
    if (alive.length === 0) return;
    try { execSync('sleep 0.1', { stdio: 'ignore' }); } catch (_) { break; }
  }
  for (const pid of victims) {
    try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch (_) { /* gone */ }
  }
}

function reapSameFieldScanners(selfPid, tasksDir, mode) {
  const victims = findSameFieldPeers(selfPid, tasksDir, mode);
  killAndEscalate(victims);
}

// readProcStartTime: parse field 22 (starttime, ticks since boot) of /proc/<pid>/stat.
// Best-effort — returns NaN on any failure (missing /proc, permission, malformed line).
// NaN is deliberately treated as "oldest" by shouldReapPeer's caller contract so a peer
// whose start time cannot be read is always reapable, never a false survivor.
function readProcStartTime(pid) {
  try {
    const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
    // Fields after the comm field (which may itself contain spaces/parens) are
    // whitespace-separated starting right after the LAST ')'.
    const closeParen = stat.lastIndexOf(')');
    if (closeParen < 0) return NaN;
    const rest = stat.slice(closeParen + 2).split(' ');
    // rest[0] = state (field 3), so field 22 (starttime) is rest[22 - 3] = rest[19].
    const raw = rest[19];
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? NaN : n;
  } catch (_) { return NaN; }
}

// shouldReapPeer: pure newest-wins tiebreaker with a strict total order over
// (startTime, pid) so exactly one of any two distinct scanners reaps the other —
// never both (mutual kill) and never neither (mutual survive). NaN startTime is
// treated as -Infinity (always older / always reapable), matching readProcStartTime's
// "unreadable → oldest" contract.
function shouldReapPeer(self, peer) {
  const selfStart = Number.isNaN(self.startTime) ? -Infinity : self.startTime;
  const peerStart = Number.isNaN(peer.startTime) ? -Infinity : peer.startTime;
  if (selfStart !== peerStart) return selfStart > peerStart;
  return self.pid > peer.pid;
}

// convergeSingleton: per-tick self-healing convergence guard (Phase A / TASK-249).
// Unlike reapSameFieldScanners (unconditional startup supersede — "new arm always wins"),
// this only reaps a same-field/same-mode peer when shouldReapPeer says THIS process is
// the newer one. Called every tick by every live scanner, so two coexisting peers left by
// a startup race converge to exactly one survivor within one interval — without requiring
// a new arm — while an older peer never annihilates a legitimately newer replacement mid
// re-arm race (shouldReapPeer is false for it, so it reaps nothing).
function convergeSingleton(selfPid, tasksDir, mode) {
  const peers = findSameFieldPeers(selfPid, tasksDir, mode);
  if (!peers.length) return;
  const self = { pid: selfPid, startTime: readProcStartTime(selfPid) };
  const victims = peers
    .map(pid => ({ pid, startTime: readProcStartTime(pid) }))
    .filter(peer => shouldReapPeer(self, peer))
    .map(peer => peer.pid);
  killAndEscalate(victims);
}

function renderEvent(prefix, id, templatesDir, repoRoot, tasksDir = null) {
  const templatePath = path.join(templatesDir, prefix + '.md');
  try {
    const tmpl = fs.readFileSync(templatePath, 'utf8');
    // Bake in absolute paths so the emitted event line is self-contained.
    // Claude runs each event line in a fresh Bash shell that does NOT inherit
    // env vars from the daemon (Bash-tool shells re-init from the user profile),
    // so a literal $BAIME_SCRIPTS / ${REPO_ROOT} would expand to empty there.
    // __dirname IS the BAIME_SCRIPTS dir (handler scripts are co-located here).

    // Extract task title — safe-degrade to '' on any miss or exception.
    // Title replacement runs LAST so a title containing __TASK_ID__ / $REPO_ROOT
    // / $BAIME_SCRIPTS is not re-expanded.
    let title = '';
    if (tasksDir) {
      try {
        const filePath = findTaskFileById(tasksDir, id);
        if (filePath) {
          const content = fs.readFileSync(filePath, 'utf8');
          const m = content.match(/^title:\s*(.+)$/m);
          if (m) {
            title = m[1].trim();
            // Strip a single matching pair of surrounding quotes (' or ")
            if ((title.startsWith("'") && title.endsWith("'")) ||
                (title.startsWith('"') && title.endsWith('"'))) {
              title = title.slice(1, -1);
            }
          }
        }
      } catch (_) { /* safe-degrade: title stays '' */ }
    }

    return tmpl
      .replace(/__TASK_ID__/g, id)
      .replace(/\$\{BAIME_SCRIPTS\}|\$BAIME_SCRIPTS/g, __dirname)
      .replace(/\$\{REPO_ROOT\}|\$REPO_ROOT/g, repoRoot)
      .replace(/__TASK_TITLE__/g, title);
  } catch (e) {
    return prefix + ':' + id;  // safe fallback
  }
}

function parseTaskId(filename) {
  const base = path.basename(filename, path.extname(filename)).toUpperCase();
  const first = base.split(/\s+/)[0];
  const m = first.match(/^([A-Za-z][A-Za-z0-9]*-\d+(?:\.\d+)*)$/);
  return m ? m[1] : null;
}

function readTaskMeta(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const m = content.match(/^---\n([\s\S]*?)^---/m);
    if (!m) return null;
    const fm = m[1];
    const statusMatch = fm.match(/^status:\s*(.+)$/m);
    const status = statusMatch ? statusMatch[1].trim().replace(/['"]/g, '').toLowerCase() : null;
    const parentMatch = content.match(/^parent_task_id:\s*(.+)$/m);
    const parent_task_id = parentMatch ? parentMatch[1].trim().toUpperCase() : null;
    return { status, parent_task_id };
  } catch { /* unreadable */ }
  return null;
}

// engineWatchOnce: BACK-605.8 Phase C board-scan source for the basic-ready channel.
// Shells out to the epicd engine's own data-derived scanner (`bun run cli engine watch
// --once`, which reuses Interpreter.scan over (pipeline_id, phase) — src/engine/watch.ts)
// instead of matching a hardcoded status-string literal against each task file. The
// engine renders one `---EVENT---`-delimited blob per actionable task, each blob
// containing the task's id (from renderEvent's __TASK_ID__ substitution); this parses
// those ids back out. Best-effort: any spawn/parse failure degrades to an empty Set so
// a transient CLI/engine hiccup never crashes the scanner tick.
function engineWatchOnce(repoRoot) {
  const out = new Set();
  let stdout;
  try {
    stdout = execSync('bun run cli engine watch --once', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString();
  } catch (_) {
    return out;
  }
  const blobs = stdout.split('---EVENT---');
  for (const blob of blobs) {
    const m = blob.match(/\b([A-Za-z][A-Za-z0-9]*-\d+(?:\.\d+)*)\b/);
    if (m) out.add(m[1].toUpperCase());
  }
  return out;
}

function isEpicReady(filepath) {
  const meta = readTaskMeta(filepath);
  if (!meta) return false;
  return meta.status === EPIC_READY_STATUS;
}

// Draft-lane predicates (draft mode only). Only look at status — never labels; claim is
// expressed by status advancing (Draft → Refining), not by a claim label (§5 unified claim,
// TASK-244). kind:feature/kind:task routing is decided by the worker (handle-basic-draft.sh),
// not the scanner.
function isBasicDraft(filepath) {
  const meta = readTaskMeta(filepath);
  if (!meta) return false;
  return meta.status === BASIC_DRAFT_STATUS;
}

function isEpicDraft(filepath) {
  const meta = readTaskMeta(filepath);
  if (!meta) return false;
  return meta.status === EPIC_DRAFT_STATUS;
}

// Locate a task .md file by its task id (e.g. "TASK-3") within tasksDir.
function findTaskFileById(tasksDir, taskId) {
  let entries;
  try { entries = fs.readdirSync(tasksDir); } catch { return null; }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    if (parseTaskId(entry) === taskId) return path.join(tasksDir, entry);
  }
  return null;
}

// scanEvalDueEpics: single whole-dir scan that returns a Set of epic IDs where
// the epic is at "Epic: Awaiting Children" AND all its children are in a terminal state
// (Basic: Done or Basic: Needs Human). Replaces the per-file isChildDone predicate —
// suppresses partial completion (e.g. 3/6 done) and eliminates cold-start bursts.
// Self-clearing: once the epic advances to Evaluating/Done, epicStatus no longer matches
// EPIC_AWAITING_CHILDREN_STATUS → predicate flips false → pulse stops re-emitting.
function scanEvalDueEpics(tasksDir) {
  const epics = {};            // epicId → status (lowercase)
  const childrenByParent = {}; // parentId → [child statuses (lowercase)]
  let entries;
  try { entries = fs.readdirSync(tasksDir); } catch { return new Set(); }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const id = parseTaskId(entry);
    if (!id) continue;
    const meta = readTaskMeta(path.join(tasksDir, entry));
    if (!meta) continue;
    if (meta.status && meta.status.startsWith('epic:')) {
      epics[id] = meta.status;
    } else if (meta.status && meta.status.startsWith('basic:') && meta.parent_task_id) {
      const parentId = meta.parent_task_id;
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(meta.status);
    }
  }
  const result = new Set();
  for (const [epicId, epicStatus] of Object.entries(epics)) {
    if (epicStatus !== EPIC_AWAITING_CHILDREN_STATUS) continue;
    const children = childrenByParent[epicId] || [];
    if (children.length === 0) continue;
    const allTerminal = children.every(s =>
      s === BASIC_DONE_STATUS || s === BASIC_NEEDS_HUMAN_STATUS
    );
    if (allTerminal) result.add(epicId);
  }
  return result;
}

function scanIds(tasksDir, predicate) {
  const out = new Set();
  let entries;
  try { entries = fs.readdirSync(tasksDir); } catch { return out; }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const id = parseTaskId(entry);
    if (id && predicate(path.join(tasksDir, entry))) out.add(id);
  }
  return out;
}

// ── reap-due channel (6th channel) ────────────────────────────────────────────
// Pure predicate: is a claimed In-Progress task past the reap threshold?
// Parse-failure / NaN / undefined → false (never throws). Designed to take a
// claimedAt value so it can be unit-tested by injecting a timestamp.
function isReapDue(claimedAt, now, thresholdMs = REAP_THRESHOLD_MS) {
  try {
    const t = Date.parse(claimedAt);
    if (Number.isNaN(t)) return false;
    return (now - t) > thresholdMs;
  } catch { return false; }
}

// status is any "working" state — "Basic: In Progress" OR "Basic: Refining" (generalized
// for stale-in-progress reap coverage of the Draft lane's claim state; TASK-244 §5).
// A task stale-reaped mid-Refining is caught by the same channel as a stale In-Progress
// task — no separate Draft stale-reap needed.
function isInProgress(filepath) {
  const meta = readTaskMeta(filepath);
  return !!meta && (meta.status === BASIC_IN_PROGRESS_STATUS || meta.status === BASIC_REFINING_STATUS);
}

// Read the most-recent `claimed: <timestamp>` note stamped by claimBatch.
// Returns the timestamp string, or null when absent/unreadable.
function readClaimedAt(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const matches = [...content.matchAll(/claimed:\s*(\S+)/g)];
    if (!matches.length) return null;
    return matches[matches.length - 1][1];
  } catch { return null; }
}

// ── review-due channel (7th channel) ──────────────────────────────────────────
// Pure predicate: have at least `interval` commits landed since the last review?
// commitCounter is a function () → Int that returns the commit count.
// Exception / NaN / Infinity → false (never throws). Designed for unit testing
// by injecting a counter function.
function isReviewDue(interval, commitCounter) {
  try {
    const n = commitCounter();
    return Number.isInteger(n) && n >= interval;
  } catch { return false; }
}

// Pure line builder: returns the event line string (with trailing newline) when
// isDue is true, or an empty string when false. Used by computePulseLines and
// can be unit-tested in isolation.
function computeReviewDueLine(headShort, isDue) {
  return isDue ? `review-due:${headShort}\n` : '';
}

// logStaleInProgress: records when a claimed In-Progress task was first observed past the
// reap threshold. Purely observational — performs NO status mutation and NO worktree
// mutation (TASK-242 removed the destructive auto-requeue/auto-delete branch that used to
// live here; see ADR-010 INV-20). Recovery from a genuinely orphaned task is a human action.
// Best-effort append to backlog/.reap-log.jsonl (NOT gcl-events.jsonl — that file has a
// 21-field gate schema; this is a separate lightweight observability stream).
function logStaleInProgress(tasksDir, id) {
  try {
    const reapLog = path.join(tasksDir, '..', '.reap-log.jsonl');
    const entry = JSON.stringify({ event: 'stale-in-progress-detected', taskId: id, ts: new Date().toISOString(), actor: 'scanner-daemon-direct' }) + '\n';
    fs.appendFileSync(reapLog, entry);
  } catch (e) { /* best-effort logging */ }
}

/**
 * Compute current actionable event lines.
 * Returns array of strings like "basic-ready:TASK-N".
 * Stdout only — diagnostics go to stderr.
 */
function computePulseLines(tasksDir, opts) {
  opts = opts || {};
  const reviewInterval = opts.reviewInterval || 10;
  const backlogDir = path.dirname(tasksDir);
  const repoRoot   = path.dirname(backlogDir);
  // --mode <ready|draft> restricts emitted lines to the channel group in MODE_CHANNELS.
  // Default 'ready' reproduces the full pre-mode channel set unchanged (Goal 5).
  const allowed = new Set(MODE_CHANNELS[opts.mode] || MODE_CHANNELS.ready);
  const channelAllowed = prefix => allowed.has(prefix);

  const channels = [
    { prefix: 'epic-ready',        predicate: f => isEpicReady(f) },
    { prefix: 'basic-draft',       predicate: f => isBasicDraft(f) },
    { prefix: 'epic-draft',        predicate: f => isEpicDraft(f) },
    { prefix: 'stale-in-progress', predicate: f => isInProgress(f) && isReapDue(readClaimedAt(f), Date.now()) },
  ];
  const lines = [];
  // basic-ready: data-derived via `engine watch --once` (BACK-605.8 Phase C), not a
  // per-file status-string predicate — see engineWatchOnce.
  if (channelAllowed('basic-ready')) {
    for (const id of [...engineWatchOnce(repoRoot)].sort()) {
      lines.push(`basic-ready:${id}`);
    }
  }
  for (const ch of channels) {
    if (!channelAllowed(ch.prefix)) continue;
    for (const id of [...scanIds(tasksDir, ch.predicate)].sort()) {
      lines.push(`${ch.prefix}:${id}`);
    }
  }
  // epic-eval-due channel: whole-dir scan, emits one event per epic that is at
  // "Epic: Awaiting Children" AND all its children are terminal (Done or Needs Human).
  if (channelAllowed('epic-eval-due')) {
    for (const id of [...scanEvalDueEpics(tasksDir)].sort()) {
      lines.push('epic-eval-due:' + id);
    }
  }
  // 7th channel — review-due: fires when commits since .last-review-commit >= reviewInterval.
  // Self-clearing: worker writes .last-review-commit=HEAD unconditionally after dispatch,
  // so counter drops to 0 and predicate flips true→false. See ADR-009 review-due row.
  if (channelAllowed('review-due')) {
    try {
      const markerPath = path.join(backlogDir, '.last-review-commit');
      const marker = fs.existsSync(markerPath)
        ? fs.readFileSync(markerPath, 'utf8').trim()
        : null;
      if (marker) {
        const counter = () => parseInt(
          execSync(`git rev-list --count ${marker}..HEAD`, { cwd: repoRoot }).toString().trim(),
          10
        );
        if (isReviewDue(reviewInterval, counter)) {
          const h = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
          lines.push(`review-due:${h}`);
        }
      }
    } catch (e) {
      // silent degradation — git failure does not crash scanner
    }
  }

  return lines;
}

// Export all public functions for use in tests (side-effect-free require)
module.exports = {
  parseArgs,
  engineWatchOnce,
  isEpicReady,
  isBasicDraft,
  isEpicDraft,
  scanEvalDueEpics,
  isReapDue,
  isInProgress,
  readClaimedAt,
  scanIds,
  computePulseLines,
  isReviewDue,
  computeReviewDueLine,
  resolveTemplatesDir,
  renderEvent,
  logStaleInProgress,
  resolveTasksDir,
  selfBootstrap,
  reapSameFieldScanners,
  shouldReapPeer,
  convergeSingleton,
  readProcStartTime,
  MODE_CHANNELS,
};

// ── Runtime entry point (only when run directly) ──────────────────────────────
if (require.main === module) {
  const args       = parseArgs(process.argv);
  const tasksDir   = resolveTasksDir(args);            // self-resolving (ADR-012 §151)
  const backlogDir = path.dirname(tasksDir);
  const repoRoot   = path.dirname(backlogDir);
  const intervalMs = Math.round(args.interval * 1000);
  const stopFile   = (args.stopFile && args.stopFile !== 'backlog/.loop-stop')
    ? args.stopFile
    : path.join(backlogDir, '.loop-stop');

  // Clean stop handlers (defined early; releaseScannerLock is a no-op until lock is acquired)
  let _releaseLock = () => {};
  process.on('SIGTERM', () => { _releaseLock(); process.exit(0); });
  process.on('SIGINT',  () => { _releaseLock(); process.exit(0); });

  if (args.scanOnce) {
    // --scan-once: emit current actionable lines once, then exit.
    // No session disk-prep runs here — the probe path must remain side-effect-free.
    const lines = computePulseLines(tasksDir, args);
    for (const line of lines) {
      process.stdout.write(`${line}\n`);
    }
    process.exit(0);
  } else {
    // ── Self-sufficient startup: reap any prior same-field scanner, then take over ──
    // Replaces the old .scanner.lock exit(3)-on-conflict path + SKILL.md PATH-3 pgrep
    // backstop. reapSameFieldScanners is self-safe (reads /proc/<pid>/cmdline, excludes
    // self) so it cannot match this process. After it returns, we are the sole owner.
    // Singleton key is (tasksDir, mode) — TASK-244: a 'ready' and a 'draft' scanner on
    // the same tasks-dir must coexist, never reap each other.
    reapSameFieldScanners(process.pid, tasksDir, args.mode || 'ready');

    // Advisory lock file (informational only — reap is the real singleton mechanism).
    // Named per-mode so 'ready' and 'draft' scanners never overwrite each other's lock.
    const lockFile = path.join(tasksDir, '.scanner-' + (args.mode || 'ready') + '.lock');
    const selfId = String(process.pid);
    fs.writeFileSync(lockFile, selfId, { flag: 'w' });
    function releaseScannerLock() {
      try { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); } catch (_) {}
    }
    _releaseLock = releaseScannerLock;

    // EPIPE async backstop (ADR-012 A2; TASK-233 orphan self-heal). On POSIX,
    // pipe-backed stdio surfaces a dead read-end as an asynchronous 'error' event
    // (EPIPE), NOT a synchronous throw from write(). When the owning session/Monitor
    // dies its pipe read-end closes; the next heartbeat write trips this handler and
    // the orphan reaps itself: releaseScannerLock() FIRST (zero residual), then exit.
    function onPipeError(e) {
      if (e && e.code === 'EPIPE') {
        releaseScannerLock();
        process.exit(0);
      }
    }
    process.stderr.on('error', onPipeError);
    process.stdout.on('error', onPipeError);

    // Idempotent session disk-prep (ADR-012 §151 / TASK-232): folded from the old
    // SKILL.md scannerBootstrap fence. --loop only; runs once before the first tick.
    selfBootstrap(backlogDir, repoRoot);

    // --loop (default): foreground loop, emit new events to stdout, diagnostics to stderr
    const notified = new Map(); // prefix -> Set<id>
    const channelPrefixes = MODE_CHANNELS[args.mode] || MODE_CHANNELS.ready;
    for (const p of channelPrefixes) notified.set(p, new Set());
    const templatesDir = resolveTemplatesDir(args);

    function tick() {
      if (fs.existsSync(stopFile)) {
        process.stderr.write('[scan-loop] stop sentinel found, exiting\n');
        releaseScannerLock();
        process.exit(0);
      }

      // Per-tick self-healing convergence (Phase A / TASK-249): reap any same-field/
      // same-mode peer only when THIS process is newer (shouldReapPeer). Makes a
      // startup-race duplicate self-heal within one interval, without requiring a
      // new arm. Best-effort — must never crash the tick loop.
      try {
        convergeSingleton(process.pid, tasksDir, args.mode || 'ready');
      } catch (_) { /* non-Linux or transient /proc read failure — safe degrade */ }

      // Per-tick liveness heartbeat (ADR-012 A2/B5; TASK-233 orphan self-heal).
      // Stderr-only (B6: stdout stays rendered-event-only). When the read-end of
      // stderr is gone (the owning session/Monitor died), this write raises EPIPE
      // → the orphan reaps ITSELF within ≤ one interval: releaseScannerLock() FIRST
      // (A2 clean-stop, zero residual), then exit. Any other write error degrades
      // silently so a transient stderr hiccup never crashes a live scanner.
      try {
        process.stderr.write('[scan-loop] heartbeat ' + new Date().toISOString() + ' pid ' + process.pid + '\n');
      } catch (e) {
        if (e && e.code === 'EPIPE') {
          releaseScannerLock();
          process.exit(0);
        }
        /* non-EPIPE write error → silent degrade */
      }

      // Draft refinement (TASK-244): basic-draft/epic-draft channels are emitted via the
      // normal Monitor event path below (computePulseLines + notified-Map dedup), routed
      // to loop-draft's session. There is no daemon-direct status mutation here — the
      // unified claim (Draft → Refining) happens in loop-draft's dispatch templates, not
      // in this scanner. See plugin/skills/loop-draft/SKILL.md.

      const lines = computePulseLines(tasksDir, args);
      // Parse prefix from each line and track new events
      for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const prefix = line.slice(0, colon);
        const id     = line.slice(colon + 1);
        const seen   = notified.get(prefix);
        if (seen && !seen.has(id)) {
          if (prefix === 'stale-in-progress') logStaleInProgress(tasksDir, id);
          const rendered = renderEvent(prefix, id, templatesDir, repoRoot, tasksDir);
          process.stdout.write(rendered + '\n---EVENT---\n');
          seen.add(id);
        }
      }
      // Remove IDs that are no longer actionable (edge-clear)
      const currentIds = new Map();
      for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const prefix = line.slice(0, colon);
        const id     = line.slice(colon + 1);
        if (!currentIds.has(prefix)) currentIds.set(prefix, new Set());
        currentIds.get(prefix).add(id);
      }
      for (const [prefix, seen] of notified) {
        for (const id of [...seen]) {
          if (!currentIds.has(prefix) || !currentIds.get(prefix).has(id)) {
            seen.delete(id);
          }
        }
      }
    }

    // Run first tick immediately, then on interval
    tick();
    setInterval(tick, intervalMs);
  }
}
