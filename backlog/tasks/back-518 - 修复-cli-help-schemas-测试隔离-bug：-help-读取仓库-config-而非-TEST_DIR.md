---
id: BACK-518
title: 修复 cli-help-schemas 测试隔离 bug：--help 读取仓库 config 而非 TEST_DIR
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-06-25 23:21'
updated_date: '2026-06-25 23:33'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 111000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 修复 cli-help-schemas 测试隔离 bug：--help 读取仓库 config 而非 TEST_DIR

## Context

`src/test/cli-help-schemas.test.ts` 的 `beforeEach` 只做 `createUniqueTestDir` + `mkdir`，**未初始化 backlog 项目**，因此 TEST_DIR 内没有 `backlog/config.yml`。当测试运行 `bun ${CLI_PATH} search --help`（`.cwd(TEST_DIR)`）时，CLI 向上层目录查找配置，命中**本仓库**的 `backlog/config.yml`，于是断言期望的默认状态 `To Do, In Progress, Done` 被替换为本仓库当前配置的状态，导致 2 个测试在本地（config.yml 被 loop-backlog 工作流定制时）失败。CI 检出 committed 配置（默认状态）时通过，但这是**测试隔离泄漏**：测试结果依赖运行目录的祖先配置，而非自身 TEST_DIR。

失败断言（cli-help-schemas.test.ts:115 等）：`expect(searchHelp).toContain("status: one of configured statuses: To Do, In Progress, Done")`。

## 已验证事实（评审确认）
- `src/core/init.ts:138` 写入默认 `statuses: ["To Do", "In Progress", "Done"]`，`defaultStatus: "To Do"`，与断言文本一致。
- `initializeTestProject` 真实签名为 `initializeTestProject(core: Core, projectName: string, autoCommit = false, backlogDirectory?)`，**第一个参数是 Core 实例而非目录字符串**。不存在 `initializeTestProject(TEST_DIR)` 这种调用。
- 既有 CLI 测试（如 `config-commands.test.ts`、`cli-create.test.ts`）的标准初始化模式为：先 `git init`，再 `const core = new Core(TEST_DIR)`，再 `await initializeTestProject(core, "Name")`。本修复必须照此模式。

## Phase 1: 确认修复方式

1. 读取 `src/test/cli-help-schemas.test.ts`，确认 `beforeEach`（约第 11-14 行）缺少项目初始化（仅 `createUniqueTestDir` + `mkdir`）
2. 参照 `src/test/config-commands.test.ts` 的 `beforeEach` 模式，确认正确初始化序列：`git init` → `new Core(TEST_DIR)` → `initializeTestProject(core, "Name")`

### DoD
- [ ] `grep -q 'export async function initializeTestProject' src/test/test-utils.ts`
- [ ] `grep -q 'statuses: \["To Do", "In Progress", "Done"\]' src/core/init.ts`
- [ ] `grep -q 'initializeTestProject(core' src/test/config-commands.test.ts`

## Phase 2: 修复测试隔离并验证

1. 修改 `src/test/cli-help-schemas.test.ts`：
   - import 增加 `Core`（`import { Core } from "../core/backlog.ts";` 或与 `config-commands.test.ts` 一致的来源）与 `initializeTestProject`（来自 `./test-utils.ts`）
   - 在 `beforeEach` 的 `mkdir` 之后加入：`git init`（`await $\`git init -b main\`.cwd(TEST_DIR).quiet();`，并配置 user.name/user.email），然后 `const core = new Core(TEST_DIR); await initializeTestProject(core, "CLI Help Schemas Test");`
   - 注意：调用形式为 `initializeTestProject(core, "...")`，**禁止** `initializeTestProject(TEST_DIR)`
2. 不修改断言中期望的默认状态文本——修复点是让 TEST_DIR 提供默认配置，而非改断言
3. 验证：在**本地定制的 config.yml**（Epic/Basic 状态）下运行该测试文件应全绿，证明不再读取祖先仓库配置

### DoD
- [ ] `grep -q 'initializeTestProject(core' src/test/cli-help-schemas.test.ts`
- [ ] `! grep -q 'initializeTestProject(TEST_DIR)' src/test/cli-help-schemas.test.ts`
- [ ] `grep -q 'git init' src/test/cli-help-schemas.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun test src/test/cli-help-schemas.test.ts --timeout=30000`

## Phase 3: 全量并行回归确认

确认修复在并行模式下稳定，且本地 config.yml 定制不再导致该文件失败。

### DoD
- [ ] `bun test --parallel src/test/cli-help-schemas.test.ts --timeout=30000`
- [ ] `bun run check src/test/cli-help-schemas.test.ts`
- [ ] `bun test --parallel --timeout=30000`

## Constraints
- 仅修复测试隔离（TEST_DIR 提供自身配置），不修改 CLI 的配置查找逻辑（向上查找是 CLI 在真实使用中的合理行为）
- 不修改断言期望的默认状态文本
- 不引入对本地 config.yml 的依赖或 stash/restore 等 hack
- 调用真实 `initializeTestProject(core, name)` 签名；若初始化报错（如需 git 仓库），照 `config-commands.test.ts` 补齐 `git init` 与 user 配置

## Acceptance Gate
- [ ] `grep -q 'initializeTestProject(core' src/test/cli-help-schemas.test.ts`
- [ ] `! grep -q 'initializeTestProject(TEST_DIR)' src/test/cli-help-schemas.test.ts`
- [ ] `bunx tsc --noEmit`
- [ ] `bun test --parallel src/test/cli-help-schemas.test.ts --timeout=30000`
- [ ] `bun test --parallel --timeout=30000`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iteration 2: APPROVED

claimed: 2026-06-25T23:28:11Z

Completed: 2026-06-25T23:33:54Z
Verified against LOCAL customized config.yml (Epic/Basic statuses) — the original failure condition: cli-help-schemas now 7 pass 0 fail (was 2 fail). Isolation fix confirmed. Repo-wide bun run check . exit 0 after BACK-517 merge.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 grep -q 'export async function initializeTestProject' src/test/test-utils.ts
- [ ] #5 grep -q 'statuses: \["To Do", "In Progress", "Done"\]' src/core/init.ts
- [ ] #6 grep -q 'initializeTestProject(core' src/test/config-commands.test.ts
- [ ] #7 grep -q 'initializeTestProject(core' src/test/cli-help-schemas.test.ts
- [ ] #8 ! grep -q 'initializeTestProject(TEST_DIR)' src/test/cli-help-schemas.test.ts
- [ ] #9 grep -q 'git init' src/test/cli-help-schemas.test.ts
- [ ] #10 bunx tsc --noEmit
- [ ] #11 bun test src/test/cli-help-schemas.test.ts --timeout=30000
- [ ] #12 bun test --parallel src/test/cli-help-schemas.test.ts --timeout=30000
- [ ] #13 bun run check src/test/cli-help-schemas.test.ts
- [ ] #14 bun test --parallel --timeout=30000
- [ ] #15 grep -q 'initializeTestProject(core' src/test/cli-help-schemas.test.ts
- [ ] #16 ! grep -q 'initializeTestProject(TEST_DIR)' src/test/cli-help-schemas.test.ts
- [ ] #17 bunx tsc --noEmit
- [ ] #18 bun test --parallel src/test/cli-help-schemas.test.ts --timeout=30000
- [ ] #19 bun test --parallel --timeout=30000
<!-- DOD:END -->
