---
id: BACK-626.1
title: 编写"分解正交性检查清单" ADR/方法论文档
assignee:
  - '@claude'
created_date: '2026-07-05 03:41'
updated_date: '2026-07-06 03:46'
labels: []
dependencies: []
parent_task_id: BACK-626
ordinal: 37000
pipeline_id: execution
phase: done
parent_id: BACK-626
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
在 docs/adr/ 新增一份 ADR（或在 docs/ 下新增方法论文档，视现有 ADR 编号规范而定，建议编号 ADR-017），把"分解正交性检查清单"固化为可执行规范，供后续 decomposer.ts 实现与未来 ADR 撰写引用。

背景：ADR-015（docs/adr/ADR-015-monitor-as-invocation-adapter.md）已经给出一个具体的正交性验收范式——swap-litmus（引擎输出必须能同时驱动 Monitor 座位或裸 claude -p，零改动）。本任务把这个范式推广为通用规则，而不是每次都临时发明。

本任务是纯文档工作，不改动代码。后续两个子任务（decomposer.ts 落地、cochange 原型迁移）依赖本文档定义的字段名、判据和执行强度，因此需先完成。

ADR/文档需要覆盖的内容：
- 问题陈述：为什么"分解非正交"是一个值得系统检查的失败模式（引用 BACK-614→ADR-015→BACK-625 链条和 baime TASK-206→210 daemon 传奇作为具体案例，不需要重新调研，可直接引用这两条已知案例）
- 检查清单的信号来源，按成本递增排序：
  1. 声明式重叠：子任务需声明一个 `touches`（涉及的文件/模块路径）字段，兄弟子任务间做交集检查
  2. 历史 cochange 近似：用 git 历史里文件共同修改频次近似耦合强度（为后续 cochange 原型迁移任务预留接口约定，只需在本文档中定义清楚这一信号的输入输出契约，不需要实现）
  3. 语义相似度（可选，按需触发，非默认）
- 执行强度：advisory（非阻塞），结果附加在 epic 上供人工在 dispatch 前查看，不作为 DoD 硬门禁
- ADR 边界决策的强制小节：任何划分组件边界的 ADR，正文必须包含一条 swap-litmus 式验收标准
- 落地顺序说明（本 ADR 之后依次是 decomposer.ts 门禁、cochange 信号迁移），并链接到 BACK-626 及其子任务
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 新增的 ADR/方法论文档存在于 docs/adr/ 或 docs/ 下，遵循现有 ADR 的格式规范（frontmatter、编号）
- [x] #2 文档明确定义 touches 字段的语义和交集检查规则，可被 decomposer.ts 实现直接引用
- [x] #3 文档明确定义 cochange 信号的输入输出契约（不要求实现），供后续迁移任务对齐
- [x] #4 文档明确本机制为 advisory 而非阻塞门禁，并说明理由
- [x] #5 文档要求未来划分组件边界的 ADR 必须包含 swap-litmus 式验收标准，并给出至少一个示例
- [x] #6 文档引用 ADR-015、BACK-625、BACK-622/BACK-601 作为具体案例支撑
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 新增 docs/adr/ADR-016-decomposition-orthogonality-checklist.md，沿用 ADR-015/013 的 frontmatter 与分节约定（Context/Decision(D1..)/Consequences/Alternatives Considered/References）。
2. frontmatter: adr:"016", title, status: Proposed, date: 2026-07-05, applies-to: [src/harness/decomposer.ts, docs/adr/**], enforcement: semantic, stage: [proposal, plan], lint: null, depends-on: ["ADR-015"], realized-by: BACK-626.1/.2/.3。
3. Context：引用 BACK-614→ADR-015→BACK-625 链条与 baime TASK-206→210 daemon 传奇作为具体案例，论证"分解非正交"是可系统检查的失败模式。
4. Decision:
   - D1: touches 字段语义（子任务声明涉及文件/模块路径）+ 兄弟任务两两交集规则（供 BACK-626.2 实现）
   - D2: 三级信号，按成本递增：声明式重叠（touches）/ 历史 cochange 近似 / 语义相似度（可选，非默认，按需人工触发）
   - D3: cochange 契约——输入（仓库路径 + touches 文件列表）→ 输出（文件对耦合分值 + 阈值），作为 BACK-626.3 实现的接口约定
   - D4: 执行强度 = advisory，只在 epic 上附加报告，不阻塞 dispatch、不计入 DoD，并说明理由（误报代价 > 漏报代价，漏报由已有的 repeated-fix/crystallization 信号兜底）
   - D5: 把 ADR-015 的 swap-litmus 推广为强制小节——任何划分组件边界的未来 ADR 必须包含一条 swap-litmus 式验收标准，给出示例
5. Consequences：BACK-626.2/.3 的实现义务；未来划边界的 ADR 必须加 swap-litmus 小节。
6. Alternatives Considered：阻塞式门禁（否决，误报代价过高）、语义相似度作为默认层（否决，成本过高）、只依赖事后 repeated-fix 检测（否决，这正是本 ADR 要提前拦截的失败模式）。
7. References：ADR-015、BACK-625、BACK-622/BACK-601、baime task-148、baime TASK-206-210。
8. 写完后自查 6 条验收标准是否逐一满足，再执行 finalization。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR-016 已写入 docs/adr/ADR-016-decomposition-orthogonality-checklist.md。bunx biome check 对该 .md 路径报 'no files processed'（biome 配置不处理 markdown，符合预期，纯文档任务无 TS/格式改动）。bun run check . 报的 10 条 warning 均在 src/test/test-helpers.ts 等既有文件，与本任务无关，未触碰。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
新增 docs/adr/ADR-016-decomposition-orthogonality-checklist.md，把"分解正交性检查清单"固化为可执行规范。

**核心内容**：
- Context 引用两条已发生的具体漂移链条作为动机：epicd 的 BACK-614→ADR-015→BACK-625（Monitor/prompt-authoring 边界反复重划）与 baime TASK-206→210（daemon 生命周期反复局部修复，最终溶解重构）。
- D1：子任务 touches 字段语义 + 兄弟任务两两交集检查规则，供 BACK-626.2 直接实现。
- D2：三级信号分层（声明式重叠 / 历史 cochange 近似 / 语义相似度），按成本递增，只有前两层默认启用。
- D3：cochange 信号的输入输出契约（仓库路径+touches → 文件对耦合分值+阈值），不规定具体实现，供 BACK-626.3 对齐。
- D4：执行强度定为 advisory，非阻塞门禁，并给出误报代价>漏报代价、漏报有 repeated-fix 兜底两条理由。
- D5：把 ADR-015 的 swap-litmus 验收范式推广为强制小节——未来任何划分组件边界的 ADR 必须包含一条 swap-litmus 式判据，并给出示例格式。

**测试**：纯文档任务，无代码改动。`bunx tsc --noEmit` 通过（EXIT 0）；`bunx biome check` 对 .md 路径按预期报 "no files processed"（biome 配置不处理 markdown）；`bun run check .` 报的既有 10 条 warning 均在未触碰的文件（如 src/test/test-helpers.ts），与本任务无关。

**后续**：BACK-626.2（decomposer.ts 落地 touches 交集检查）与 BACK-626.3（cochange 原型迁移）现在有了明确的字段名/契约/执行强度可以对齐，不应偏离本 ADR 自行发明规则。
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
