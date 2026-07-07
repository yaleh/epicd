---
id: BACK-628.3
title: >-
  TaskUpdateInput 仍无 pipeline_id/phase/parent_id/dod 字段：create/update
  引擎字段不对称未真正收口
pipeline_id: execution
phase: done
assignee:
  - '@claude'
created_date: '2026-07-05 06:21'
updated_date: '2026-07-05 07:02'
labels:
  - 'kind:refactor'
  - 'epicd:bootstrap'
dependencies: []
parent_task_id: BACK-628
ordinal: 46000
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 发现（BACK-628.1 点火审计，独立复核，非自证）
BACK-610（BACK-601.3，声称'TaskCreateInput/TaskUpdateInput 对称'，标 Basic:Done）自己的 plan 里写明了这处不对称（'concrete asymmetry... applyTaskUpdateInput 对 pipeline_id/phase/parent_id/dod 零处理'），但实测 `src/types/index.ts` 的 `TaskUpdateInput` 接口（182 行起）**至今仍无** `pipeline_id`/`phase`/`parent_id`/`dod` 字段——对称并未真正交付,只交付了 labels/assignee/dependencies/references/documentation/modifiedFiles 那一半（schema 由 registry 派生的部分）。

**直接后果**：CLI `task edit --status` 之外没有任何 CLI/MCP 支持的路径能设置 `phase`。本次点火复核 E1(BACK-601) 时,`task edit -s "Epic: Done"` 把 status 设对了,但 phase 留在陈旧的 `needs-human`——因为没有对称入口。目前只有 `core.updateTask()`(decomposer.ts/complete.ts 等引擎内部代码)能直写 phase,人/CLI 走不到。

这是 E1 memory 记录的'DoD-green 藏 stub'暗礁的一个实例：BACK-610 门禁全绿(tsc/check/test)但其自己 plan 声明的核心目标未达成。

## 范围
把 pipeline_id/phase/parent_id/dod 加入 TaskUpdateInput + applyTaskUpdateInput（含派生：设 phase 时经 field-registry 的 displayStatus 同步 status,呼应 BACK-627 的中心化纪律,勿另开一条写路径）；同步补 MCP schema。

## 非目标
- 不重开 BACK-610（已 Done,本任务是遗留缺口的独立收口）。
- 不改变引擎内部 core.updateTask 直写路径（decomposer/complete 保持不变）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TaskUpdateInput 新增 pipeline_id/phase/parent_id/dod(Gates) 可选字段；applyTaskUpdateInput 处理这些字段的更新
- [x] #2 经 CLI task edit 或 MCP task_edit 可设置 phase,设置后 status 经 displayStatus(BACK-627 同一派生路径)同步,不产生新写路径
- [x] #3 MCP task_edit schema 反映新字段(由 registry mcpSchema 派生,而非手写)
- [x] #4 回归测试覆盖：设置 phase 后 status 同步；未设置 phase 时行为不变(no-op 安全)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
独立复核发现：BACK-628.3 原始 finding 部分过时。实测确认 AC1/AC3 早已由 BACK-610（commit 98c5d5d）交付：
- TaskUpdateInput（src/types/index.ts）已有 pipeline_id/phase/parent_id/dodGates
- applyTaskUpdateInput（src/core/backlog.ts）已处理这些字段
- TaskEditArgs（src/types/task-edit-args.ts）已声明这些字段
- buildTaskUpdateInput（src/utils/task-edit-builder.ts:220-234）已转发这些字段
- MCP task_edit JSON schema（schema-generators.ts:165 `...registryProperties`）经 field-registry 的 mcpSchema 派生，已暴露 pipeline_id/phase/parent_id/dodGates —— 首次核查误判为缺失（未看到 spread 行），二次读源码纠正。

真正的缺口只在 CLI：task edit 命令没有 --pipeline-id/--phase/--parent-id flag（--dod-gate 已存在，create/edit 均有）。本次新增：
- cli.ts: task edit 新增 --pipeline-id <id> / --phase <phase> / --parent-id <id>，走既有 editArgs → buildTaskUpdateInput → core.editTask 路径，未另开写路径（呼应 BACK-627 中心化纪律）
- 新增回归测试 src/test/cli-engine-fields-edit.test.ts：CLI --phase 设置后 status 经 displayStatus 同步；仅重设 phase 不需要额外 --status
- 端到端验证：用新 flag 修复了 BACK-601 遗留的 status/phase 悬空（frontmatter status='Epic: Done' 但 phase=needs-human）——现在两次 --phase 编辑后 status 正确同步为 'Epic: Needs Human'

验证：bunx tsc --noEmit 通过；bun run check . 通过（仅 2 处历史 pre-existing lint warning，与本次改动无关）；bun test --parallel 1765 pass（cli-milestone-management.test.ts 的 3 fail/1 error 为已知 --parallel 隔离性 flake，隔离运行 10/10 pass，与本次改动无关）。修复 cli-instructions.test.ts 期间的一处回归：option 描述文案曾含 'BACK-610'/'BACK-627' 字面量，泄漏进 --help 文本，被"instructions 不得含内部任务号"用例捕获，已改为不含任务号的通用描述。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
