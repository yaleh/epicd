---
id: BACK-605.9
title: >-
  阶段1：propose/promote/inbox/run/init skill 集 + 插件打包（epicd: 命名空间）+ 合成空 repo
  可移植性验证
status: 'Basic: Needs Human'
assignee:
  - '@claude'
created_date: '2026-07-05 11:14'
updated_date: '2026-07-05 11:58'
labels:
  - 'kind:feature'
  - 'epicd:E5'
dependencies: []
parent_task_id: BACK-605
ordinal: 58000
phase: needs-human
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
605 自己的骨架 plan 把 child4（操作 skill 集）与 child5（插件打包+可移植性+M2a）列为独立未启动子任务。研究文档 docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §7 的结论：验证'可外化重用'的最便宜方式是**合成空 repo 测试**，不是仓促切换真实 baime（那是 M2a，涉及双活 driver 共存，风险与工程量都不同级，见本 epic 独立子任务）。本任务只做**合成验证（M1）**部分：打包 + 空 repo 装插件跑通，不触碰 baime 的活 driver。

## 做什么
1. **收敛 5 个操作 skill**（AC#1）：propose（收敛 *-to-draft，包引擎既有 create/promote 路径）· promote（包 engine promote）· inbox（包 gate-event-store 的 queryGateEvents 只读查询——**与阶段2 CLI 读接口共用同一实现**）· run（现有 epicd-run 收敛进来）· init（backlog init 薄包装，确认默认值不含 epicd 专属假设）。全部改调引擎 API，不再走 backlog task + sed/grep（AC#2）。
2. **打包为 Claude Code 插件**（AC#3）：写 .claude-plugin/plugin.json + marketplace.json，命名空间 epicd:；参照 /home/yale/work/baime 的 marketplace.json 形状；接入 bun run build 产出可分发插件包。
3. **合成空 repo 验收**（AC#4 的 M1 部分）：在 scratch 目录建全新空 repo（不装 baime 插件），只装打包好的 epicd 插件，backlog init → 建一个任务 → promote → 引擎自治驱动至 Done，记录证据（零 baime 引用、零 epicd 仓库特定硬编码路径）。
4. **耦合复核**：确认 task_prefix/project_name 等确实全由 config.yml 派生（不新增修复项，只需在 plan 里列出复核清单并跑通合成验收作为证据）。

## 非目标
- 不做真实 baime 迁移/驱动器切换（M2a）——归属本 epic 的另一独立子任务，需先设计跨进程 driver 共存机制。
- 不新增方法论 skill（iteration-executor/knowledge-extractor 等留 baime，D-7-bis）。

参考：ADR-011 D-7-bis · 605 Epic Plan child4/child5 · docs/research/2026-07-05-fixpoint-driven-development-constraint-set.md §7。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 propose/promote/inbox/run/init 五个操作 skill 存在，全部只调引擎 API（无 backlog task shell-out / sed / grep）
- [ ] #2 存在 .claude-plugin/plugin.json + marketplace.json，命名空间 epicd:，随 epicd repo 可构建产出
- [ ] #3 合成空 repo 验证通过：全新 scratch repo 装插件、backlog init、建任务、promote、引擎自治驱动至 Done，证据记录（无 baime 引用、无 epicd 仓库路径硬编码）
- [ ] #4 inbox skill 与阶段2 CLI 读命令共用同一 queryGateEvents 包装实现（不重复实现两遍）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claimed: 2026-07-05T11:27:38Z

Implemented M1 (BACK-605.9) in worktree task/BACK-605.9:

Skills (plugin/skills/{propose,promote,inbox,run,init}/SKILL.md): all 5 call only engine-CLI commands (task create / engine promote / engine gate-log / Monitor+scan-loop.cjs via ${CLAUDE_PLUGIN_ROOT} / backlog init) — no shell-out to sed/awk/grep patchwork of legacy paths.

Shared inbox wrapper (src/engine/gate-log.ts, new `engine gate-log` CLI command in src/cli.ts): single reusable queryGateEvents wrapper; inbox skill and future BACK-605.10 CLI/Web surfaces must reuse this same module (not reimplement).

Portability fixes for run skill's worker chain: plugin/scripts/scan-loop.cjs (new engineCliCommand(repoRoot) helper) and plugin/scripts/handle-basic-ready.sh (new CLI_CMD resolution) both now resolve their CLI invocation via EPICD_ENGINE_CMD/EPICD_CLI_CMD env override -> dev-tree detection -> backlog fallback, instead of a hardcoded `bun src/cli.ts` path — required so the plugin works when shipped standalone with no epicd source tree present.

Packaging: .claude-plugin/marketplace.json + plugin/.claude-plugin/plugin.json (namespace "epicd"), scripts/package-plugin.sh (tars .claude-plugin + plugin into dist/epicd-plugin.tar.gz), wired into package.json's `build` script.

Synthetic empty-repo verification: src/test/epicd-plugin-synthetic-repo.test.ts — builds dist/backlog, creates a brand-new git repo under os.tmpdir(), copies in ONLY plugin/ + .claude-plugin/ + the built binary (no src/ tree), runs init -> task create (propose) -> engine promote -> handle-basic-ready.sh (claim+worktree) -> simulated agent commit -> engine complete --worktree (drives phase to done) -> engine gate-log (inbox), then asserts no file under the scratch repo contains "baime" (any case) or this checkout's own absolute repo path. Result: 1 pass, 52 expect() calls.

Coupling review: confirmed via the synthetic test itself that task_prefix/project_name/statuses all come from the scratch repo's own backlog/config.yml (written fresh by `backlog init` in the scratch dir, then the Basic:/Epic: status vocabulary was appended to that same file) — nothing epicd-repo-specific is hardcoded in the shipped skills/scripts.

Self-check in worktree: bunx tsc --noEmit clean; bun run check . exit 0 (11 pre-existing warnings, unrelated files, unchanged by this task); bun test --parallel: 1842 pass, 2 skip, 0 fail (5831 expect calls) across 232 files — includes fixing two pre-existing wiring tests (epicd-run-wiring.test.ts, handle-basic-ready-wiring.test.ts) whose literal-source-text assertions were tied to the old hardcoded invocation strings I had to change for portability.

Out of scope (not fixed, flagged only): none newly discovered beyond what's already tracked (real baime migration is BACK-605.10-adjacent M2a, explicitly out of scope here).

Commits are in this worktree (task/BACK-605.9 branch), not pushed/merged — main session will run `engine complete --worktree` to independently re-run the DoD gate and merge.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
