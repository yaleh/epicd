---
id: BACK-699
title: Add .epicd as discoverable project directory and new-project default
assignee:
  - '@claude'
created_date: '2026-07-13 11:53'
updated_date: '2026-07-13 12:23'
labels:
  - config
  - cli
dependencies: []
priority: medium
ordinal: 112000
pipeline_id: execution
phase: done
dod:
  - text: bun test && bunx tsc --noEmit && bun run check .
    checked: false
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
新项目默认目录从可见 backlog/ 切换为隐藏 .epicd/，复用现有 backlog/ vs .backlog/ 的隐藏变体发现机制（不新增独立发现分支），已有仓库的 backlog/ / .backlog/ 探测行为保持不变。

背景讨论：本仓库历史上明确决定 backlog→epicd 改名只动品牌/命令名字符串，不动磁盘目录名（BACK-681、BACK-691 的 Non-Goals），理由是"会破坏所有现存仓库的磁盘布局"。但该理由只回答了"已存在仓库能不能改"，从未回答"全新项目该用什么默认值"——这是本任务要解决的缺口。

改动范围：
- src/constants/index.ts：新增 .epicd 隐藏目录名常量
- src/utils/backlog-directory.ts：resolveBuiltInBacklogDirectory 探测顺序追加 .epicd（优先级低于既有 backlog/、.backlog/，即已有仓库行为不变）
- src/cli.ts：epicd init 交互向导默认高亮选项改为 .epicd/，backlog/、.backlog/、自定义路径继续可选
- 根级指针配置文件名（backlog.config.yml）不新增对应变体：其用途是"目录不是默认名时的路径覆盖"，与品牌名无关，边缘场景不值得再造一条文件名分支

非目标：
- 不新增可见的 epicd/（非隐藏）目录名选项——只要隐藏形式
- 不提供面向外部已有 backlog/ 项目的自动迁移命令——假设外部新用户从零开始使用 epicd，直接拿到 .epicd/ 默认值即可
- 本仓库自身从 backlog/ 迁移到 .epicd/ 由后续任务（依赖本任务）处理，不在本任务范围
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 全新空目录运行 epicd init --defaults（未显式指定 --backlog-dir）后，生成的是 .epicd/config.yml 而非 backlog/config.yml
- [x] #2 已存在 backlog/config.yml 或 .backlog/config.yml 的目录运行现有命令，行为与改动前完全一致（回归测试覆盖 resolveBacklogDirectory 三种既有分支）
- [x] #3 resolveBuiltInBacklogDirectory 的探测顺序为 backlog/ -> .backlog/ -> .epicd/，验证：新增单测覆盖仅存在 .epicd/ 时被正确探测到
- [x] #4 epicd init 交互向导中 .epicd/ 为默认高亮选项，验证：cli.ts 相关测试或手工核查向导选项顺序
- [x] #5 bun test 全绿，bunx tsc --noEmit 通过
<!-- AC:END -->



## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: Add .epicd as discoverable project directory and new-project default

## Phase A: Discovery — .epicd/ as a third candidate directory
### Tests (write first)
- src/test/backlog-directory.test.ts — new cases:
  - "resolves .epicd/ when only .epicd/config.yml exists (no backlog/ or .backlog/)"
  - "prefers backlog/ config marker over .epicd/ when both exist"
  - "prefers .backlog/ config marker over .epicd/ when both exist"
  - "falls back to bare .epicd/ existence (no config marker) when nothing else is present"
### Implementation
- src/constants/index.ts: add `DEFAULT_DIRECTORIES.EPICD = ".epicd"` (hidden-only; no visible "epicd" counterpart per decision)
- src/utils/backlog-directory.ts:
  - extend `BacklogDirectorySource` union to include `".epicd"`
  - extend `resolveBuiltInBacklogDirectory` return type and body: probe `.epicd/` (config-marker check, then bare-existence check) after the existing backlog/.backlog checks, preserving priority order backlog > .backlog > .epicd at both the config-marker tier and the bare-existence tier
### DoD
- [ ] `bun test src/test/backlog-directory.test.ts`
- [ ] `bunx tsc --noEmit`

## Phase B: New-project default — epicd init defaults to .epicd/
### Tests (write first)
- src/test/cli-init.test.ts and/or src/test/enhanced-init.test.ts — new cases:
  - non-interactive `epicd init --defaults` in an empty directory creates `.epicd/config.yml` (not `backlog/config.yml`)
  - non-interactive `epicd init --defaults --backlog-dir backlog` still honors an explicit override
  - re-init of a project that already has `backlog/` (or `.backlog/`) keeps using that existing directory, unaffected by the new default
  - interactive wizard's directory-choice prompt offers `.epicd/` and it is the initial/highlighted value when no existing directory is found
### Implementation
- src/cli.ts (~line 754-816):
  - change the "nothing found yet" fallback: `defaultBacklogDirectory = backlogResolution.backlogDir ?? DEFAULT_DIRECTORIES.EPICD`, `defaultBacklogSource = backlogResolution.source ?? ".epicd"`
  - widen the `backlogDirectorySource` local type (line ~750) and the non-interactive `normalizedBacklogDirOption` branch (line ~780-783) to recognize `DEFAULT_DIRECTORIES.EPICD` as a first-class source (not "custom")
  - add a `.epicd/` option to the interactive `clack.select` directory-choice prompt (alongside existing `backlog/` and `.backlog/` options), keeping `backlog/`/`.backlog/`/custom-path fully selectable
### DoD
- [ ] `bun test src/test/cli-init.test.ts src/test/enhanced-init.test.ts`
- [ ] `bunx tsc --noEmit`

## Constraints
- No visible (non-hidden) `epicd/` directory option — only `.epicd/`.
- No auto-migration command for existing `backlog/` projects — out of scope (BACK-700 covers this repo's own migration separately).
- No new root-config filename variant (`backlog.config.yml` stays canonical for the path-override use case).
- Existing repos with `backlog/` or `.backlog/` must see zero behavior change — covered by regression cases in Phase A/B tests.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
authoring/refining review: APPROVED after 1 iteration(s). Plan verified against actual code (src/cli.ts:754-816, src/utils/backlog-directory.ts resolveBuiltInBacklogDirectory, src/constants/index.ts DEFAULT_DIRECTORIES) and existing test patterns (src/test/backlog-directory.test.ts, src/test/cli-init.test.ts, src/test/enhanced-init.test.ts). Goal coverage: AC#1-4 each map to a Phase DoD or Acceptance Gate item. TDD structure and phase ordering confirmed (Phase A discovery logic precedes Phase B init-flow consumer). No unresolved criteria.

claimed: 2026-07-13T12:02:57Z
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
