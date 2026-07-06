---
id: BACK-663
title: 废弃旧 Draft 实体，折叠进 authoring/draft phase
status: 'Basic: Draft'
assignee:
  - '@claude'
created_date: '2026-07-06 09:51'
labels: []
dependencies: []
priority: high
ordinal: 81000
pipeline_id: authoring
phase: draft
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
废弃旧 Draft 实体（backlog/drafts/*.md，DRAFT-N id 空间，独立 draft CLI 命令族/Web /drafts 页面），把其语义完全折叠进 Task 的 authoring/draft phase（`pipeline_id=authoring, phase=draft`，见 docs/task-lifecycle-model.md §3）。这是一次接受破坏性变更的决定：外部消费 `backlog draft ...` CLI 的脚本/agent 会断，已确认接受（见任务讨论）。

## 背景
docs/task-lifecycle-model.md 自称是任务生命周期的唯一权威参考，但完全没提旧 Draft 实体——造成 DRAFT-16 在 Web All Tasks 页面不可见时无法用该文档定位问题根因。旧 Draft 实体与 authoring/draft phase 语义完全重叠（"一个想法还没被人类 gate 进正式执行"），维护两套并行机制是历史遗留，不是设计意图。

## 范围（Explore 扫描结果，~1500-1800 行）
- CLI：`src/cli.ts:3007-3230` draft 命令族（list/create/archive/promote/view/edit），`task create --draft`/`task demote`
- Core/filesystem：`src/core/backlog.ts`、`src/file-system/operations.ts`、`src/utils/task-path.ts` 的 draft CRUD；`src/core/prefix-migration.ts` 整个文件
- Server：`src/server/index.ts` 的 `/api/drafts*` 路由与 handler
- Web：`src/web/components/DraftsList.tsx`（整文件）、侧边栏入口、`App.tsx`/`Statistics.tsx`/`TaskDetailsModal.tsx` 的 draft-mode 分支
- 测试：`mcp-drafts.test.ts`、`draft-create-consistency.test.ts`、`prefix-migration.test.ts`（整删），约 25 个共享测试文件里的 draft 断言（精简）
- 文档：`CLI-INSTRUCTIONS.md`、`src/guidelines/*` 的 draft 工作流说明

## 不动点（本任务不得破坏的既有事实——实现前后必须继续成立）
1. **单一递归 Task**：折叠后不引入第二个"Draft"类型或字段；authoring/draft phase 就是 Task 的一个 `(pipeline_id, phase)` 值，不得给 Task 加 `isDraft`/`draftFields` 之类的旁路字段。
2. **phase 是唯一进度真值**：不得新增 status→phase 反向同步（`Core.updateTask` 现有单向 phase→status 同步保持不变，见模型 §4）。
3. **Doc/Decision 实体不受影响**：本任务只处理 Draft，不动 `backlog/docs/`、`backlog/decisions/` 的独立实体机制——那两者与 authoring pipeline 无关，不在折叠范围内。
4. **现有 authoring pipeline 定义不变**：`src/engine/pipeline.ts` 的 `draft(machine)→refining(machine)→backlog(human)` 三态本身不改，本任务只是让旧 Draft 数据/入口改道过去，不改 pipeline 语义。
5. **已完成的 Web pipeline 泳道视图（BACK-644/648）不回归**：`authoring` 泳道展示保持工作，迁移后的任务必须能在其中正确出现（这是验收标准之一，见下）。
6. **迁移是数据保真的**：16 个现存 draft 文件的标题/正文/created 时间/其它 frontmatter 字段必须原样保留，只改 id 空间（DRAFT-N → 新 BACK-N）和结构字段（新增 pipeline_id/phase，去掉 draft 专属字段），不得丢内容。
7. **不做部分废弃**：CLI/Server/Web/测试/文档五处要么在本 task 内一起完成，要么都不动——不允许留下"CLI 已删但 Web 还在读旧路径"这种半态（阶段内部可以分 Phase 顺序做，但 PR 合并时必须是完整闭环）。

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

- [ ] #1 docs/task-lifecycle-model.md 显式收编旧 Draft 实体：声明其被 authoring/draft phase 取代，写明 7 条不动点
- [ ] #2 backlog/drafts/ 下现存全部 draft 文件（含 DRAFT-16）一次性迁移为 pipeline_id=authoring phase=draft 的 Task，标题/正文/created 时间零丢失
- [ ] #3 迁移后的任务在 Web All Tasks 页面的 authoring 泳道下可见（复现并关闭本次 DRAFT-16 不可见的原始问题）
- [ ] #4 backlog draft 命令族（list/create/archive/promote/view/edit）、/api/drafts* 路由、DraftsList.tsx、侧边栏 Drafts 入口全部移除，无死代码残留
- [ ] #5 task create --draft 与 task demote 改为对 authoring/draft phase 操作，不再依赖 backlog/drafts/ 目录
- [ ] #6 3 个 draft 专属测试文件删除，~25 个共享测试文件里的 draft 断言更新为 authoring/draft phase 语义，bun test --parallel 全绿
- [ ] #7 CLI-INSTRUCTIONS.md 与 src/guidelines/* 的 draft 工作流说明更新为 authoring/draft phase 用法
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 手动验证：backlog draft 任意子命令均报错/不存在，Web 无 /drafts 路由可达
<!-- DOD:END -->
