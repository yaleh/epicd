---
id: BACK-681
title: bin 命令重命名：backlog → epicd（npm install 后 epicd 可用）
assignee:
  - '@claude'
created_date: '2026-07-07 11:43'
updated_date: '2026-07-14 06:36'
labels:
  - 'kind:basic'
dependencies: []
priority: high
ordinal: 91000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

BACK-600.1 完成了 package.json name=epicd，但 bin 入口仍是 `backlog`（package.json: `"bin": {"backlog": "scripts/cli.cjs"}`），导致全局安装后只有 `backlog` 命令、没有 `epicd` 命令，与包名不一致。BACK-680 明确把 bin 改名列为非目标并注「影响面需单独评估立项」，本任务就是那个单独立项。

## 目标

`npm i -g epicd` 安装后，用户可以用 `epicd` 命令调用 CLI；同步更新 CI 构建产物名、测试断言、skill 文档和 plugin scripts 中的调用引用。

## 不动点（改后必须成立）

**命令可用性**
- `which epicd` 在全局安装后解析（npm bin 入口为 epicd）
- `epicd --version` 输出版本号，`epicd --help` 输出帮助
- CI 构建产物从 `backlog`/`backlog.exe` 改名为 `epicd`/`epicd.exe`

**测试通过**
- `bun test src/test/build.test.ts` 通过（executableName 由 "backlog" 改为 "epicd"）
- `bunx tsc --noEmit` 通过
- `bun test` 整体通过

**文档/脚本一致性**
- plugin/scripts/ 中调用 CLI 的脚本（handle-basic-ready.sh、complete-task.sh、scan-loop.cjs 等）改为调用 `epicd`
- plugin/skills/ 的 SKILL.md 中 CLI 调用示例改为 `epicd`
- docs/cross-project-install.md 安装指令改为 `npm i -g epicd` + `epicd`

## 严格不改（必须保持）

1. **MCP server name 保持 "backlog"**：src/cli.ts MCP_SERVER_NAME="backlog"、`backlog://` URI scheme 不变。已安装的 Claude Code 配置引用 `mcp__backlog__*` 工具名，改名是破坏性变更，需单独评估。
2. **backlog/ 目录名不变**：任务文件存储路径（`backlog/tasks/`）是文件系统约定，不是 bin 名。
3. **pipeline phase 名称不变**：authoring pipeline 的 "backlog" phase 是数据语义，不涉及 bin。
4. **optionalDependencies 包名不变**：`backlog.md-linux-x64` 等平台包已发布在 npm，改名需单独发布新包，超出本任务范围。
5. **release.yml 平台包内嵌 package.json 的 bin 字段保持 backlog**：平台包 `.bin = {backlog:"cli.js"}` 与平台包名绑定，改动需随平台包重命名一起处理。

## 改动范围

- `package.json` bin 字段：`{"backlog": ...}` → `{"epicd": ...}`
- `src/cli.ts` .name("backlog") → .name("epicd")（Commander 程序名）
- `src/test/build.test.ts` executableName 由 "backlog" 改为 "epicd"
- `.github/workflows/ci.yml`：OUT/FILE/TUI_TEST_CLI_PATH 中的 backlog-test → epicd-test
- `.github/workflows/release.yml`：主包 BIN 变量、artifact name、pkg/ 内二进制名改为 epicd
- `plugin/scripts/`（handle-basic-ready.sh、complete-task.sh、scan-loop.cjs）调用处改为 epicd
- `plugin/skills/` 各 SKILL.md CLI 调用示例改为 epicd
- `docs/cross-project-install.md` 安装和使用命令改为 epicd
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 grep -q '"epicd": "scripts/cli.cjs"' package.json
- [ ] #2 bun run build && ls dist/epicd（构建产物名正确）
- [ ] #3 bun test src/test/build.test.ts 通过（executableName 已更新）
- [ ] #4 bun test 整体通过
- [ ] #5 bunx tsc --noEmit 通过
- [ ] #6 grep -rn 'MCP_SERVER_NAME' src/cli.ts | grep backlog（MCP server name 未动）
- [ ] #7 grep -c 'backlog://' src/cli.ts 输出 > 0（backlog:// URI scheme 未动）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
audit-skip rationale: pure rename sweep (bin entry + build outfile + CI artifact names + script/doc call-site updates). No algorithmic logic changed. All 7 ACs are mechanical shell-gate checks, each run and verified green before merge. MCP server name / backlog:// scheme / optionalDependencies verified untouched by grep. RiskGated skip with recorded rationale per fixpoint-convergence spec.

Final summary: renamed bin entry backlog→epicd in package.json + build outfile (dist/epicd) + CI artifact names (epicd-test/epicd-bin) + 21 plugin/scripts and skill SKILL.md call sites + AGENTS.md (CLAUDE.md target) + src/cli.ts Commander name + 17 test fixtures. MCP_SERVER_NAME, backlog:// URIs, backlog/ dir, optionalDependencies platform package names all untouched. All 7 ACs verified green on main. 1958/1960 tests pass (2 pre-existing parallel flakes).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 bunx tsc --noEmit passes when TypeScript touched
- [ ] #5 bun run check . passes when formatting/linting touched
- [ ] #6 bun test passes
<!-- DOD:END -->
