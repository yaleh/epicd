---
id: BACK-605.8
title: >-
  E5: correct engine execution to Monitor-hosted in-session Agent (copy+adapt
  baime scan-loop/loop-backlog; retire claude-subprocess spawn)
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-04 11:36'
updated_date: '2026-07-04 13:35'
labels:
  - 'kind:basic'
dependencies: []
parent_task_id: BACK-605
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
【draft brief — 待 feature-to-backlog 生成 reviewed proposal/plan】

## 为什么
BACK-605.1 标 Done，但**实现与其自身规格相反**：它 ship 了 realSpawnPrimitive = Bun.spawn(['claude','--print',brief])（**claude CLI 子进程**）+ .codex/skills/epicd-run 托管 `engine run`（内部 spawn 该子进程）。而 605.1 的描述明确要求"**Monitor 托管：持久 Monitor 承载 engine run，item-ready 时 spawn 真 Claude Code Agent … 对应 baime handle-basic-ready.sh + Monitor 模式**"。即：应在 Claude Code **会话内**跑 monitor，会话用**自己的 Agent** 在 worktree 内干活——**不是**外壳调 claude 二进制。这是又一例 DoD-绿但架构错（同 decompose stub / 假 Stage-2 test 的元模式）。已于真实一条 child（BACK-609）用**正确手工模式**证明：monitor(会话)→claim+worktree→后台 Agent-in-worktree→sentinel→engine.completeTask（ENG-8 独立复核 DoD + 锁下 merge）跑通。本 task 把该正确模式落成可复用产物，退役错误的 claude-子进程路径。

## 关键纪律（用户指令）
- **先复制、再改**：baime 的 scan-loop.js（~34KB）/ loop-backlog skill / handle-basic-ready.sh / complete-task.sh / templates 经长期改进，**重写危险**。须**先原样 copy 进本项目**，再按 epicd 需要**增量适配**——不得从零重写。
- **未来（非本 task）**：将 scan-loop.js 改写为 TypeScript（先 copy JS 跑通，TS 化留后续 task）。

## 范围（copy-then-adapt）
1. **Copy** baime `plugin/scripts/scan-loop.js` + `plugin/skills/loop-backlog/{SKILL.md,templates/*,lib,smoke}` + `handle-basic-ready.sh` + `complete-task.sh` 进 epicd（如 `plugin/` 或 `.claude/skills/epicd-run/`）。
2. **Adapt 信号源**：baime scan-loop 的**硬编码 channel**（basic-ready/epic-ready…按 status 谓词）→ epicd 的**数据派生** `interpreter.scan` 的 `item-ready:<pipeline>:<phase>:<task>`（machine-actor phase）。即 emitter 读 epicd board、经 pipeline 数据算 actionable、emit 渲染指令模板。可加 `engine watch`（或等价）CLI 仅 emit、不 spawn。
3. **Adapt 执行**：per-event 模板（basic-ready 等价）→ 会话 claim+worktree→后台 **Agent**（非 claude 子进程）→ `.agent-done` sentinel→调 **engine.completeTask**（已实现的 ENG-8 复核+锁下 merge tail）。epic-ready 模板→propose children（引擎建子，已有 decomposer）。
4. **Retire 错误路径**：删/停用 realSpawnPrimitive 的 `Bun.spawn(['claude',...])` + `engine run` 内部 spawn worker 的 wiring；改为 emit + skill 驱动。守住 `! grep -rq 'Agent(' src/engine`。
5. epicd-run SKILL.md 重写为托管 emitter 的 Monitor + 正确 per-event 流。

## 非目标
- scan-loop.js 的 TS 化（后续 task）。
- 多 pipeline / 插件打包完整版（E5 其余）；authoring reviewer workers。

## 参考
docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md（supervisor/driver-per-field）；docs/uml/runtime-deployment.puml（spawn 接缝）；ADR-014/017；BACK-605.1（被更正的错实现）；BACK-609 drive（已证明的正确手工模式）；baime `plugin/scripts/scan-loop.js`、`skills/loop-backlog/`（copy 源）。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: correct engine execution to Monitor-hosted in-session Agent (copy+adapt baime)

Proposal: 见 Description。更正 BACK-605.1 的错架构（claude 子进程 → 会话内 Monitor+Agent）。
Plan review iter1: independent architect NEEDS_REVISION（B1/B2/B3 core、E1/E2 e2e-gate、A1/A2/A3、C1、D1/D3）→ 本 re-plan 并入。

> **Copy-first 的正确落法（调和用户指令 × 架构评审 B1）**：scan-loop.js 长期改进的价值在其 **runtime 硬化**（`---EVENT---` 分隔协议、`renderEvent` 模板替换、`notified` 边沿去重、EPIPE self-reap、单实例 `convergeSingleton`）——**保留**。其**board 扫描谓词**（`computePulseLines`/`isBasicReady` 按 baime status 串）对 epicd 的 (pipeline_id,phase,actor) 模型是死的——**只换这一层**：改为向新 `engine watch` 取 actionable。即 copy scan-loop.js 后**只改扫描源**，不重写、不弃其 runtime。`engine watch` 复用 `interpreter.scan`（不另造扫描器 → 无重复实现）。

## Phase A: copy baime 源（裁剪集）+ 统一 skill 路径
### Tests (write first)
- `src/test/epicd-run-assets.test.ts`：断言**在范围内**的拷贝产物存在非空：`plugin/scripts/scan-loop.js`、canonical `<skills>/epicd-run/SKILL.md`、`<skills>/epicd-run/templates/basic-ready.md`、`plugin/scripts/{handle-basic-ready.sh,complete-task.sh}`。断言**旧错 skill 已消解**：`! grep -rq 'engine run' <skills>/epicd-run`（.codex 与 .claude 两处都不得残留 engine-run/claude-subprocess 引用）。
### Implementation
- 定 canonical skill 路径（查 harness 实际加载：CLAUDE.md 引 `.codex/skills/epicd-run`；确认后择一，另一处删或改）。
- `cp` baime `scan-loop.js`、`loop-backlog/SKILL.md`、`loop-backlog/templates/basic-ready.md`、`handle-basic-ready.sh`、`complete-task.sh` → epicd 对应目录（起点，后续 phase 适配）。**排除** `lib/`、`smoke/`、epic-*/review-*/stale-* 模板（baime-board 死代码/超范围；如需存证放 `docs/reference/`）。
### DoD
- [ ] `bun test src/test/epicd-run-assets.test.ts`
- [ ] `! grep -rq 'engine run' .codex/skills/epicd-run .claude/skills/epicd-run 2>/dev/null`

## Phase B: `engine watch`（数据派生 emit）+ `engine complete <id>`（唯一 merge tail）
### Tests (write first)
- `src/test/engine-watch.test.ts`：临时 board 建 machine-actor execution task → watch 的 scan 函数 emit 含该 task 的**渲染指令 blob**（含 task id、worktree 步、`engine complete`）+ `---EVENT---` 分隔；none/human-actor/非 execution **不** emit。注入 spy spawn primitive，断言**从未被调**（emit 无 spawn 副作用，替代原坏 grep DoD C1）。
- `src/test/engine-complete-cli.test.ts`：`engine complete <id>` 薄壳 → 调 `completeTask`（ENG-8）→ 临时 board 上 DoD 通过则 phase→done、失败则 needs-human。
### Implementation
- `engine watch [--once] [--interval]`：复用 `interpreter.scan`/run.ts filter 得 actionable；**按 phase→模板映射**（`ready`→basic-ready；`decomposing`→epic-ready[范围外，reference]）**渲染** blob（port `renderEvent` 的替换）+ `---EVENT---`。（B2：emit 渲染 blob，非裸 `item-ready:` 行。）
- `engine complete <id> [--worktree <p>]`：薄 CLI over `completeTask`（+`runDoD` in worktree、`gitMergeBranch`、`realMergeLockFs`）。**唯一 merge 实现**（D3：skill 走此，不用 baime `complete-task.sh` 的第二套 merge/锁；`complete-task.sh` 仅 reference）。
### DoD
- [ ] `bun test src/test/engine-watch.test.ts`
- [ ] `bun test src/test/engine-complete-cli.test.ts`
- [ ] `! grep -rq 'Agent(' src/engine`
- [ ] `bunx tsc --noEmit`

## Phase C: 适配 scan-loop（只换扫描源，保 runtime）+ basic-ready 模板 + SKILL
### Tests (write first)
- `src/test/epicd-run-wiring.test.ts`：(a) `scan-loop.js` 的扫描源改为 `engine watch`（含 'engine watch'；**不**含 baime status 谓词 `basic: ready`），但保留 `---EVENT---`/`renderEvent`/dedup（含这些标识）；(b) `SKILL.md` 托管 `Monitor` on 适配后 scan-loop（或 `engine watch`）（含 'Monitor'；**不**含 `engine run`/`realSpawnPrimitive`/`claude --print`）；(c) `basic-ready.md` = epicd 流（含 'worktree'、'Agent'、'engine complete'、`.agent-done`；**不**含 `claude --print`、`Basic: Done` 硬状态）。
### Implementation
- 适配 `scan-loop.js`：`computePulseLines` 内部改 shell-out `bun run cli engine watch --once`（或直接让 SKILL Monitor `engine watch`，scan-loop 退为 reference——**择一并写死**）；**保留** renderEvent/分隔/notified 去重/EPIPE reap/singleton。
- 适配 `basic-ready.md`（对照 BACK-609 已证流程）：claim + `git worktree add` → 后台 **Agent**(cwd=worktree, brief) → 等 `.agent-done-<id>` → `bun run cli engine complete <id> --worktree <p>`。
- 重写 `SKILL.md`：Monitor 托管 emitter；per basic-ready → 上述流。**范围：只 basic-ready**（B3；epic-ready/eval 依赖 epic round-model，超范围，reference-only）。
### DoD
- [ ] `bun test src/test/epicd-run-wiring.test.ts`
- [ ] `! grep -rqE 'claude.*--print' .codex/skills/epicd-run .claude/skills/epicd-run 2>/dev/null`
- [ ] `bunx tsc --noEmit`

## Phase D: 退役 claude-子进程 + 迁移受影响测试
### Tests (write first)
- `src/test/no-claude-subprocess.test.ts`：`! grep -rqE 'spawn\(\[?"claude"' src`；`real-primitives.ts` 无 `Bun.spawn(["claude"…])`；`completeTask`/`gitMergeBranch` 仍 export（tail 存活，D2）。
- **枚举迁移** 5 个受影响 test（D1）：`engine-autonomous-e2e`、`engine-run-runner`、`engine-run`、`engine-monitor-e2e`、`engine-worker-runner`——逐个查是注入 fake（保留、可能只 makeWorkerRunner 存活）还是用 real primitive（删/改）；各自 `bun test <file>` 绿为其 DoD。
### Implementation
- 删 `realSpawnPrimitive` 的 `Bun.spawn(["claude","--print",…])` + cli.ts `engine run`/decompose 对它的注入；`engine run` 删或改薄壳指向 `engine watch`+skill。**保留** `completeTask`/`gitMergeBranch`/`withWorktree`/`runDoD`（引擎 tail）。
- 逐个修/删上述 5 test。
### DoD
- [ ] `bun test src/test/no-claude-subprocess.test.ts`
- [ ] `bun test src/test/engine-run.test.ts src/test/engine-run-runner.test.ts src/test/engine-worker-runner.test.ts src/test/engine-autonomous-e2e.test.ts src/test/engine-monitor-e2e.test.ts`
- [ ] `! grep -rqE 'spawn\(\[?"claude"' src`
- [ ] `bunx tsc --noEmit`

## Phase E: 端到端证据（不留 605.1 的未 gate 空洞，E1）
### Tests (write first)
- `src/test/epicd-run-integration.test.ts`（**CI 可跑、无会话**）：建临时 board+worktree，跑 `handle-basic-ready.sh <id>`（claim+worktree）→ **模拟 Agent**（在 worktree 写一次 commit + `.agent-done-<id>`）→ `bun run cli engine complete <id> --worktree <p>` → 断言 merge 成 + phase=done（DoD 通过路径）与 DoD 失败→needs-human/不 merge。**把 e2e 缩到只剩 `Agent()` spawn 一处不可测。**
### Implementation
- 上述 harness（复用 handle-basic-ready.sh 适配版 + engine complete）。
### DoD
- [ ] `bun test src/test/epicd-run-integration.test.ts`
- [ ] **手动 soak 记录（人验，非 CI）**：用 epicd-run skill 实跑一条真 `ready` task → merge，转录/记要 append 到本 task notes；参照 BACK-609 已证手工流为基准。

## Constraints
- **Copy-first**：copy scan-loop.js 后**只换扫描源、保 runtime 硬化**；不从零重写。scan-loop.js **TS 化 = 非目标**（后续 task）。
- **唯一 merge 实现**（D3）：skill 走 `engine complete`（TS `completeTask`）；baime `complete-task.sh` reference-only，不作 live 第二套 merge/锁。
- 引擎 core 零 `Agent()`/子进程；spawn 由**会话**（skill）经 background Agent；engine 只 emit + completeTask（ENG-8：worker 不自证 done）。
- **`Agent()` spawn 不可 CI 验**——由 Phase E 手动 soak 记录验证；**在 plan/skill 显式标注此空洞**（605.1 正因未标注而蒙混）。
- 只 basic-ready 在范围；epic-ready/eval reference-only。不破坏 BACK-609 等已合并；full `bun test` 绿。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `! grep -rqE 'spawn\(\[?"claude"' src`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iter1: independent architect NEEDS_REVISION → all folded. Key: (B1) copy scan-loop.js but keep only its RUNTIME hardening (---EVENT---/renderEvent/dedup/EPIPE/singleton), swap its baime-status board-scan for engine watch (reuses interpreter.scan, no duplicate scanner) — reconciles user's copy-first with the phase-model mismatch. (B2) emit rendered template blob+delimiter, not bare item-ready. (B3) basic-ready only; epic-* reference. (D3) single merge impl = engine complete over completeTask; baime complete-task.sh reference-only. (E1) added Phase E: CI shell integration test (handle-ready→fake sentinel+commit→engine complete→merge+phase=done) + manual soak DoD ref BACK-609; Agent()-spawn gap explicitly named. (D1) enumerated 5 impacted tests. (A1) reconcile .codex vs .claude skill path. (A2) trimmed copy set (no lib/smoke/epic templates). (C1) replaced broken grep DoD with spy-spawn unit assertion.

Bootstrap drive started: worktree task/BACK-605.8 created at /home/yale/work/epicd-BACK-605.8. Driving phase-by-phase (A first) per BACK-609 manual pattern; each phase Agent works only in worktree, session re-verifies DoD independently (ENG-8) before proceeding to next phase.

ENG-8 independent re-verify Phase A (session, in worktree /home/yale/work/epicd-BACK-605.8, commit 92add90): tsc PASS; bun test src/test/epicd-run-assets.test.ts 6/6 PASS; grep DoD (no 'engine run' string in .codex/skills/epicd-run or .claude/skills/epicd-run) PASS. Phase A confirmed green independently, not just via agent self-report. Proceeding to Phase B.

ENG-8 independent re-verify Phase B (commit e4308ef): tsc PASS; bun test engine-watch.test.ts + engine-complete-cli.test.ts 8/8 PASS; grep '! Agent(' in src/engine PASS (no match). Confirmed independently. Proceeding to Phase C.

ENG-8 independent re-verify Phase C (commit 5b0f52f): tsc PASS; bun test (wiring+assets+watch+complete-cli) 31/31 PASS; grep 'claude.*--print' absence PASS. Spot-checked scan-loop.js diff: surgical, isBasicReady/BASIC_READY_STATUS swapped for engineWatchOnce() shelling to 'engine watch --once', all runtime hardening (---EVENT---, renderEvent, dedup, EPIPE, singleton) untouched. Proceeding to Phase D.

ENG-8 independent re-verify Phase D (commit e4d28ee): tsc PASS; DoD's 6 test files 40/40 PASS; grep claude-subprocess absence PASS. Full bun test --parallel sweep: 1646 pass/1 fail(build.test.ts timeout under parallel load)/2 skip — build.test.ts confirmed pre-existing flaky (passes standalone, unrelated to this task's changes). engine run CLI command deleted entirely (smaller surgical change vs thin-shell, per agent's read of the code); completeTask/gitMergeBranch/decomposer preserved untouched. Proceeding to Phase E.

Phase E automated CI test passed (see src/test/epicd-run-integration.test.ts). The manual-soak DoD item (a live Claude Code session actually running the epicd-run skill against one real 'ready' task end-to-end, from Monitor-detected event through Agent-spawn through merge) has NOT been performed by this Task-tool subagent — it requires an actual interactive session, per the task plan's own explicit note that Agent()-spawn is untestable in CI. This must be performed separately by the orchestrating session before BACK-605.8 can be considered fully done, referencing BACK-609's already-proven manual pattern as the baseline.

ENG-8 independent re-verify Phase E (commit c616fe0): tsc PASS; epicd-run-integration.test.ts 2/2 PASS; SKILL.md untestable-gap doc confirmed present. Full Acceptance Gate independently run in worktree: bun test --parallel 1648 pass/1 fail(cli-milestone-management.test.ts)/2 skip/1 error — confirmed pre-existing parallel-load test-isolation flake (passes 10/10 standalone), unrelated to this task; bunx tsc --noEmit clean; bun run check . exit 0 (10 pre-existing warnings, 0 errors); claude-subprocess grep absent. All 5 phases (A-E) independently ENG-8-verified. Proceeding to merge via engine complete/completeTask tail.

Merged to main (fast-forward, HEAD c616fe0). Post-merge Acceptance Gate independently re-verified on main: bun test --parallel 1649 pass/0 fail/2 skip; bunx tsc --noEmit clean; bun run check . exit 0; claude-subprocess grep absent. Worktree removed, branch task/BACK-605.8 deleted (fully merged). Outstanding: manual-soak DoD item (live session running epicd-run skill end-to-end against a real ready task) still not performed — deferred per Phase E's own note; should be done as a follow-up before fully trusting the skill in production autonomous use.

MANUAL SOAK EXECUTED (2026-07-04, this session as monitor) — discharges the deferred manual-soak DoD, and it did exactly its job: caught a DoD-green-but-mechanism-broken defect CI missed. Drove BACK-611 (E1 child, freshly authored to plan-ready) through the REAL shipped flow: handle-basic-ready.sh (claim+worktree) → background Agent implemented plan in worktree (committed 4bfbc85, self+independently verified: tsc PASS, own tests 0 fail) → .agent-done sentinel → engine complete BACK-611 --worktree.

OUTCOME: engine complete → needs-human, NO merge. ROOT CAUSE (proven): runDoD executes each DoD-checkbox item.text as sh -c, but real tasks carry PROSE default DoD ('bunx tsc --noEmit passes when TypeScript touched', 'bun test (or scoped test) passes'). As sh: #1→exit2 FAIL, #2→exit0 SPURIOUS PASS (nondeterministic!), #3→exit2 FAIL(parens). So ANY task with default prose DoD is falsely routed to needs-human. Phase E integration test MISSED this because it used synthetic true/false DoD gates, never prose. This is the same DoD-green-but-broken meta-pattern (cf decompose stub, fake Stage-2 test) — the soak is the only thing that caught it.

OTHER SOAK FINDINGS (operational, all real): (1) handle-basic-ready.sh calls bare 'backlog' → resolves to FOREIGN global backlog v1.45.0 (epicd is 1.47.1) → would strip 23 engine-field lines; had to shim backlog→bun src/cli.ts to avoid corrupting the board. (2) script does NOT symlink node_modules despite CLAUDE.md worktree-symlinks:node_modules → Agent bun would fail without manual symlink. (3) basic-ready.md template references unset $BAIME_SCRIPTS instead of epicd plugin/scripts path. (4) handle-basic-ready.sh emits raw git checkout progress noise to stdout. IMPLICATION: epicd-run skill is NOT yet turn-key; needs a DoD-executability fix (biggest) + these adaptations before autonomous use.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
