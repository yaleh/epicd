---
id: BACK-608
title: 'E7: Authoring 引擎 — RefineStrategy + refine driver + 状态式 draft'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-07-04 01:58'
updated_date: '2026-07-04 02:19'
labels:
  - 'kind:epic'
  - 'epicd:E7'
dependencies:
  - BACK-601
  - BACK-603
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
建立与 E0（执行引擎）**对称**的第二条引擎：**authoring**。工作项从 capture 经 refine（按 `kind` 路由）到 promote gate，落成 baime loop-draft 的**状态式 draft** 机制，退役 Backlog.md 的目录式 draft。

authoring 与 execution 共用两条只读契约（IssueSource 数据面 · Coordinator 运行时面），并复用 E0 的 interpreter/pipeline-as-data 机制（authoring 是又一条 pipeline，加它不改 core）。

范围：
- **RefineStrategy 注册表**：`kind`（feature/chore/epic）选一个**纯**策略；`step(task, artifacts) → RefineStep`，re-entrant、无内存态；cursor 由 `project(artifacts)` **派生**，不持久。加新 kind（如 inquiry/study）= 注册一个策略。
- **RefineStep 词汇**（统一，driver 执行）：`produce / review / promote / escalate`（revise 折进 produce）。
- **refine driver（RefiningHandler，注册于 authoring:Refining）**：执行 RefineStep — spawn author/reviewer worker、把 reviewer 裁决作为 `Reviewed` 条目 **append 进 `Task.refine_log`**（内嵌，E1 提供字段）、把 promote/escalate 翻成 `status`(phase+waiting_on) 写入；in-flight 去重与崩溃安全**复用执行面 claim 通道**（Coordinator）。
- **状态式 draft 取代目录式**：draft 成为 authoring pipeline 的 **state**（`Draft→Refining→Backlog`），退役 `drafts/` 目录与 `promoteDraft` 移文件（仅按 public CLI/MCP 契约纪律处理兼容）。

非目标：执行引擎（E0）· 人面 UI（E4，仅消费 refine 进度）· gate-event 富语义（E2）· 自治（E6）。

设计依据：docs/proposals/2026-06-29-authoring-as-pipeline.md · docs/proposals/2026-07-04-multi-lane-issue-list.md §2.3 · docs/uml/authoring-refine-class.puml · docs/uml/architecture-class-skeleton.puml · ADR-011 D-1.1/D-2。

驱动节点：M1（E0 完成）后由 epicd 引擎自驱；soak 期 authoring 由 baime loop-draft 跑，本 epic 用同一 IssueSource/Coordinator 契约替换其 authoring 侧，展示面（E4）不受影响。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 RefineStrategy 接口 + feature/chore/epic 三实现；step(task, artifacts) 纯且 re-entrant；cursor 由 project(artifacts) 派生、不持久（单测可用伪造日志驱动，无需 harness）
- [ ] #2 RefineStep 词汇（produce/review/promote/escalate）+ refine driver 执行；reviewer 裁决作为 Reviewed 条目 append 进内嵌 Task.refine_log，driver 读日志分支（approved→下一产物/promote，changes_requested→produce vN+1，round>cap→escalate）
- [ ] #3 状态式 draft：draft 为 authoring pipeline 的 state（Draft→Refining→Backlog）；目录式 drafts/ 与 promoteDraft 退役，且不破坏已文档化的 CLI/MCP 契约
- [ ] #4 耦合纪律：加新 kind（如 inquiry）仅注册一个 RefineStrategy，diff 不触碰 refine driver/interpreter/状态机
- [ ] #5 authoring 与 execution 共用 IssueSource + Coordinator 契约；refine 细进度（review cycle N）经 Coordinator 运行时事实呈现，不新增 pipeline state
- [ ] #6 in-flight 去重与崩溃安全复用 claim 通道：step 的 append 为提交点，claim 超时则 step 幂等重发（最坏重跑一次 worker）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-04 终版对齐：turn 不 per-task 存（proposal §2.3 终版）。refine driver 写的是下一个 phase：promote→Backlog phase（actor=human）、escalate→needs-human phase；actor 由 authoring pipeline-data 定，不写 waiting_on。RefineStep 词汇不变；driver 把 promote/escalate 翻成 phase 迁移而非 turn 写入。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
