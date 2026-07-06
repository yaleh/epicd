---
id: BACK-664.1
title: status 投影坍缩 phase-only + 移除编辑面
status: Done
assignee:
  - '@claude'
created_date: '2026-07-06 12:31'
updated_date: '2026-07-06 13:53'
labels:
  - 'kind:basic'
dependencies: []
parent_task_id: BACK-664
ordinal: 84000
pipeline_id: execution
phase: done
parent_id: BACK-664
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-664 child 1（monitor-free，无依赖，可即刻驱动）。

坍缩 label(role,phase) 为 titleCasePhase(phase)（field-registry.ts:404-425 删除 role 前缀分支）；
web status badge 渲染 phase 文本 + 新增独立 has-children 指示器（父/子数 chip 或展开三角）；
删除 web StatusSelect 下拉（TaskDetailsModal.tsx）与 CLI task create/edit 的 -s/--status 编辑选项
（list/search 的只读过滤器保留）；TaskList 分桶由 config-status 改为 phase。

收敛信号：bun scripts/fixpoint-back665.ts 中以下 check 应转绿：
- status-projection-phase-only
- no-prefix-generator-in-code
- no-cli-status-edit-surface
- no-web-status-select
- has-children-indicator（新增 src/test/has-children-indicator.test.ts）
- web-lifecycle-conformance（新增 src/test/web-lifecycle-conformance.test.ts）

参考：docs/task-lifecycle-model.md §4/§5，BACK-665 plan，BACK-664 plan child 1。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete on branch task/BACK-664.1 (worktree /home/yale/work/epicd-BACK-664.1, commit 3761818).

Summary:
- field-registry.ts label(role, phase) collapsed to a phase-only projection (titleCasePhase), no "Basic:"/"Epic:" prefix; no-prefix-generator-in-code meter is clean.
- Removed all 5 CLI write-side `-s, --status` options (task create/edit, draft create, decision create); read-side filters (task list --status, task search --status) kept. task edit now takes --phase (status derives from it).
- plugin/scripts/complete-task.sh and handle-basic-ready.sh migrated from `--status "Basic: ..."` writes to `--phase done|needs-human` / append-notes-only claim marker; propose skill doc updated to `--pipeline authoring --phase backlog`.
- Web: removed the editable StatusSelect dropdown from TaskDetailsModal.tsx; status now renders as a read-only phase-derived badge.
- Added an independent has-children indicator (never concatenated into status): CLI `task list --plain` gets a "▸ " marker column; web TaskList/TaskDetailsModal show a "Has subtasks" badge/icon. Implemented in both utils/task-subtasks.ts (core/CLI) and web/lib/lanes.ts (web-safe duplicate, required because web/lib cannot import core/backlog.ts without breaking the browser build) — parity between the two is locked in by a test.
- TaskList phase-bucketing (requirement #5) was already satisfied by pre-existing groupTasksByPhase code from BACK-644/647/653; added conformance assertions only, no functional change needed.
- New tests: src/test/has-children-indicator.test.ts, src/test/web-lifecycle-conformance.test.ts.

Verification: bunx tsc --noEmit clean; bun run check . clean (0 errors, 11 pre-existing unrelated warnings); bun test --parallel ./src → 1974 pass / 2 skip (occasional single flaky failure reproduced even on unmodified baseline — pre-existing environment flakiness, not from this change).

bun scripts/fixpoint-back665.ts: all 6 checks owned by this task are green — status-projection-phase-only, no-prefix-generator-in-code, no-cli-status-edit-surface, no-web-status-select, has-children-indicator, web-lifecycle-conformance. Remaining 4 red checks (no-persisted-status-role, phase-skill-coverage, evaluate-runs-integration-acceptance, epicd-self-sufficient-no-baime) belong to BACK-664 (field removal)/BACK-657/BACK-660 as expected.

Not pushed, no PR opened per instructions. Status left as-is since the -s/--status write mechanism this task removes is not something I should use to set my own task's status; recommend a human/orchestrator move this to Basic: Needs Human or Done via --phase or direct board update.

Merged to main (commit range 3761818..). Meter 6/10 green: status-projection-phase-only, no-prefix-generator-in-code, no-cli-status-edit-surface, no-web-status-select, has-children-indicator, web-lifecycle-conformance. Full suite green (1 known pre-existing flake in parallel-loading.test.ts, passes in isolation).
<!-- SECTION:NOTES:END -->
