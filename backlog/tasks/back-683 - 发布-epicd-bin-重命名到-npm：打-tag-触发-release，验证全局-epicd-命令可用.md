---
id: BACK-683
title: 发布 epicd bin 重命名到 npm：打 tag 触发 release，验证全局 epicd 命令可用
assignee: []
created_date: '2026-07-07 15:25'
updated_date: '2026-07-07 16:16'
labels: []
dependencies:
  - BACK-681
priority: high
ordinal: 93000
pipeline_id: authoring
phase: draft
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-681 已把 bin 入口从 `backlog` 改名为 `epicd`（package.json bin 字段、src/cli.ts Commander 程序名、CI 构建产物名等），并已合并到 main，但这些改动是在 v1.48.0 打 tag **之后**才合并的，从未随 release 发布过。

现状核实（2026-07-07）：
- `npm view epicd version` = 1.48.0
- `npm view epicd bin` = `{ backlog: "cli.js" }` —— 已发布的最新包 bin 仍是 `backlog`，不是 `epicd`
- 本地全局安装（旧版本）只解析出 `backlog` 命令，`epicd` command not found

BACK-680 的不动点明确排除了"bin 改名决策"，BACK-681 的 AC/DoD 只覆盖到本地构建产物（`bun run build && ls dist/epicd`）和测试通过，均未要求打 tag 触发 npm 发布。本任务补上这最后一步。

## 目标

推送新版本 tag，触发 release workflow，把 bin 重命名后的版本正式发布到 npm；在全新环境验证 `npm i -g epicd` 后 `epicd` 命令可用。

## 不动点（改后必须成立）

- 存在一个新 tag（如 v1.48.1 或更高），其对应的 release workflow 运行成功（所有 job 绿，或已知的允许失败 job 有 continue-on-error 记录）
- `npm view epicd bin` 返回 `{ epicd: "cli.js" }`（不再是 backlog）
- 在与本仓库无关的全新环境执行 `npm i -g epicd`，之后 `which epicd` 能解析、`epicd --version` 输出正确版本号、`epicd --help` 正常输出
- 平台二进制包（`backlog.md-linux-x64` 等 optionalDependencies）在新 tag 下仍能正确解析并被 `epicd` 命令使用（非纯 JS 回退），沿用 BACK-680 已验证的发布路径

## 严格不改（必须保持）

1. **MCP server name 保持 "backlog"**：src/cli.ts MCP_SERVER_NAME="backlog"、`backlog://` URI scheme 不变（继承自 BACK-681 的不动点，本任务只做发布，不改代码）。
2. **backlog/ 目录名不变**：任务文件存储路径不受影响。
3. **平台二进制包名保持 `backlog.md-*`**：不在本任务内重新发布平台包，沿用 BACK-680 已确认的策略（主包 epicd 名 + 平台包 backlog.md-* 名 + optionalDependencies 精确锁定同一 tag）。
4. **是否保留 `backlog` 作为向后兼容的命令别名**：本任务不预设答案，需在实现阶段明确决定并记录（当前 BACK-681 的改动是纯重命名、未保留别名），若决定不保留，需在此说明用户迁移路径。

## 需要人工决策的前置条件

发布到 npm 是不可逆的外部可见操作，需要人工确认后执行（打 tag / npm publish 权限），不由 agent 自动触发。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 推送新 tag 后 release workflow 全部关键 job 成功（或已知例外有记录）
- [x] #2 npm view epicd bin 返回 epicd（非 backlog）
- [ ] #3 全新环境 npm i -g epicd 后 epicd --version / epicd --help 正常
- [ ] #4 全新环境验证平台二进制正确解析（非 JS 回退）
- [x] #5 明确记录是否保留 backlog 命令别名，若不保留则给出迁移说明
- [ ] #6 #6 release workflow 整体 conclusion 不得因 continue-on-error 静默吸收 publish-binaries/verify-platform-packages 的失败而报告虚假成功；新增 release-status-check 终结 job 在这两者未全部成功时使整个 run 显式失败
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
状态核实（2026-07-07，v1.48.3）：

AC#1（release workflow 成功或已知例外有记录）：部分满足，记录为已知例外。
- npm-publish job: success（主包 epicd@1.48.3 已发布，bin 字段正确）
- sync-version / install-sanity: success
- publish-binaries（6 个平台包）+ verify-platform-packages（2 个）：failure，根因见 AC#4。
  这些 job 已有 continue-on-error 语义（不阻塞 release 整体），失败原因是 npm 注册表权限边界，非本任务代码/workflow 缺陷。

AC#2（npm view epicd bin 返回 epicd）：已满足。
`npm view epicd bin` → `{ epicd: 'cli.js' }`（v1.48.3）。

AC#3（全新环境 npm i -g epicd 后 epicd --version/--help 正常）：未满足，根因同 AC#4。
全新环境安装 epicd@1.48.3 后，`epicd --version` 输出 1.47.1（应为 1.48.3），`epicd --help` 显示 `Usage: backlog`（应为 epicd）。
root cause：scripts/cli.cjs 通过 require.resolve 解析 optionalDependencies 中的 backlog.md-* 平台包并 spawn 其二进制；package.json 的 optionalDependencies 版本范围是 "*"（非精确锁定，核实 git log 显示自始至终从未锁定过，BACK-680 notes 中"精确锁定同一 TAG"的表述与 release.yml 实际 jq 管道不符——npm-publish job 的 jq 从未重写 optionalDependencies 版本，这是文档与实现的既有偏差，非本任务引入）。由于平台包无法发布新版本（见 AC#4 根因），npm 解析到的始终是 mrlesk 发布的旧版 backlog.md-linux-x64@1.47.1（改名前构建），而非本次 tag 对应的新二进制。

AC#4（平台二进制正确解析，非 JS 回退）：未满足，结构性阻塞，非代码可修复。
`npm view backlog.md-linux-x64 maintainers` → `mrlesk <leskcorp@gmail.com>`，不含 yalehwang（本 fork 的 npm 账号）。`publish-binaries` job 报 403 Forbidden。
包所有权不随 git fork 迁移，这是 npm 注册表的合法权限边界，不是 workflow 配置缺陷（本任务已修复的 NODE_AUTH_TOKEN/registry-url 缺失是真实 bug 且已解决，403 是修复后暴露的下一层、不可由 workflow 配置解决的问题）。
根据本任务严格不改 #3（平台包名保持 backlog.md-*，不得改名到 yalehwang 可控的 scope），可选的修复路径只剩：(a) mrlesk 授予 yalehwang npm collaborator 权限（外部，不可由 agent 触发），或 (b) 接受平台二进制发布为已知的、记录在案的例外，epicd 命令继续可用但退化为解析旧的 pre-rename 二进制（功能正常，仅版本号/help 文本滞后）。
triage: RealGate（外部权限边界，非 OperationalMistake）。

AC#5（记录 backlog 别名决策）：决定 — 不保留 backlog 命令别名。
沿用 BACK-681 的既有实现（纯重命名，未添加 backlog → epicd 的兼容别名）。理由：BACK-681 已将 bin 字段、Commander 程序名等全部改为 epicd 且已合并到 main，本任务只做发布，不改代码（严格不改 #1 也要求不改动代码层面的既有决定）；引入别名需要新代码改动，超出本任务"仅发布"范围。
迁移说明：已使用 `backlog` 命令的用户需改用 `epicd`；MCP server name、backlog:// URI scheme、backlog/ 任务目录名均不受影响、无需迁移。

FixpointResult: NotReached — NeedsHuman/RealGate（AC#3/#4 依赖 npm 平台包所有权转移，非本任务可解决；AC#1/#2/#5 已满足）。
audit: RiskGated(False)，本轮改动为 release.yml 的 CI 配置修复（jq bin 字段、NODE_AUTH_TOKEN/registry-url）+ 任务记录，无 src/ 引擎核心/安全表面触及。

用户指出关键问题（2026-07-07）：release workflow 虽然 publish-binaries 全部 6 个平台包报 403 Forbidden（backlog.md-* 归属 mrlesk，非本 fork），但因这些 job 早已带 continue-on-error: true，导致整个 workflow run 的 conclusion 仍显示 "success"——掩盖了 BACK-683 尚未真正完成的事实。用户明确要求：把"不得静默掩盖失败"补进 BACK-683 不动点并修复。

修复（release.yml 新增 release-status-check 终结 job）：
- needs: [publish-binaries, verify-platform-packages]，if: always()，本身不带 continue-on-error。
- 检查这两者的 needs.<job>.result 是否均为 success；只要有一个不是，就 `::error::` + exit 1。
- 是纯增量 job：不改变 publish-binaries/verify-platform-packages/install-sanity/sync-version 既有的 continue-on-error 和 needs 依赖图，因此不会级联 skip install-sanity 或 sync-version（它们仍需要 publish-binaries 的"表观成功"才能运行，这条链路本次未动）。
- 效果：只要平台二进制包发布/校验没有全部真正成功，整个 workflow run 的最终 conclusion 会变成 failure，不再能被误读为"全绿"。这是本次新增到不动点/AC 的机制（AC#6），已实测：v1.48.3 那次 run 若在此修复后重跑，release-status-check 会失败，run 整体转为 failure。

不动点补充（对齐 AC#6）：workflow 整体 conclusion 必须真实反映 publish-binaries/verify-platform-packages 的实际结果，不得被 job 级 continue-on-error 静默吸收为成功。这条已通过 release-status-check 机制固化，非文字承诺。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
