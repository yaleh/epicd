---
id: BACK-680
title: >-
  验证 epicd skill 跨项目可用性：在 fresh 项目中用 primitive-executor / fixpoint-convergence
  驱动真实任务到 Done
pipeline_id: authoring
phase: draft
assignee: []
created_date: '2026-07-07 08:41'
updated_date: '2026-07-07 09:05'
labels:
  - dx
  - plugin
  - verification
dependencies:
  - BACK-666
  - BACK-657
references:
  - plugin/skills/primitive-executor/SKILL.md
  - plugin/skills/fixpoint-convergence/SKILL.md
  - src/test/epicd-plugin-synthetic-repo.test.ts
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

## 目标

1. **端到端验证**：在一个与 epicd 源码仓库无关的 fresh 项目里，完整走通以下路径：
   - `npm i -g epicd`（或当前发布命令）全局安装引擎
   - `make install-user`（从 epicd 仓库）安装 plugin
   - `backlog init` 初始化项目（当前 bin 命令名为 `backlog`）
   - `/primitive-executor` 驱动一条 Ready 任务到 Done（含 DoD gate 通过 + engine complete）
   - `/fixpoint-convergence` 驱动一条功能实现任务到 FixpointResult: Reached

2. **发现并修复阻碍**：记录 fresh install 路径上的任何缺失步骤、命令不存在、skill 引用错误、config 假设不成立等问题，逐一修复或立 follow-up。

3. **固化为可重复验证的 AC**：将成功路径写成可执行的 shell 命令序列，作为回归门入库（或补入 BACK-666 / BACK-657 的集成验收）。

4. **CLI 名称核查**：确认对外发布的 CLI 命令名（当前 bin=`backlog`，包名=`epicd`）；在 skill 文档中凡提及安装/调用引擎的地方，统一使用正确名称，去除 `backlog.md` 的误导性表述。

## 非目标

- 不修改引擎核心机制
- 不重做 BACK-666 / BACK-657 的已有验证
- 不要求 CI 自动化（手动验证 + 文档化结果即可，若可自动化则加分）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 在一个 fresh 空目录（非 epicd 源码仓库）里，npm i -g epicd（包名）+ make install-user + backlog init（当前 bin 命令名）后，claude plugins list 显示 epicd@epicd enabled；若 bin 命令名需改为 epicd，作为 follow-up 立项
- [ ] #2 /primitive-executor 在该 fresh 项目里驱动一条手动创建的 Ready 任务（有 dodGates）到 Done，engine complete --worktree 成功合并，DoD gate 通过
- [ ] #3 /fixpoint-convergence 在该 fresh 项目里驱动一条功能实现任务到 FixpointResult: Reached（单叶路径，不需 Epic）
- [ ] #4 上述路径中发现的所有阻碍（命令不存在、skill 引用错误、config 假设不成立等）均已修复或立 follow-up task 追踪
- [ ] #5 skill 文档（至少 primitive-executor/SKILL.md、fixpoint-convergence/SKILL.md）中的引擎安装/调用命令已核查；包名统一为 epicd，bin 命令名与实际发布一致，去除 backlog.md 等误导性表述
- [ ] #6 成功路径记录为可执行的 shell 命令序列（写入 docs/ 或 skill 文档），可作为未来回归的参考基线
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
确认：npm 包名已是 epicd（npm i -g epicd），但 bin 命令仍为 backlog（package.json bin: {backlog: scripts/cli.cjs}）。存在命名分裂。bin 命令改名为 epicd 是一个独立决策，需评估对现有用户的影响，不在本 task 内强制要求，但应立 follow-up 追踪。

迁移说明：原 DRAFT-16，通过 BACK-663 数据迁移（2026-07-07）转为 BACK-680，保留全部内容。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
