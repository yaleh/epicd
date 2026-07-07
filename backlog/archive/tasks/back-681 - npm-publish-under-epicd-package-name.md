---
id: BACK-681
title: 将 epicd 发布到 npm 并完成包名/bin 命名统一
status: Draft
assignee: []
created_date: '2026-07-07 10:16'
updated_date: '2026-07-07 10:22'
labels:
  - dx
  - release
dependencies:
  - BACK-600.1
priority: medium
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-600.1 将 `package.json` 的 `name` 字段从 `backlog.md` 改为 `epicd`，但此后未触发新的 npm 发布。结果：

- npm registry 上只有 `backlog.md@1.47.1`，`epicd` 包名返回 404。
- README 和 `docs/cross-project-install.md` 写明 `npm i -g epicd`，但该命令实际失败。
- 用户唯一可用的全局安装路径是 `npm i -g backlog.md`，与对外宣传的包名不一致。

BACK-680 验证跨项目可用性时发现此问题。

## 现状

| 层面 | 现状 | 期望 |
|---|---|---|
| npm 主包名 | `backlog.md@1.47.1` | `epicd@<version>` |
| bin 命令名 | `backlog`（`package.json bin: {backlog: ...}`） | 待决策（见非目标） |
| 平台二进制包名 | `backlog.md-linux-x64` 等（6 个） | `epicd-linux-x64` 等（若主包改名则需联动） |
| `optionalDependencies` | 引用 `backlog.md-*` 名称 | 需与平台包名同步 |
| `dist/package.json`（release.yml 生成） | `.bin = {backlog: "cli.js"}`（硬编码） | 跟随决策同步 |
| README / docs | `npm i -g epicd`（已写入但 404） | 与实际 registry 状态一致 |

## 根因

`release.yml` 的"Create npm-ready package.json"步骤用 `jq` 从 `package.json` 读取 `name` 字段，不覆盖 `name`，因此下一次 `git tag v*` 触发发布时，主包会以 `epicd` 名称发布。但平台二进制包（`backlog.md-linux-x64` 等）在 `release.yml` 的 `publish-binaries` job 里是**硬编码**的，且 `package.json` 的 `optionalDependencies` 也硬编码引用旧名称——不会自动跟随主包改名。

## 不动点

以下约束在实现前后均须成立：

1. `npm i -g epicd` 可以全局安装引擎，且安装后 `backlog --version` 输出正确版本号。
2. `docs/cross-project-install.md` 中的安装命令与 npm registry 实际状态一致，无 404 路径。
3. 平台二进制包（`backlog.md-linux-x64` 等）可被主包正确解析（`optionalDependencies` 与平台包名一致）。
4. `release.yml` 在触发新 tag 时可无人工干预地完成发布。
5. 不破坏已全局安装 `backlog.md` 的用户的升级路径（此项为"尽力而为"，npm 本身不提供包名迁移机制）。

## 非目标

- **不在本任务内决定 bin 命令名是否从 `backlog` 改为 `epicd`**。bin 改名会破坏所有依赖 `backlog` 命令的脚本和 CI，影响面不在本任务范围，如需改名应单独立项评估。
- 不修改引擎核心机制。
- 不处理 Homebrew tap (`brew install backlog-md`) 的更名，Homebrew 需单独 PR。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `npm view epicd version` 返回最新版本号（非 404），且 `npm i -g epicd` 可在全新环境安装成功
- [ ] #2 安装后执行 `backlog --version` 输出正确版本号（bin 命令名保持 `backlog`）
- [ ] #3 平台二进制包可被正确解析：`npm i -g epicd` 后 `backlog` 实际调用的是对应平台的预编译二进制（非纯 JS 回退）；验证方式：`which backlog` 指向 npm 全局 bin，`backlog --version` 无报错
- [ ] #4 `release.yml` 的 `publish-binaries` job 中平台包名（及 `package.json` 的 `optionalDependencies`）已与主包名策略对齐，可在下次 tag 时无人工干预地发布
- [ ] #5 `docs/cross-project-install.md` 和 README 中的安装命令更新为与 registry 实际状态一致的命令（无 404 路径）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**发布顺序约束**：平台二进制包（`backlog.md-linux-x64` 等）必须先于或同步于主包发布，否则 `npm i -g epicd` 安装时 `optionalDependencies` 解析会失败（找不到对应的平台包）。

**过渡期方案**：若决定将平台包也改名为 `epicd-linux-x64` 等，需在改名后至少保留 `backlog.md-*` 旧包名一个发布周期，供已安装 `backlog.md` 的用户升级。若不改平台包名，则主包的 `optionalDependencies` 继续引用 `backlog.md-*`，无需改名。

**最简路径**：不改平台包名，只触发新 tag → 主包以 `epicd` 发布，`optionalDependencies` 继续引用 `backlog.md-*`（仍可解析，因平台包已在 registry 上）。此路径改动最小，AC#1-#3 可全部满足。

BACK-680 发现此问题，`docs/cross-project-install.md` 已注明当前用 `npm i -g backlog.md` 作为过渡安装命令。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
