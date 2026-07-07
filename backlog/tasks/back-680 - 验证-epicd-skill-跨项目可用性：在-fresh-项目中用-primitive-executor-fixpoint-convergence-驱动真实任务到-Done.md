---
id: BACK-680
title: >-
  验证 epicd skill 跨项目可用性：在 fresh 项目中用 primitive-executor / fixpoint-convergence
  驱动真实任务到 Done
status: Backlog
assignee: []
created_date: '2026-07-07 08:41'
updated_date: '2026-07-07 10:22'
labels:
  - dx
  - plugin
  - verification
  - release
dependencies:
  - BACK-666
  - BACK-657
references:
  - plugin/skills/primitive-executor/SKILL.md
  - plugin/skills/fixpoint-convergence/SKILL.md
  - src/test/epicd-plugin-synthetic-repo.test.ts
  - docs/cross-project-install.md
  - >-
    backlog/tasks/back-666 -
    Package-epicd-plugin-for-Claude-Code-installation-user-project-scope.md
  - >-
    backlog/tasks/back-657 -
    monitor-重构：前台顺序-loop-执行（取代-scan-loop-push-座席外包受限后台-Agent），解锁前台全工具-skill-调用.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-666 完成后 epicd plugin 已可通过 `make install-user` 全局安装，BACK-657 的执行 skill（primitive-executor、epic-decompose、epic-evaluate 等）也已登记在 plugin.json。但「在非 epicd 项目中实际驱动任务到 Done」这一端到端场景**从未被列为不动点、也从未被验证**。

现有覆盖的缺口：
- **D-7-bis 可移植性门**（epicd-plugin-synthetic-repo.test.ts）：只断言 plugin/ 全树无 baime 字面量，不验证实际可用性。
- **BACK-666 AC#9**：只验证 skill 在插件列表可见（且标为 unchecked/deferred）。
- **无任何测试或不动点**覆盖「fresh 项目 + epicd 安装 + skill invoke → 任务 Done」的路径。

另：CLI 工具的对外名称应统一为 **epicd**（而非 backlog / backlog.md），skill 文档中凡引用安装命令处需同步核查。

## 命名现状（已确认）

| 层面 | 当前状态 |
|---|---|
| npm 主包名 | `backlog.md@1.47.1`（`npm i -g epicd` 返回 404，尚未以 epicd 发布） |
| bin 命令名 | `backlog`（`package.json bin: {backlog: scripts/cli.cjs}`） |
| 平台二进制包名 | `backlog.md-linux-x64` 等（6 个，release.yml 硬编码） |
| `optionalDependencies` | 引用 `backlog.md-*` 名称 |
| `release.yml` 发布逻辑 | 下次 tag 触发时主包将以 `epicd` 名称发布（读 package.json name 字段），但平台包名需手动对齐 |

## 目标

1. **npm 发布**：触发新 tag，将主包以 `epicd` 名称发布到 npm；对齐 `release.yml` 中平台二进制包名与 `optionalDependencies`，使 `npm i -g epicd` 可在全新环境完整安装（含平台二进制）。

2. **端到端验证**：在与 epicd 源码仓库无关的 fresh 项目里，走通完整路径：
   - `npm i -g epicd` 全局安装引擎
   - `make install-user`（从 epicd 仓库）安装 plugin
   - `backlog init` 初始化项目
   - `/primitive-executor` 驱动一条 Ready 任务到 Done
   - `/fixpoint-convergence` 驱动一条功能实现任务到 FixpointResult: Reached

3. **发现并修复阻碍**：记录 fresh install 路径上的任何缺失步骤、命令不存在、skill 引用错误，逐一修复。

4. **固化为可重复验证的 AC**：成功路径已写入 `docs/cross-project-install.md`（BACK-680 第一轮产出），待 npm 发布后同步更新。

## 非目标

- **不在本任务内决定 bin 命令名是否从 `backlog` 改为 `epicd`**。bin 改名会破坏依赖 `backlog` 命令的脚本和 CI，影响面需单独评估立项。
- 不修改引擎核心机制
- 不重做 BACK-666 / BACK-657 的已有验证
- 不处理 Homebrew tap (`brew install backlog-md`) 的更名
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1-pre make install-user + backlog init + claude plugins list 验证路径已通过（已在第一轮执行中验证，`claude plugins list` 显示 `epicd@epicd enabled`）
- [ ] #1 `npm i -g epicd` 在全新环境可安装成功（`npm view epicd version` 非 404），且安装后 `backlog --version` 输出正确版本号
- [ ] #2 `npm i -g epicd` 后平台二进制可正确解析（`backlog` 调用预编译二进制，非纯 JS 回退）；验证：`backlog --version` 无报错，性能正常
- [ ] #3 /primitive-executor 在 fresh 项目里驱动一条手动创建的 Ready 任务（有 dodGates）到 Done，engine complete --worktree 成功合并，DoD gate 通过
- [ ] #4 /fixpoint-convergence 在 fresh 项目里驱动一条功能实现任务到 FixpointResult: Reached（单叶路径，不需 Epic）
- [x] #5 skill 文档（primitive-executor/SKILL.md 等共 7 个）中的引擎调用命令已从 `bun run cli` 统一为 `backlog`，去除 epicd 源码树专用命令
- [x] #6 成功路径记录为可执行的 shell 命令序列（`docs/cross-project-install.md`），待 AC#1 通过后同步更新安装命令
- [ ] #7 `release.yml` 的 `publish-binaries` job 中平台包名（及 `package.json` 的 `optionalDependencies`）已与主包名策略对齐，可在下次 tag 时无人工干预地完成发布
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**命名分裂根因**：`package.json name` 已是 `epicd`（BACK-600.1），但 `release.yml` 的平台包名（`backlog.md-linux-x64` 等）和 `optionalDependencies` 是硬编码旧名称，未随主包名一起更新。下次 tag 触发时主包会以 `epicd` 发布，但平台包仍会以 `backlog.md-*` 发布——两者名称不一致，`npm i -g epicd` 安装时 optionalDependencies 解析可能静默失败（找到旧名 `backlog.md-*` 平台包）或成功（取决于 npm 是否将旧包匹配为新包的 optional dep）。

**最简发布路径**：若保持平台包名不变（仍为 `backlog.md-*`），`optionalDependencies` 继续引用旧名称，旧包已在 registry 上可解析，则 AC#2 大概率可通过——但需在真实环境验证。此路径改动最小：只需触发新 tag。

**bin 命令名决策**：`backlog` → `epicd` 改名影响面较大，不在本任务范围；`dist/package.json` 中 `.bin = {backlog: "cli.js"}` 在 release.yml 里硬编码，改名需同步修改。

第一轮执行（2026-07-07）产出：
- 7 个 skill doc 的 `bun run cli` → `backlog` 修复已 commit（c715efc9）
- `docs/cross-project-install.md` 已创建（当前记录 `npm i -g backlog.md` 为过渡安装命令）
- AC#5/#6 已标记完成；AC#1/#2/#7 待 npm 发布后验证；AC#3/#4 为 non-mechanical one-time-proof

audit skipped（第一轮）: RiskGated(False) — 第一轮变更为 skill doc 文本编辑和 docs 新增，无 src/ 触及，无引擎/安全表面。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
