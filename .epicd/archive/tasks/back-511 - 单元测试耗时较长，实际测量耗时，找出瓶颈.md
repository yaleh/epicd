---
id: BACK-511
title: 单元测试耗时较长，实际测量耗时，找出瓶颈
status: 'Basic: Done'
assignee: []
created_date: '2026-06-25 00:04'
updated_date: '2026-06-25 10:58'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
单元测试耗时较长，实际测量耗时，找出瓶颈。
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Plan: 单元测试耗时分析与瓶颈识别

## Context
`bun test` 运行 1337 个测试，耗时约 280-330 秒，远超预期。
本任务对测试套件进行计时分析，定位耗时最长的测试文件和单个用例，输出优化建议报告。

## Phase 1: 收集各测试文件耗时数据

运行完整测试套件，捕获每个文件的耗时输出。
Note: `bun test --reporter=verbose` prints per-file summary lines in the format `  [123ms] path/to/file.test.ts  (N tests)` or similar. Capture everything to inspect the actual format:

```bash
mkdir -p /tmp/ttb-back511
cd /home/yale/work/Backlog.md
bun test --reporter=verbose 2>&1 | tee /tmp/ttb-back511/raw-test-output.txt
```

Inspect the actual timing line format in the captured output, then extract and sort by millisecond value. Use `awk` to parse the numeric duration and produce a file of `<ms_value> <filepath>` pairs, sorted descending, keeping Top 20:

```bash
# Extract lines that contain a .test.ts path and a bracketed time value [NNNms] or [N.Ns]
grep -E '\[([0-9]+(\.[0-9]+)?)(ms|s)\]' /tmp/ttb-back511/raw-test-output.txt \
  | grep '\.test\.ts' \
  | awk '{
      for (i=1; i<=NF; i++) {
        if ($i ~ /^\[[0-9]+(\.[0-9]+)?(ms|s)\]$/) {
          val = $i
          gsub(/[\[\]]/, "", val)
          if (val ~ /ms$/) { gsub(/ms/, "", val); ms = val+0 }
          else { gsub(/s$/, "", val); ms = val*1000 }
        }
      }
      print ms, $0
    }' \
  | sort -rn \
  | head -20 \
  | tee /tmp/ttb-back511/slow-files-raw.txt \
  | awk '{$1=""; print $0}' > /tmp/ttb-back511/slow-files.txt
```

If the above grep/awk produces an empty file (format mismatch), inspect `/tmp/ttb-back511/raw-test-output.txt` for the actual format and adjust the extraction pattern accordingly before proceeding.

### DoD
- [ ] `test -s /tmp/ttb-back511/raw-test-output.txt`
- [ ] `grep -q '\.test\.ts' /tmp/ttb-back511/raw-test-output.txt`
- [ ] `test -s /tmp/ttb-back511/slow-files.txt`
- [ ] `grep -q '\.test\.ts' /tmp/ttb-back511/slow-files.txt`

## Phase 2: 定位慢测试用例

针对 Phase 1 识别的 Top 5 最慢文件，对每个文件单独运行 `bun test` 并捕获逐用例计时。
Extract the `.test.ts` file path from each slow-files line (the path may be relative like `src/...` or absolute); adjust pattern to match what is actually in slow-files.txt:

```bash
rm -f /tmp/ttb-back511/per-file-timing.txt
while IFS= read -r line; do
  # Extract the first token matching a .test.ts path (relative or absolute)
  file=$(echo "$line" | grep -oE '[^ ]+\.test\.ts' | head -1)
  [ -z "$file" ] && continue
  echo "=== $file ===" >> /tmp/ttb-back511/per-file-timing.txt
  cd /home/yale/work/Backlog.md
  bun test "$file" 2>&1 >> /tmp/ttb-back511/per-file-timing.txt
  echo "" >> /tmp/ttb-back511/per-file-timing.txt
done < <(head -5 /tmp/ttb-back511/slow-files.txt)
```

If `per-file-timing.txt` is empty after the loop, check that `slow-files.txt` contains parseable `.test.ts` paths and re-run with corrected path extraction.

### DoD
- [ ] `test -s /tmp/ttb-back511/per-file-timing.txt`
- [ ] `grep -q '\.test\.ts' /tmp/ttb-back511/per-file-timing.txt`

## Phase 3: 生成瓶颈分析报告

根据 Phase 1 和 Phase 2 收集的实际数据，编写 Markdown 报告并写入 `docs/tasks/test-timing-report.md`。

首先创建目录：

```bash
mkdir -p /home/yale/work/Backlog.md/docs/tasks
```

然后使用 Write 工具（或 bash heredoc）将报告写入 `/home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`。
报告必须包含以下各节（使用 `##` 二级标题）：

- `## 总览` — 总耗时、总测试数、测试文件数
- `## Top 10 最慢测试文件` — 表格：文件名、耗时(ms)、用例数
- `## 慢文件详情` — 每个 Top 5 慢文件的逐用例耗时（来自 per-file-timing.txt）
- `## 瓶颈归因` — 对各慢文件耗时原因的分析（I/O、进程启动、PTY、jsdom 等），基于实测数据
- `## 优化建议` — 针对各已识别瓶颈的可执行优化动作列表

所有数据必须来源于 `raw-test-output.txt` 和 `per-file-timing.txt` 的实测结果，不得凭猜测填写。

### DoD
- [ ] `test -s /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `grep -q '## 瓶颈归因' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `grep -q '## 优化建议' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `grep -q '## Top 10 最慢测试文件' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`

## Constraints
- 不修改任何测试文件或源码；本任务仅分析、不修改
- 不跳过任何测试（不使用 `--bail` 或 `.skip`）
- 报告内容基于实际测量数据，不得凭猜测填写
- 如果某一解析步骤输出为空，必须先排查格式再继续，不得用空数据继续后续 Phase

## Acceptance Gate
- [ ] `test -s /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `grep -q '## 瓶颈归因' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `grep -q '## 优化建议' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `grep -q '## Top 10 最慢测试文件' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md`
- [ ] `[ $(wc -l < /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md) -ge 40 ]`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan review iteration 3: APPROVED

cap:propose=approved

claimed: 2026-06-25T10:34:31Z

Phase 1 ✓ 2026-06-25T10:52: 全量测试完成，1337个测试，165个文件，耗时291.23s，2个失败用例（cli-doc-search超时、cli-priority-filtering超时）

Phase 2 ✓ 2026-06-25T11:05: 逐文件计时完成，生成slow-files.txt（145个文件排序）和per-file-timing.txt（Top5慢文件详情）。Top5: cli.test.ts(44407ms), cli-priority-filtering.test.ts(35794ms), acceptance-criteria.test.ts(24069ms), cli-milestone-management.test.ts(17744ms), task-edit-preservation.test.ts(13428ms)

Phase 3 ✓ 2026-06-25T11:15: 报告已写入 docs/tasks/test-timing-report.md（177行），包含总览、Top10慢文件表格、慢文件详情、瓶颈归因、优化建议各节

## Execution Summary
Result: Done
Commit: 73cadf4
Phase 1: 全量测试运行，1337测试/165文件，耗时291s，2失败

Phase 2: 逐文件计时，Top5: cli.test.ts(44407ms), cli-priority-filtering.test.ts(35794ms), acceptance-criteria.test.ts(24069ms), cli-milestone-management.test.ts(17744ms), task-edit-preservation.test.ts(13428ms)

Phase 3: 报告生成 docs/tasks/test-timing-report.md，主要瓶颈: bun子进程启动开销占总耗旹72%（363次调用×~580ms）

Completed: 2026-06-25T10:58:18Z

## Execution Summary
Result: Done
Commit: 395783b5d08353de498a6f66918c149d9ef6b957
- Phase 1: Ran full bun test suite (1337 tests, 165 files, 291s total)
- Phase 2: Extracted per-file timing, identified top 5 slowest test files
- Phase 3: Generated bottleneck analysis report at docs/tasks/test-timing-report.md
Key finding: bun subprocess cold-start overhead accounts for ~72% of test time
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 test -s /tmp/ttb-back511/raw-test-output.txt
- [ ] #5 grep -q '\.test\.ts' /tmp/ttb-back511/raw-test-output.txt
- [ ] #6 test -s /tmp/ttb-back511/slow-files.txt
- [ ] #7 grep -q '\.test\.ts' /tmp/ttb-back511/slow-files.txt
- [ ] #8 test -s /tmp/ttb-back511/per-file-timing.txt
- [ ] #9 grep -q '\.test\.ts' /tmp/ttb-back511/per-file-timing.txt
- [ ] #10 test -s /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md
- [ ] #11 grep -q '## 瓶颈归因' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md
- [ ] #12 grep -q '## 优化建议' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md
- [ ] #13 grep -q '## Top 10 最慢测试文件' /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md
- [ ] #14 [ $(wc -l < /home/yale/work/Backlog.md/docs/tasks/test-timing-report.md) -ge 40 ]
- [ ] #15 bash "/home/yale/.local/share/baime/scripts/validate-plugin.sh"
<!-- DOD:END -->
