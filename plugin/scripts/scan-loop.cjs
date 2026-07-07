#!/usr/bin/env node
// daemon-version: v14
/**
 * scan-loop.js — UNIFIED B″ poller. Self-sufficient: at --loop startup it reaps any
 * prior same-field scanner (reapSameFieldScanners), then polls the epicd board and emits
 * event channels to stdout:
 *
 *
 *   basic-ready:TASK-N       actionable (pipeline_id/phase-derived, via `engine scan
 *                            --once`, BACK-614) → worker executes task
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
 * NOTE (BACK-614 / BACK-625 / BACK-628.4 / ADR-015): the `basic-ready`, `epic-ready`,
 * and `epic-eval-due` channels' scan authority AND dispatch payload are ALL the epicd
 * engine. `engine scan --once` reuses Interpreter.scan over (pipeline_id, phase) —
 * src/engine/scan.ts — and emits one minimal machine line ("basic-ready:<id>" /
 * "epic-ready:<id>" / "epic-eval-due:<id>") per actionable task; engineScanOnce (below)
 * reads those for edge-dedup. On each NEW key in one of these three channels, engineDispatch
 * (below) fetches the self-contained instruction from `engine dispatch <id>`
 * (src/engine/dispatch.ts) and this daemon passes it through verbatim. This daemon is PURE
 * TRANSPORT: it authors no instruction text, reads no template file — it only dedups on the
 * stable machine key and adds the `---EVENT---` framing (the invocation-adapter's job;
 * ADR-015 D3/D5). The engine's dispatch output is exactly the block a Monitor seat OR raw
 * `claude -p` executes (swap-litmus). draft channels stay bare `prefix:id` (out of scope
 * until their handlers move to the engine too).
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

const BASIC_DRAFT_STATUS = 'basic: draft';
const EPIC_DRAFT_STATUS  = 'epic: draft';
const BASIC_PROPOSAL_STATUS = 'basic: proposal';
const EPIC_PROPOSAL_STATUS  = 'epic: proposal';
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
      case '--mode':              args.mode = argv[++i] || 'ready'; break;
    }
  }
  return args;
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
          status = execSync('epicd task view ' + tid + ' --plain',
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

// engineDispatch: fetch the self-contained dispatch payload for ONE task from the engine
// (BACK-625 / BACK-628.4 / ADR-015) — shared by the basic-ready, epic-ready, and
// epic-eval-due channels; `engine dispatch <id>` branches on the task's phase to pick the
// right payload (src/engine/dispatch.ts). The engine authors the payload (prompt); this
// daemon is pure transport — it never reads a template file, never substitutes. The
// returned block's first line is the `<prefix>:<id>` machine key, followed by the
// self-contained instruction (the exact bytes a Monitor seat or `claude -p` executes).
// The task id is validated against the canonical id shape before it is ever handed to the
// shell (upstream capture is `\S+`) — defense-in-depth against shell metacharacters. On a
// transient engine-CLI failure it degrades to a single-shot, still-actionable line (NOT a
// guidance-less bare key: the Monitor description no longer explains bare lines).
const TASK_ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+(?:\.\d+)*$/;
function engineDispatch(repoRoot, prefix, id) {
  if (!TASK_ID_RE.test(id)) return prefix + ':' + id; // malformed id → never spawned
  const out = runEngineCli(repoRoot, 'dispatch ' + id);
  const trimmed = out === null ? null : out.replace(/\n+$/, '');
  if (trimmed) return trimmed;
  return prefix + ':' + id +
    '\nEngine dispatch failed this tick — re-run `' + engineCliCommand(repoRoot) + ' dispatch ' + id +
    '` from the repo root and follow its output.';
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
    return { status };
  } catch { /* unreadable */ }
  return null;
}

// engineCliCommand: resolves the shell command prefix used to invoke the epicd engine
// CLI's `engine` subcommand group. Portable across install shapes (BACK-605.9 M1 —
// this script ships inside the epicd Claude Code plugin and must not assume the epicd
// source tree is present at the board repo's cwd):
//   1. EPICD_ENGINE_CMD env var — explicit override, e.g. "epicd engine" when the
//      published CLI binary is on PATH (the normal case for a foreign repo that only
//      installed the plugin, not epicd's source).
//   2. "bun src/cli.ts engine" — build-free dev entry, used only when `src/cli.ts`
//      exists under `repoRoot` (the epicd dev tree dogfooding itself).
//   3. "epicd engine" — fallback assuming the published bin is on PATH.
function engineCliCommand(repoRoot) {
  if (process.env.EPICD_ENGINE_CMD) return process.env.EPICD_ENGINE_CMD;
  if (fs.existsSync(path.join(repoRoot, 'src', 'cli.ts'))) return 'bun src/cli.ts engine';
  return 'epicd engine';
}

// runEngineCli: single invocation seam to the epicd engine CLI (the scan/dispatch
// authority). cwd = repoRoot, stderr suppressed. Returns stdout on success or null on
// any spawn/engine failure — callers degrade best-effort so a transient CLI hiccup
// never crashes the tick. Both the scan source (engineScanOnce) and the payload fetch
// (engineDispatch) route through here so the invocation contract lives in exactly one
// place.
function runEngineCli(repoRoot, args) {
  try {
    return execSync(engineCliCommand(repoRoot) + ' ' + args,
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (_) {
    return null;
  }
}

// engineScanOnce: board-scan source for the basic-ready/epic-ready/epic-eval-due channels
// (BACK-614 / BACK-628.4). The scan authority is the epicd engine itself: `engine scan
// --once` reuses Interpreter.scan over (pipeline_id, phase) — src/engine/scan.ts — and
// emits one minimal machine line ("basic-ready:<id>" / "epic-ready:<id>" /
// "epic-eval-due:<id>") per actionable task. This reads those lines directly (no template
// rendering, no blob re-parse — this daemon is the one renderer) and buckets them by
// prefix. Best-effort: a null result degrades to empty Sets so a transient CLI/engine
// hiccup never crashes the scanner tick. Replaces the legacy per-file status-string
// predicates (isEpicReady/scanEvalDueEpics) — the engine's (pipeline_id, phase) state
// machine is now the single scan authority for all three channels.
function engineScanOnce(repoRoot) {
  const channels = { 'basic-ready': new Set(), 'epic-ready': new Set(), 'epic-eval-due': new Set() };
  const stdout = runEngineCli(repoRoot, 'scan --once');
  if (stdout === null) return channels;
  for (const line of stdout.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const prefix = line.slice(0, colon);
    const id = line.slice(colon + 1);
    if (channels[prefix]) channels[prefix].add(id);
  }
  return channels;
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

// A task is "in progress" iff it has a non-null claimed: cap stamp (written by the worker
// when claiming the task — see handle-basic-ready.sh). Post-BACK-664, status: is no longer
// persisted on disk for engine tasks (field-registry present gate); the claim cap note is
// now the authoritative "worker is active" signal for the stale-in-progress reaper.
// Terminal phases (done/needs-human) accumulate claimed: notes historically but are never
// "in progress" — skip them to avoid false-positive stale-in-progress events.
function isInProgress(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const phaseMatch = content.match(/^phase:\s*(\S+)/m);
    const phase = phaseMatch?.[1];
    if (phase === 'done' || phase === 'needs-human') return false;
  } catch { return false; }
  return readClaimedAt(filepath) !== null;
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

// trackEvents: edge-triggered acquisition dedup + edge-clear — the self-clearing bridge
// (ADR-009 lineage / ADR-015 layer 1). Given the prior `notified` state (Map<prefix,
// Set<id>>, pre-seeded with the mode's channels) and the current pulse `lines`, returns the
// newly-actionable {prefix, id} (rising edge only) and mutates `notified` to match: it adds
// each freshly-emitted id and edge-clears any id no longer present. So a task that leaves the
// emit set (e.g. `engine complete` advances its phase off `ready`) drops out of `notified`
// and will re-emit if it ever becomes actionable again — while a still-present (claimed,
// In-Progress) task is NOT re-dispatched. This layer only ever inspects the machine key; it
// never looks at the dispatch payload (ADR-015 D3/D5). Only pre-seeded prefixes emit.
function trackEvents(notified, lines) {
  const current = new Map();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const prefix = line.slice(0, colon);
    const id     = line.slice(colon + 1);
    if (!current.has(prefix)) current.set(prefix, new Set());
    current.get(prefix).add(id);
  }
  const fresh = [];
  for (const [prefix, ids] of current) {
    const seen = notified.get(prefix);
    if (!seen) continue; // channel not polled in this mode — never emit
    for (const id of ids) {
      if (!seen.has(id)) { fresh.push({ prefix, id }); seen.add(id); }
    }
  }
  // edge-clear ids no longer actionable
  for (const [prefix, seen] of notified) {
    const cur = current.get(prefix);
    for (const id of [...seen]) {
      if (!cur || !cur.has(id)) seen.delete(id);
    }
  }
  return fresh;
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
    { prefix: 'basic-draft',       predicate: f => isBasicDraft(f) },
    { prefix: 'epic-draft',        predicate: f => isEpicDraft(f) },
    { prefix: 'stale-in-progress', predicate: f => isInProgress(f) && isReapDue(readClaimedAt(f), Date.now()) },
  ];
  const lines = [];
  // basic-ready/epic-ready/epic-eval-due: all data-derived via `engine scan --once`
  // (BACK-605.8 Phase C; BACK-628.4 extends this to the epic channels), not a per-file
  // status-string predicate — see engineScanOnce.
  if (channelAllowed('basic-ready') || channelAllowed('epic-ready') || channelAllowed('epic-eval-due')) {
    const engineChannels = engineScanOnce(repoRoot);
    for (const prefix of ['basic-ready', 'epic-ready', 'epic-eval-due']) {
      if (!channelAllowed(prefix)) continue;
      for (const id of [...engineChannels[prefix]].sort()) {
        lines.push(`${prefix}:${id}`);
      }
    }
  }
  for (const ch of channels) {
    if (!channelAllowed(ch.prefix)) continue;
    for (const id of [...scanIds(tasksDir, ch.predicate)].sort()) {
      lines.push(`${ch.prefix}:${id}`);
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
  engineScanOnce,
  engineDispatch,
  isBasicDraft,
  isEpicDraft,
  isReapDue,
  isInProgress,
  readClaimedAt,
  scanIds,
  trackEvents,
  computePulseLines,
  isReviewDue,
  computeReviewDueLine,
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
      // Edge-triggered dedup + edge-clear (self-clearing bridge). trackEvents returns only
      // the rising-edge {prefix, id}; the payload is fetched/built here (transport layer).
      for (const { prefix, id } of trackEvents(notified, lines)) {
        if (prefix === 'stale-in-progress') logStaleInProgress(tasksDir, id);
        // basic-ready/epic-ready/epic-eval-due payloads are authored by the engine
        // (BACK-625 / BACK-628.4 / ADR-015); this daemon is pure transport. Other channels
        // stay bare `prefix:id` (out of scope until their handlers move to the engine too).
        // `---EVENT---` framing is the adapter's job.
        const isEngineChannel = prefix === 'basic-ready' || prefix === 'epic-ready' || prefix === 'epic-eval-due';
        const block = isEngineChannel
          ? engineDispatch(repoRoot, prefix, id)
          : (prefix + ':' + id);
        process.stdout.write(block + '\n---EVENT---\n');
      }
    }

    // Run first tick immediately, then on interval
    tick();
    setInterval(tick, intervalMs);
  }
}
