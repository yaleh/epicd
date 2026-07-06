---
id: BACK-626.2
title: decomposer.ts：子任务 touches 字段声明 + 兄弟任务交集检查
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 03:41'
updated_date: '2026-07-06 03:46'
labels: []
dependencies:
  - BACK-626.1
parent_task_id: BACK-626
ordinal: 38000
pipeline_id: execution
phase: done
parent_id: BACK-626
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在 epicd 的 src/harness/decomposer.ts 中落地"分解正交性检查清单"的第一层信号（声明式重叠检查），依据 BACK-626.1 产出的 ADR/方法论文档定义的字段语义和判据。

背景：epic 分解时子任务之间可能存在隐藏的文件/职责重叠，目前完全没有机制在分解阶段暴露这类耦合——只能等实现阶段冲突发生（如 BACK-622/BACK-601 的 status/phase 字段在 decomposer.ts 与 complete.ts 之间重复漂移）才被发现。本任务让分解阶段的输出自带一份"重叠检查报告"，供人工在 dispatch 前查看。

依赖：BACK-626.1（ADR/方法论文档）必须先完成，因为字段名（touches）、交集判定规则、执行强度（advisory）均以该文档为准，本任务不得自行发明新规则。

实现要点（细节以 BACK-626.1 文档为准，此处仅列出功能范围）：
- decomposer.ts 生成子任务时，要求（或引导 agent）为每个子任务附带 touches 字段（涉及的文件/模块路径列表）
- 分解完成后，对所有兄弟子任务两两做 touches 交集检查
- 若交集非空，生成一份非阻塞的提示（写入 epic 的某个字段或日志，具体载体以现有 epic 数据结构为准），供人工在 dispatch 前查看，不阻断分解或 dispatch 流程
- 补充回归测试，覆盖"存在重叠"和"无重叠"两种场景
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 子任务对象支持声明 touches 字段（根据 BACK-626.1 文档定义的语义）
- [x] #2 分解完成后，对所有兄弟子任务进行两两 touches 交集检查
- [x] #3 交集非空时生成非阻塞提示，不会阻断分解或 dispatch 流程
- [x] #4 新增回归测试覆盖有重叠和无重叠两种场景
- [x] #5 具体字段名、判定规则与 BACK-626.1 产出的文档一致，不自行发明新规则
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Scope 决定：touches 只是 worker 提议子任务时的临时字段（ProposedChild），用于分解阶段计算重叠，不持久化进创建后的 child Task（保持 schema 面最小，ADR-016 只要求分解时的信号，不要求永久字段）。

1. ProposedChild 增加 touches?: string[] 字段；parseProposedChildren 解析该字段（数组字符串；非法/非数组项按现有 title/description 的容错风格丢弃，不影响子任务本身被保留）。
2. buildDecomposeBrief 的 "Output format" 指示里追加：worker 可为每个子任务附带 "touches": ["path/a.ts", ...]（可选，允许过报，遵循 ADR-016 D1）。
3. 新增纯函数 findTouchesOverlaps(children: ProposedChild[])：对所有子任务两两做 touches 交集（简单集合运算，不做路径通配/归一化，遵循 ADR-016 D1），返回每一对非空交集 { a: title, b: title, files: string[] }。
4. makeDecomposer 中，在首次运行解析出 children 后（幂等重入分支不重新计算，因为不重新 spawn/parse），若 overlaps 非空，调用 core.updateTaskFromInput(task.id, { appendImplementationNotes: [reportText] }, false) 把非阻塞报告附加到 epic 的 implementationNotes。报告格式遵循 ADR-016 D4（advisory，不影响分解/dispatch 流程）；无重叠时不追加任何内容，避免噪音。
5. 扩展 engine-decompose.test.ts：
   - 声明重叠 touches 的两个 children → decompose 后 epic.implementationNotes 含重叠报告；children 仍被创建，epic 仍推进到 awaiting-children（验证非阻塞）。
   - 声明不重叠 touches → 不追加 notes，行为与现状一致。
   - parseProposedChildren 新增用例：正确解析 touches 数组；touches 字段缺失/非法时容错（不丢弃 child，只是没有 touches）。
6. 完成后跑 bunx tsc --noEmit / bun test src/test/engine-decompose.test.ts / bun run check . 确认无回归。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
实现与计划有一处顺序偏差：advisory 的 appendImplementationNotes 写入没有放在计算 overlaps 之后立即执行（计划步骤 4 原文位置），而是移到了最终 phase-advance 的 core.updateTask(...) 调用之后（代码中重编号为步骤 5）。原因：phase-advance 的 updateTask 是整记录覆盖写（spread 一个不含刚追加的 implementationNotes 的旧 task 对象），如果 advisory 写入在它之前，会被这次整记录覆盖写静默清空。修复后顺序：1 幂等检查 → 2 spawn+parse → 2b 计算 overlaps(纯函数,不写入) → 3 创建 children → 4 phase-advance(updateTask 整记录) → 5 advisory 写入(updateTaskFromInput, 仅在此时,仅当 overlaps 非空)。语义/字段/判定规则与 ADR-016 D1/D4 完全一致，只是把'计算'和'写入'两步在时间上分开顺序,不影响行为契约。

bun test --parallel 全量跑出 2 fail + 1 error（cli-milestone-management.test.ts 超时/ShellError、cli-init.test.ts、editor.test.ts 附近输出），与本次改动的文件（decomposer.ts / engine-decompose.test.ts）无关。隔离重跑 bun test src/test/cli-milestone-management.test.ts src/test/cli-init.test.ts src/test/editor.test.ts → 42 pass 0 fail 156 expect()，确认是既有的测试隔离/并行争用类 flaky，非本次改动引入的回归。

bun run check . 首次报出 2 处 biome 格式问题，均在本次新增代码（decomposer.ts 的 formatOverlapReport 数组字面量换行、engine-decompose.test.ts 两处长 expect 链式调用换行），已用 bunx biome check --write 自动修复；复跑 bun run check . / bunx tsc --noEmit / bun test src/test/engine-decompose.test.ts 全部干净（17 pass, 43 expect()）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
按 ADR-016 D1/D4 实现分解正交性 advisory 检查：ProposedChild 新增可选 touches?: string[] 字段（不持久化进创建后的 child Task，只用于分解阶段计算）；新增纯函数 findTouchesOverlaps 对所有兄弟子任务做两两 touches 交集（简单集合运算，无路径通配/归一化）；buildDecomposeBrief 的输出格式说明追加 touches 的可选用法；makeDecomposer 在 children 创建、epic phase 推进到 awaiting-children 之后，若存在非空交集，把一份 advisory 报告（[ADR-016 分解正交性检查] ...）追加进 epic 的 implementationNotes——纯 advisory，不阻塞分解/dispatch，无重叠时不产生任何噪音。

新增/扩展测试（engine-decompose.test.ts）：重叠 touches → 报告出现且 children/phase 正常推进；不重叠 touches → 不追加任何内容；parseProposedChildren 对 touches 字段的解析与容错；findTouchesOverlaps 单元测试。全部 17 个测试通过（43 expect()）。

实现中发现并修复一处顺序 bug：advisory 写入必须放在 phase-advance 的整记录 updateTask 调用之后，否则会被后者的整记录覆盖静默清空——已在代码注释和实现笔记中记录原因。bun test --parallel 全量跑出的 2 fail + 1 error 经隔离重跑确认与本次改动无关（既有 flaky）。bun run check . 首次报出的 2 处格式问题（本次新增代码）已用 biome --write 修复，复跑全绿。
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
