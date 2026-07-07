---
id: BACK-683
title: 发布 epicd bin 重命名到 npm：打 tag 触发 release，验证全局 epicd 命令可用
assignee: []
created_date: '2026-07-07 15:25'
updated_date: '2026-07-07 16:52'
labels: []
dependencies:
  - BACK-681
priority: high
ordinal: 93000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-681 已把 bin 入口从 `backlog` 改名为 `epicd`（package.json bin、src/cli.ts Commander 程序名）并合并 main，但项目对外发布物仍是半改名状态，导致 `npm i -g epicd` 无法得到可用的 `epicd` 命令：

- **平台二进制包仍叫 `backlog.md-{platform}-{arch}`**，而这些包在 npm 上归属上游维护者 mrlesk（leskcorp@gmail.com）。本项目 fork 的 npm 账号 yalehwang **无发布权限** → release workflow 的 `publish-binaries` 6 个 job 全部 `403 Forbidden`。
- `optionalDependencies` 引用 `backlog.md-*`、版本范围 `"*"`，因此全新环境 `npm i -g epicd` 解析到 mrlesk 早先发布的旧版 `backlog.md-linux-x64@1.47.1`（改名前的二进制），`epicd --version` 显示 `1.47.1`、`epicd --help` 首行是 `Usage: backlog`。
- release workflow 因上述 job 带 `continue-on-error`，整体 conclusion 报告**虚假 success**，掩盖了发布从未真正完成。

## 目标

**坚决把本项目的对外发布物从 `backlog.md` / `backlog` 完整改名为 `epicd`，发布到本项目自己的 GitHub（yaleh/epicd）与 npm（yalehwang 账号）**，使全新环境 `npm i -g epicd` 得到完全可用的 `epicd` 命令：正确版本号、`Usage: epicd`、解析本项目自己发布的原生平台二进制。

## 改动范围（scope of change）

- **平台二进制包名**：`backlog.md-{platform}-{arch}` → `epicd` 账号可发布的名字（`epicd-{platform}-{arch}` 或 `@yalehwang/epicd-*`）。同步修改：`release.yml` 构建/发布矩阵、`package.json` optionalDependencies、`scripts/resolveBinary.cjs`（`getPackageName`）、`scripts/cli.cjs`（过滤旧路径的正则）。
- **optionalDependencies 版本**：`"*"` → 精确锁定本次 tag 版本，消除解析到旧包的可能。release.yml 的 npm-publish job 需在生成 dist/package.json 时重写 optionalDependencies 版本为当前 TAG。
- **release-status-check 终结门**（已加）：`publish-binaries` / `verify-platform-packages` 未全绿时使整个 run 显式 failure，不再被 continue-on-error 掩盖。
- **本任务暂不改、且不作为承诺**：MCP server name（"backlog"）、`backlog://` URI scheme、`backlog/` 任务目录名、编译产物内部文件名（`pkg/backlog`）。这些是运行时/数据面标识，改名有迁移成本，若需一并改名另立任务——本任务不为它们做"保持不变"的承诺，也不阻止后续改。

## 不动点（convergence target，ADR-019）

机械可检的终态，release run 全绿即达成；每次 tag 后"未满足项数"单调下降至 0：

- `npm view epicd bin` === `{ epicd: "cli.js" }`
- 对 6 个平台 P：`npm view <epicd 平台包名-P> maintainers` 含 `yalehwang`，且 `version` === 本次 tag（无 403，包由本项目账号发布）
- `package.json` optionalDependencies 全部指向 epicd 平台包名，且版本精确 === 本次 tag
- 全新环境 `npm i -g epicd` 后：`which epicd` 可解析；`epicd --version` === 本次 tag（非 1.47.1）；`epicd --help` 首行 === `Usage: epicd`（非 backlog）；`require.resolve` 命中本项目 epicd 平台包的原生二进制（非旧包、非报错/JS 回退）
- release workflow 整体 conclusion === `success`（release-status-check 绿 ⇔ publish-binaries + verify-platform-packages 全绿），不再被 job 级 continue-on-error 掩盖为虚假成功

## 需要人工决策的前置条件

发布到 npm / 打 tag 是不可逆的外部可见操作，需人工确认后执行，不由 agent 自动触发。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 6 个平台二进制包以 epicd 账号可发布的名字（epicd-{platform}-{arch} 或 @yalehwang/epicd-*）发布成功：npm view <pkg> version === 本次 tag 且 maintainers 含 yalehwang，无 403
- [x] #2 npm view epicd bin === { epicd: "cli.js" }
- [x] #3 package.json optionalDependencies 指向 epicd 平台包名，且版本精确锁定本次 tag（非 "*"）
- [x] #4 全新环境 npm i -g epicd 后：epicd --version === 本次 tag（非 1.47.1）、epicd --help 首行 Usage: epicd（非 backlog）、require.resolve 命中本项目 epicd 原生平台二进制（非旧包/JS 回退）
- [x] #5 release workflow 整体 conclusion === success：release-status-check 生效，publish-binaries + verify-platform-packages 全绿，continue-on-error 不再掩盖平台包失败
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 纠偏记录（2026-07-07）

**此前的错误**：把「不动点」误当成"严格不改的文件清单"（与 BACK-660 同类错误），并写了 `严格不改（必须保持）` 段落，其中 #3「平台包名保持 backlog.md-*」恰恰锁死了发布阻塞的根因——`backlog.md-*` 包归属上游 mrlesk，本项目账号 yalehwang 永远无法发布，故 publish-binaries 恒 403，release 却因 continue-on-error 报虚假 success。

**纠正**：删除 `严格不改` 段落；不动点改写为 ADR-019 收敛目标（机械可检终态）；目标明确为「对外发布物完整改名 backlog.md/backlog → epicd，发布到本项目自己的 GitHub + npm」。平台包必须一并改名到 epicd 账号可控的名字，才能真正发布可用二进制。

## 已完成
- release.yml 新增 release-status-check 终结门（无 continue-on-error）：publish-binaries/verify-platform-packages 未全绿则整个 run failure（AC#5 机制），已随 v1.48.4 tag 推送验证。
- 主包 epicd bin 字段已正确（AC#2，npm-publish job 的 jq 生成 .bin={epicd:"cli.js"}）。
- publish-binaries job 已补 NODE_AUTH_TOKEN + registry-url（此前 ENEEDAUTH 已修）。

## 待实现（下一轮，改名平台包）
- release.yml build/publish 矩阵、package.json optionalDependencies、scripts/resolveBinary.cjs (getPackageName)、scripts/cli.cjs 过滤正则：backlog.md-* → epicd-*（或 @yalehwang/epicd-*）
- npm-publish job 生成 dist/package.json 时重写 optionalDependencies 版本为精确 TAG
- 打新 tag 触发 release，验证 6 平台包发布成功（无 403）+ 全新环境 epicd --version/--help/原生二进制解析

## FixpointResult: NotReached
剩余 gap：AC#1/#3/#4 待平台包改名实现；AC#2/#5 已满足。这是可由本项目自主完成的工程改动（不再是外部权限门）。

## 补充发现（2026-07-07）：release-status-check 方案无效，改用移除 continue-on-error

v1.48.4 实测：新增的 release-status-check job 报 success，未拦截。根因是 GitHub Actions 语义陷阱——**job 级 continue-on-error: true 会让 needs.<job>.result 在该 job 失败时仍返回 "success"**。故任何依赖 needs.result 判定的下游门都读到被掩盖的 success，无法生效。

正确修法（更简单）：本任务把平台包改名到 yalehwang 账号后，publish-binaries / verify-platform-packages 本就应当成功，因此直接**移除这两个 job 的 continue-on-error: true**，让 workflow 在它们失败时自然、诚实地整体 failure，无需单独的 status-check job（该 job 应删除）。副作用：install-sanity（needs publish-binaries）在平台包发布失败时会被 skip——可接受，因为平台包没发出去时 install-sanity 本就无意义。

AC#5 据此修订判定：以「移除 continue-on-error 后 workflow 整体 conclusion 真实反映平台包结果」为准，而非 release-status-check job。

## 实现完成（2026-07-07，commit b7516685）
release.yml + package.json + scripts/{resolveBinary,cli,postuninstall}.cjs + resolveBinary.test.ts：
- 平台包名 backlog.md-* → epicd-*（build/publish 矩阵、verify/install-sanity 的 PACKAGE_NAME node/pwsh 片段）
- 平台包内二进制文件名 backlog[.exe] → epicd[.exe]；artifact/release 资产名 backlog-* → epicd-*
- 移除 publish-binaries / verify-platform-packages 的 continue-on-error（失败即整体 run failure，诚实反映）；删除无效的 release-status-check gate
- npm-publish jq 新增 optionalDependencies 精确锁定 TAG（此前从未重写，dist 出厂带 "*" → 解析到旧的 pre-rename 二进制）
本地验证：tsc 干净；resolveBinary.test.ts / cli-root-entry.test.ts 全绿（9 pass）；jq 模拟输出 optionalDependencies 全部 epicd-*@TAG。
epicd-* 名字在 npm 上均 E404（未占用），npm whoami=yalehwang 有发布权限。
待人工确认后推送新 tag（v1.48.5）触发 release 实测 AC#1/#3/#4/#5。

## FixpointResult: Reached（2026-07-07，v1.48.6）
根因（bun.lock 未随 optionalDependencies 改名同步 → frozen-lockfile 失败）已修（commit 26929c9f）。v1.48.6 release run 全绿：

- AC#1 ✅ 6 个 epicd-* 平台包由 yalehwang 账号发布成功，无 403（npm view epicd-linux-x64 maintainers = yalehwang）
- AC#2 ✅ npm view epicd bin = { epicd: "cli.js" }
- AC#3 ✅ npm view epicd@1.48.6 optionalDependencies 全部精确锁定 1.48.6（非 "*"）
- AC#4 ✅ 全新环境 npm i -g epicd@1.48.6：epicd --version=1.48.6、epicd --help 首行 Usage: epicd、解析的 epicd-linux-x64/epicd 为 ELF 64-bit 原生二进制（非 JS 回退）
- AC#5 ✅ workflow 整体 conclusion=success 且诚实：v1.48.5 因 build 失败正确报 failure（移除 continue-on-error 后不再掩盖）

诚实性验证的意外收获：v1.48.5 那次因我引入的 bun.lock 回归而 build 失败，workflow 正确地整体 failure（而非旧行为的虚假 success）——恰好反证了「移除 continue-on-error」修复生效。

DoD: tsc 干净、biome 通过（5 文件）、scoped tests 9 pass。
audit: RiskGated(False)——改动为发布流水线配置（release.yml）+ 发布期脚本（*.cjs）+ 锁文件，无 src/ 引擎核心/安全表面；已在真实 release run + 全新环境安装端到端实测，等价于比静态审计更强的执行验证。
<!-- SECTION:NOTES:END -->
