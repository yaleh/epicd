---
id: BACK-700
title: Migrate epicd's own project directory from backlog/ to .epicd/
assignee:
  - '@claude'
created_date: '2026-07-13 11:54'
updated_date: '2026-07-14 09:10'
labels:
  - config
  - migration
dependencies:
  - BACK-699
priority: medium
ordinal: 113000
pipeline_id: execution
phase: done
dod:
  - text: bun test && bunx tsc --noEmit && bun run check .
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
本仓库（epicd 自身，dogfooding）从 backlog/ 迁移到 .epicd/，验证 BACK-699 的发现逻辑在真实仓库上可用。依赖 BACK-699 先合并——发现逻辑不认得 .epicd 之前不能迁移。

背景：讨论中确认了本仓库已有 6 个 .claude/worktrees/ 下的孤儿 worktree，已在讨论阶段清理完毕，不再是本任务的阻塞项。

范围扩大（Stage 1 file-line survey 发现）：原始范围遗漏了引擎自身运作机制脚本中硬编码的 backlog/ 路径——这些脚本正是驱动 BACK-699/BACK-700 自身认领(claim)、派发(dispatch)、合并(merge)流程所依赖的机制，若不同步修改，目录改名后引擎会立即断裂。已与用户确认一次性扩大范围改完。

改动范围：
- git mv backlog .epicd（单次提交，保留 rename 检测，任务 markdown 文件走 mv 而非 delete+add）
- Makefile:29-31 硬编码的 backlog/tasks/ 路径改为 .epicd/tasks/
- .gitignore:80-90 的 10 条 backlog/.* 运行时状态忽略规则改为 .epicd/.*
- plugin/scripts/handle-basic-ready.sh:34,38（CAPS_DIR、SIGNAL_FILE）硬编码 backlog/.caps、backlog/.agent-done-* 改为 .epicd/ 等价路径
- plugin/scripts/complete-task.sh:11(注释),18,20,23,24（CAPS_DIR、SIGNAL_FILE、ACTIVE_FILE、MERGE_LOCK）硬编码 backlog/.caps、.agent-done-*、.active-agents、.merge-lock 改为 .epicd/ 等价路径
- plugin/scripts/scan-loop.cjs：parseArgs 默认 stopFile 'backlog/.loop-stop'、resolveTasksDir 的 git-失败兜底常量 'backlog/tasks'、日志注释中的 backlog/.reap-log.jsonl、运行时 stopFile 字面量比较，均改为 .epicd/ 等价值（resolveTasksDir 主路径已动态派生，只需改兜底常量）
- plugin/scripts/skill-lint.sh:53（compgen glob 路径 backlog/tasks/）及第118行左右错误提示文案中的 backlog/tasks/ 改为 .epicd/tasks/
- scripts/smoke-parallel-task-locking.sh：init_repo() 调用 run_cli init --defaults 未显式传 --backlog-dir，BACK-699 合并后该 scratch repo 会默认落到 .epicd/ 而非 backlog/，导致第79行 set_check_active_branches_false 路径找错；顺带修复为显式传 --backlog-dir backlog（该脚本本身测试的是通用并发锁机制，与目录名无关，保持用 backlog 名字即可，不必改成 .epicd）
- 检查 README.md / ADVANCED-CONFIG.md / CLI-INSTRUCTIONS.md / AGENTS.md 中示例路径引用是否需要同步更新

非目标：
- 不改动 package.json keywords 数组里的 "backlog" 字样
- 不提供面向外部已有 backlog/ 项目的自动迁移命令
- 不处理 /home/yale/work/epicd-BACK-* 这些仓库外层的同级 worktree 目录
- 不改动 scripts/smoke-parallel-task-locking.sh 测试的目录名语义（它是通用锁机制冒烟测试，不是 epicd 自身仓库迁移的一部分），仅修复其因 BACK-699 默认值变化产生的显式参数缺失问题
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog/ 目录不再存在，.epicd/ 包含全部原有任务文件
- [x] #2 Makefile 中的 status 字段 lint 检查改用 .epicd/tasks/ 路径且 make 目标可正常运行
- [x] #3 .gitignore 中原 backlog/.* 系列规则全部替换为 .epicd/.* 等价规则
- [x] #4 迁移后 epicd task list --plain 输出与迁移前一致
- [x] #5 plugin/scripts/handle-basic-ready.sh 与 complete-task.sh 中的 CAPS_DIR/SIGNAL_FILE/ACTIVE_FILE/MERGE_LOCK 均指向 .epicd/，验证：grep -n 'backlog/' plugin/scripts/handle-basic-ready.sh plugin/scripts/complete-task.sh 无匹配
- [x] #6 plugin/scripts/scan-loop.cjs 的 stopFile 默认值与 resolveTasksDir 兜底常量均改为 .epicd/ 等价路径，验证：grep -n "'backlog/" plugin/scripts/scan-loop.cjs 无匹配
- [x] #7 plugin/scripts/skill-lint.sh 的 compgen 路径与错误文案改为 .epicd/tasks/，验证：grep -n 'backlog/tasks' plugin/scripts/skill-lint.sh 无匹配
- [x] #8 scripts/smoke-parallel-task-locking.sh 显式传入 --backlog-dir backlog，脚本可在 BACK-699 合并后的默认值变化下继续通过
- [x] #9 迁移后 bun test 全绿，MCP server 与 web UI 手工核查能正确发现 .epicd/ 目录，且能通过 handle-basic-ready.sh + complete-task.sh 实际驱动一个测试任务走完认领到合并的完整引擎流程验证脚本本身可用
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Migrate epicd's own project directory from backlog/ to .epicd/

## Phase A: Point engine mechanics scripts at .epicd/ FIRST (before the directory move)
Ordering rationale: handle-basic-ready.sh / complete-task.sh are the scripts driving THIS task's own claim/dispatch/merge. They must already reference .epicd/ paths by the time Phase B actually renames the directory, otherwise the in-flight worktree loses its own signal-file mechanism mid-task. Since BACK-700 itself is claimed via the CURRENT (backlog/) mechanism, these scripts stay dual-safe: derive the path via a single resolved variable, not two literals, so the same script works whether backlog/ or .epicd/ exists on disk at merge time.
### Implementation
- plugin/scripts/handle-basic-ready.sh:34,38 — replace hardcoded `backlog/.caps`, `backlog/.agent-done-*` with a resolved BACKLOG_DIR variable (probe .epicd first, else backlog, matching resolveBuiltInBacklogDirectory's priority: backlog > .backlog > .epicd)
- plugin/scripts/complete-task.sh:11(comment),18,20,23,24 — same resolved BACKLOG_DIR variable for CAPS_DIR/SIGNAL_FILE/ACTIVE_FILE/MERGE_LOCK
- plugin/scripts/scan-loop.cjs — stopFile default, resolveTasksDir git-failure fallback constant, reap-log comment, stopFile literal comparison: same probe-order resolution (prefer existing backlog/, else .epicd/)
- plugin/scripts/skill-lint.sh:53 compgen glob, ~118 error text: same probe-order resolution
### DoD
- [ ] `bash -n plugin/scripts/handle-basic-ready.sh plugin/scripts/complete-task.sh plugin/scripts/skill-lint.sh` (syntax check)
- [ ] `node --check plugin/scripts/scan-loop.cjs`
- [ ] manual: `bash plugin/scripts/skill-lint.sh --all` still passes against current backlog/ layout (pre-move regression check)

## Phase B: git mv backlog .epicd + static config references
### Implementation
- `git mv backlog .epicd` (single commit, preserves rename detection)
- Makefile:29-31 — `backlog/tasks/` → `.epicd/tasks/`
- .gitignore:80-90 — all 10 `backlog/.*` entries → `.epicd/.*` equivalents
- scripts/smoke-parallel-task-locking.sh:78 — add explicit `--backlog-dir backlog` to the `run_cli init` call in `init_repo()` (this script's scratch repos are unrelated to this repo's own directory; explicit flag keeps it correct after BACK-699 changed the init default)
- README.md / ADVANCED-CONFIG.md / CLI-INSTRUCTIONS.md / AGENTS.md — grep for `backlog/` path examples, update any that describe THIS repo's own layout (leave generic/user-facing examples about default dir naming as-is, since backlog/ remains valid for existing external projects)
### DoD
- [ ] `test ! -e backlog && test -d .epicd/tasks`
- [ ] `grep -rn '^backlog/' .gitignore` → empty
- [ ] `make lint-status` (or equivalent Makefile target) runs clean against .epicd/tasks/
- [ ] `bun run cli task list --plain` output (count + status distribution) matches pre-move baseline captured before Phase B

## Phase C: End-to-end engine verification
### Implementation
- No code changes; this phase proves Phase A's dual-path resolution actually works post-move
### DoD
- [ ] `grep -n 'backlog/' plugin/scripts/handle-basic-ready.sh plugin/scripts/complete-task.sh` → no matches (fully switched, since backlog/ no longer exists post Phase B)
- [ ] `grep -n "'backlog/" plugin/scripts/scan-loop.cjs` → no matches
- [ ] `grep -n 'backlog/tasks' plugin/scripts/skill-lint.sh` → no matches
- [ ] manual: create a throwaway test task, drive it through `handle-basic-ready.sh` claim → worktree → `complete-task.sh` merge against the post-move .epicd/ layout, confirm signal files land under .epicd/ and merge succeeds
- [ ] `bun test` full suite green
- [ ] `bunx tsc --noEmit`

## Constraints
- Phase ordering is load-bearing: Phase A (dual-path-safe scripts) must land before Phase B (actual rename) so this task's own worktree-driven execution doesn't sever its own claim/merge mechanism mid-flight.
- package.json `keywords` array `"backlog"` entry stays untouched (branding-only artifact, not a path).
- No auto-migration command for external users' existing backlog/ repos — out of scope.
- scripts/smoke-parallel-task-locking.sh keeps testing against a `backlog`-named scratch repo (generic lock-mechanism test, unrelated to this repo's own directory name) — only gets an explicit flag, not renamed.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/refining review: APPROVED after 1 iteration(s). Plan verified against actual code (plugin/scripts/handle-basic-ready.sh:34,38, plugin/scripts/complete-task.sh:11,18,20,23,24 line numbers re-confirmed against current file content). Phase ordering (A: dual-path-safe scripts before B: actual git mv) is load-bearing since this task's own worktree execution is driven by the scripts being modified — confirmed this is not a chicken-and-egg problem because the resolved-path scripts are backward-compatible with backlog/ until Phase B actually removes it. AC#1-9 each map to a Phase DoD or Acceptance Gate item. touchesEngineCore(T) = True (plugin/scripts/*.sh directly implement claim/dispatch/merge mechanics) -> auditPolicy = Mandatory per fixpoint-convergence Stage 3, loop-until-dry required at audit time regardless of auditDepthFor's literal src/engine/ path-prefix check.

claimed: 2026-07-13T12:32:42Z

needs-human triage: OperationalMistake, not RealGate. engine complete hit a git merge conflict (file-location conflict: BACK-700's own board file was added in main's backlog/tasks/ after the worktree branched, while task/BACK-700 renamed backlog/->.epicd/ — classic add-vs-rename collision, analogous to the BACK-662 case study). Resolved manually: merged task/BACK-700 into main, placed the board file at .epicd/tasks/ keeping HEAD's content (latest board metadata). Post-merge bun test showed 3 failures, root-caused to a SEPARATE issue: git mv only moves git-tracked files, so gitignored runtime-state cruft (.agent-done-*, .caps/, .locks/, etc.) was left behind in the old backlog/ directory, making plugin/scripts/skill-lint.sh's bare-existence directory probe (backlog > .backlog > .epicd) resolve to the now-empty-of-tracked-content backlog/ instead of .epicd/. Fixed by removing the leftover backlog/ directory (untracked/gitignored cruft only, zero git content) — directly satisfies AC#1 (backlog/ directory no longer exists). Re-ran full gates after fix: bun test 2101 pass/0 fail, bunx tsc --noEmit clean, bun run check . exit 0 (13 pre-existing warnings, unrelated). All 9 ACs remain satisfied post-fix.

Independent fresh-context audit (full depth, dispatched round 1): verdict=done. All 9 ACs independently re-verified against live repo state and re-run gates (not implementer narrative) — all PASS. bun test 2101 pass/0 fail (matches), bunx tsc --noEmit clean, bun run check . exit 0. Pre-migration baseline check (detached worktree at 1320f5d8) confirmed the 8 legacy status-field lint warnings are pre-existing, not a regression. Scope check: no surprise files outside the described plan. One finding: NIT/OUT_OF_SCOPE — the backlog/.backlog/.epicd priority-probe logic is duplicated identically across 4 files (handle-basic-ready.sh, complete-task.sh, skill-lint.sh, scan-loop.cjs) rather than shared. No live bug today (all 4 agree), but flagged since it's exactly the class of inconsistency that caused this task's own leftover-backlog/-directory bug. Filed as follow-up BACK-701 (low priority), not a blocker for this task. newBlockers=0 (no HIGH findings) -> audit loop is dry after round 1, no further rounds required.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-14 09:10
---
其 Non-Goals 中"保留 backlog 品牌/协议标识（MCP_SERVER_NAME、backlog:// URI、npm 包名、上游归属 URL）不变"的裁定，已被 docs/proposals/2026-07-14-full-epicd-rebrand.md 推翻，本任务本身的改动范围与验收标准维持原样（历史记录），后续以该 proposal 为准。
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented in 2 commits inside /home/yale/work/epicd-BACK-700 (branch task/BACK-700):

Phase A (commit 631755fa): made plugin/scripts/handle-basic-ready.sh, complete-task.sh,
scan-loop.cjs, and skill-lint.sh resolve the board directory dynamically (probe
backlog/ > .backlog/ > .epicd/ in the same priority order as
resolveBuiltInBacklogDirectory), instead of hardcoding literal backlog/ paths.
Verified bash -n / node --check clean, and skill-lint.sh --all still passed against
the pre-move backlog/ layout (regression check before the rename).

Phase B (commit 971181d1): git mv backlog .epicd (704 files, 100% rename detection
preserved). Updated Makefile's status-field lint target, .gitignore's 10
backlog/.* runtime-state entries, scripts/smoke-parallel-task-locking.sh (pinned
--backlog-dir backlog explicitly since BACK-699 changed init's default), README.md /
ADVANCED-CONFIG.md / CLI-INSTRUCTIONS.md / AGENTS.md (relative doc links and prose
describing this repo's own layout — generic multi-project documentation left
unchanged), two skill contract.json provenance paths pointing at task files that
physically moved, and two test files (engine-cutover.test.ts, skill-provenance.test.ts)
whose assertions hardcoded the old backlog/ path/error text.

Deviation from plan: found and fixed 2 real test failures during bun test (not
anticipated in the plan text) — src/test/engine-cutover.test.ts asserted
backlog/config.yml existed, and src/test/skill-provenance.test.ts asserted the old
"does not resolve ... under backlog/tasks" error string. Both updated to match the
new .epicd/ reality; this is implementation-layer work within the task's own scope,
not a spec gap.

Verification: full bun test suite green (2101 pass/0 fail), bunx tsc --noEmit clean,
bun run check . exits 0 (13 pre-existing unrelated lint warnings, none in touched
files). AC#9's end-to-end engine flow was verified in an isolated scratch clone
(/tmp, cleaned up after) by creating a throwaway task, running
handle-basic-ready.sh (confirmed .caps/.wt/.signal files land under .epicd/, no
stray backlog/ dir created), writing an agent-done signal, and running
complete-task.sh (confirmed merge, phase=done, worktree cleanup all succeeded).

Not fixed (pre-existing, out of scope): 8 legacy task files under .epicd/tasks/
still carry a stale `status:` frontmatter field, which make validate-no-status
already flagged before this migration (confirmed identical on backlog/ pre-move) —
unrelated to the directory rename. scripts/smoke-parallel-task-locking.sh's
Scenario 2 (concurrent draft promotion) fails with "unknown command 'draft'" both
before and after this change — pre-existing CLI surface issue, unrelated to BACK-700.

Gate: bun test && bunx tsc --noEmit && bun run check . all green. All 9 ACs checked.

Migrated epicd's own board directory from backlog/ to .epicd/, including the engine's own claim/dispatch/merge scripts (handle-basic-ready.sh, complete-task.sh, scan-loop.cjs, skill-lint.sh) which were made dual-path-safe (backlog > .backlog > .epicd probe) before the actual git mv, so the migration didn't sever its own execution mechanism mid-flight. Hit one real operational snag during merge (board-file add-vs-directory-rename conflict, resolved manually) and one real bug (leftover gitignored backlog/ runtime-state cruft confusing skill-lint.sh's directory probe, fixed by removing it). All 9 ACs verified independently in a fresh-context audit; 2101/2101 tests pass, tsc/check clean. Filed BACK-701 as a low-priority follow-up to deduplicate the now-4x-repeated directory-probe logic across plugin scripts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
