---
id: BACK-516
title: 升级 bun ≥1.3.13 并采用 bun test --parallel 实现测试文件级并行
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-06-25 22:42'
updated_date: '2026-06-25 23:12'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 109000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 升级 bun ≥1.3.13 并采用 bun test --parallel 实现测试文件级并行

## Context

实测发现 bun 1.3.10/1.3.11 **跨文件串行执行**测试：全套 169s，但最慢单文件仅 18s——`--isolate` 与 `--max-concurrency` 对 wall-time 无影响（170-175s），因为真正的 worker 池 `bun test --parallel` 直到 bun v1.3.13（2026-04）才存在。本项目 CI 固定 `BUN_VERSION: 1.3.11`，本机 1.3.10，均早于该功能。升级到 ≥1.3.13 并改用 `--parallel` 是把测试时间从 ~169s 砍到 ~30-40s 的单项最高杠杆改动。主要风险是并行 worker 间的资源冲突（固定端口、cwd、共享临时目录）；bun 提供 `BUN_TEST_WORKER_ID` 用于命名空间隔离。

参考：https://bun.com/blog/bun-v1.3.13 — `bun test --parallel[=N]`、`--shard=M/N`、`--changed`。

## Phase 1: 升级 bun 并验证 --parallel 可用

1. 确定目标版本：选 ≥1.3.13 的稳定 **1.3.x** 版本（与 bun 官方最新 1.3.x release 对齐；记录确定值到 plan 执行 notes）
2. 本机升级：`bun upgrade`（或安装指定版本），确认 `bun --version` ≥ 1.3.13
3. 验证 flag 存在：`bun test --parallel --help` 或运行 `bun test --parallel src/test/cli-create.test.ts` 不报"unknown flag"
4. 更新 CI 固定版本：把 `.github/workflows/ci.yml` 的 `BUN_VERSION` 改为目标 1.3.x 版本

### DoD
- [ ] `printf '1.3.13\n%s\n' "$(bun --version)" | sort -V -C`
- [ ] `bun test --parallel src/test/cli-create.test.ts --timeout=30000`
- [ ] `grep -qE 'BUN_VERSION:\s*1\.3\.(1[3-9]|[2-9][0-9])' .github/workflows/ci.yml`

## Phase 2: 排查并修复并行 worker 间资源冲突

`--parallel` 自动叠加 `--isolate`（每文件全新 globals），但跨文件并发可能在以下点冲突：固定端口（MCP/browser server 测试）、固定 cwd、共享非唯一临时目录。

1. 审计固定端口：`grep -rn 'port\s*[:=]\s*[0-9]' src/test/*.test.ts` 找出硬编码端口（已知 enhanced-init.test.ts:171 port 7777）；对冲突项改为动态端口（端口 0 或基于 `BUN_TEST_WORKER_ID` 偏移）
2. 审计临时目录：确认所有测试用 `createUniqueTestDir`（已是主流模式）而非固定路径；`grep -rn 'tmp/test-\|/tmp/[a-z]' src/test/*.test.ts` 复查固定路径
3. 审计 cwd 依赖：`grep -rn 'process.chdir\|process.cwd()' src/test/*.test.ts` 确认无全局 cwd 改动跨文件泄漏
4. 先跑一次完整 `bun test --parallel` 捕获失败文件清单，对每个失败逐一隔离修复
5. 反复运行 3 次确认无 flaky（并行下竞态会间歇暴露）

### DoD
- [ ] `bun test --parallel --timeout=30000`
- [ ] `bun test --parallel --timeout=30000`
- [ ] `bun test --parallel --timeout=30000`

## Phase 3: 更新 CI 与文档使用 --parallel

CI 当前有两处测试调用：Windows 分支（ci.yml:42）与 Linux/macOS 分支（ci.yml:45），均带 `--isolate ... --max-concurrency=4`。本阶段统一改为 `--parallel`（已含 `--isolate`，移除冗余 `--max-concurrency=4`），使下面 `! grep -q max-concurrency=4` 全文件级断言自洽。

1. 修改 Linux/macOS 测试步骤（ci.yml:45）：`bun test --isolate ... --max-concurrency=4` 改为 `bun test --parallel ...`，移除 `--max-concurrency=4`，保留 `--timeout`/`--reporter` 参数
2. 修改 Windows 测试步骤（ci.yml:42）：同样改为 `bun test --parallel ...` 并移除 `--max-concurrency=4`。**若 Windows 在 Phase 2 复跑中证实 `--parallel` 不稳定，则停止并升级到 Basic: Needs Human 说明**（不得保留 `--max-concurrency=4`，否则与本阶段 DoD 全文件断言冲突）
3. 更新 `CLAUDE.md` 的 `test-cmd` / `test-all`（若适用）及任何开发文档中的测试命令为 `bun test --parallel`
4. 记录实测前后 wall-time 对比到任务 notes

### DoD
- [ ] `grep -q 'bun test --parallel' .github/workflows/ci.yml`
- [ ] `! grep -q 'max-concurrency=4' .github/workflows/ci.yml`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Constraints
- 不修改任何测试断言或业务逻辑，仅做版本升级 + 配置 + 资源隔离修复
- 不引入新的测试框架（保持 bun test）
- 端口/目录隔离修复必须用 `BUN_TEST_WORKER_ID` 或动态分配，不得用 sleep/retry 掩盖竞态
- CI 全部测试步骤（含 Windows）统一使用 `--parallel`；若任一平台 `--parallel` 不稳定，停止并升级到 Basic: Needs Human，不得用 `--max-concurrency=4` 旁路（会破坏 Phase 3 DoD）
- 若目标 bun 版本引入与现有测试不兼容的破坏性变更，停止并升级到 Basic: Needs Human 说明
- `--changed` 与 `--shard` 为后续可选增强，本任务不强制实现

## Acceptance Gate
- [ ] `bun test --parallel --timeout=30000`
- [ ] `printf '1.3.13\n%s\n' "$(bun --version)" | sort -V -C`
- [ ] `grep -q 'bun test --parallel' .github/workflows/ci.yml`
- [ ] `! grep -q 'max-concurrency=4' .github/workflows/ci.yml`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iteration 3: APPROVED

claimed: 2026-06-25T22:52:54Z

Completed: 2026-06-25T23:12:28Z
Pre-merge verification (worker): bun 1.3.14, bun test --parallel 1348 pass 0 fail in 69.9s (vs 158.8s serial, 2.3x). tsc clean. ci.yml uses --parallel, no max-concurrency=4.
NOTE: DoD 'bun run check .' fails on 19 pre-existing biome import-ordering errors in BACK-514-migrated test files — verified IDENTICAL on base commit (not a BACK-516 regression). BACK-516's own changed files pass biome.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 printf '1.3.13\n%s\n' "$(bun --version)" | sort -V -C
- [ ] #5 bun test --parallel src/test/cli-create.test.ts --timeout=30000
- [ ] #6 grep -qE 'BUN_VERSION:\s*1\.3\.(1[3-9]|[2-9][0-9])' .github/workflows/ci.yml
- [ ] #7 bun test --parallel --timeout=30000
- [ ] #8 bun test --parallel --timeout=30000
- [ ] #9 bun test --parallel --timeout=30000
- [ ] #10 grep -q 'bun test --parallel' .github/workflows/ci.yml
- [ ] #11 ! grep -q 'max-concurrency=4' .github/workflows/ci.yml
- [ ] #12 bunx tsc --noEmit
- [ ] #13 bun run check .
- [ ] #14 bun test --parallel --timeout=30000
- [ ] #15 printf '1.3.13\n%s\n' "$(bun --version)" | sort -V -C
- [ ] #16 grep -q 'bun test --parallel' .github/workflows/ci.yml
- [ ] #17 ! grep -q 'max-concurrency=4' .github/workflows/ci.yml
- [ ] #18 bunx tsc --noEmit
- [ ] #19 bun run check .
<!-- DOD:END -->
