---
id: BACK-703
title: 同步 plugin manifest 版本号到 package.json，修复 claude plugin update 静默 no-op
assignee:
  - '@claude'
created_date: '2026-07-13 15:28'
updated_date: '2026-07-13 15:56'
labels: []
dependencies: []
ordinal: 116000
pipeline_id: execution
phase: done
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun test --parallel
    checked: false
  - text: >-
      v=$(node -p "require(\"./package.json\").version"); grep -q "\"version\":
      \"$v\"" plugin/.claude-plugin/plugin.json && grep -q "\"version\": \"$v\""
      .claude-plugin/marketplace.json
    checked: false
  - text: grep -q "claude plugin update epicd@epicd" DEVELOPMENT.md
    checked: false
  - text: >-
      grep -qE "sync-version" .github/workflows/release.yml && grep -A30
      "sync-version:" .github/workflows/release.yml | grep -q
      "plugin/.claude-plugin/plugin.json" && grep -A30 "sync-version:"
      .github/workflows/release.yml | grep -q ".claude-plugin/marketplace.json"
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
epicd 的 Claude Code plugin manifest（plugin/.claude-plugin/plugin.json 和 .claude-plugin/marketplace.json）的 version 字段写死为 1.0.0，从未随发布递增。claude plugin update/marketplace update 按版本号短路判断已是最新，导致对 directory-source 插件的实际内容更新（如 BACK-700/BACK-701 的脚本变更）静默不生效——历史上多次 npm install -g epicd 都没有配套刷新插件缓存，唯一一次刷新是手工 uninstall+install 绕过验证的。修复：让 scripts/package-plugin.sh 在打包时把两个 manifest 的 version 同步写为 package.json 的当前版本，使 claude plugin update 能检测到真实差异；同时在 README 或发布相关文档中加一句提示：全局 npm 安装/升级 epicd 后，如果本机也装了 epicd Claude Code plugin，需要额外运行 claude plugin update epicd@epicd（或必要时 uninstall+install）来同步。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 scripts/package-plugin.sh 在打包时把 plugin/.claude-plugin/plugin.json 和 .claude-plugin/marketplace.json 的 version 字段写为当前 package.json 版本号；验证：bun run build 后 grep version 两个文件应等于 package.json 的 version
- [ ] #2 对同一份 directory-source 插件，先安装旧版本再打包出新版本号后，claude plugin update epicd@epicd 能检测到版本差异并触发刷新（而不是报 already at the latest version）
- [ ] #3 README 或发布文档中新增一句提示：npm 全局安装/升级 epicd 后，若本机同时安装了 epicd 的 Claude Code plugin，需额外运行 claude plugin update epicd@epicd 同步插件缓存；验证：grep 相应文件包含该提示文本
- [ ] #4 现有测试套件（bun test --parallel）全部通过，未引入回归
- [ ] #5 release.yml 的 sync-version job 在同一次 commit 里，除 package.json 外，也把 plugin/.claude-plugin/plugin.json 与 .claude-plugin/marketplace.json 的 version 字段同步为 tag 版本号（沿用现有 jq + git-auto-commit-action 提交路径，不新增 bun run build/package-plugin.sh 调用）；验证：grep release.yml 的 sync-version job 同时包含对两个 manifest 路径的 jq 写入，且 git-auto-commit-action 的 file_pattern 包含这两个路径
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC #2（claude plugin update 是否真的检测到差异并刷新）依赖本机 ~/.claude/plugins 的真实安装状态和外部 claude CLI 行为，无法在 bun test/CI 中机械复现——按 fixpoint-convergence Stage 1(b) 显式标注为非机械验证项：由实现者在本机手工跑一次 uninstall+install 前后对比（或版本号变化前后跑 claude plugin update）确认，并将结果记入 notes/final-summary，而非交给自动化 DoD gate。AC #1/#3/#4 均已改写为 DoD gate 里的机械命令。

claimed: 2026-07-13T15:31:37Z

用户决策(2026-07-13)：采用方案1——扩展现有 release.yml 的 sync-version job（已用 jq 改 package.json 版本号并用 git-auto-commit-action 提交回 main），在同一 job/同一次 commit 里顺带把两个 plugin manifest 的 version 也同步，不新增 bun run build/package-plugin.sh 在 CI 里的调用（CI 不需要真的打包 tar，只需要同步版本号字段）。已加 AC #5 + DoD gate #5 覆盖这部分，任务从 needs-human 退回 implementing 继续同一任务，不开新任务。

claimed: 2026-07-13T15:45:48Z

release.yml sync-version job extended per user's option-1 decision: jq now also writes tag version into plugin/.claude-plugin/plugin.json and .claude-plugin/marketplace.json; git-auto-commit-action file_pattern now covers all three paths in one commit. No bun run build/package-plugin.sh invoked in CI, as decided. DoD gate #5 grep verified passing. Gates #1/#2/#4 re-verified passing (tsc clean, 2113 tests pass 0 fail, DEVELOPMENT.md note present). Gate #3 verified to pass when bun run build is run (regenerates manifests via package-plugin.sh); those generated files were reverted from the working tree before commit to keep this increment's diff scoped to release.yml only. Committed as e238ddb6 on task/BACK-703 in worktree epicd-BACK-703.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
