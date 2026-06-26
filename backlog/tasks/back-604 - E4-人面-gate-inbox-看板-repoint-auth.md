---
id: BACK-604
title: 'E4: 人面 — gate-inbox + 看板 repoint + auth'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-06-26 08:40'
labels:
  - 'kind:epic'
  - 'epicd:E4'
dependencies:
  - BACK-602
  - BACK-603
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
建立 human 的主交互面。human 是 **gate owner**，主面是移动优先的 **gate-review inbox**（读 E2 的 gate-event log + 升级问题的异步裁决），而非 kanban；kanban 保留为桌面总览（repoint 到引擎自有 server）。auth 成为引擎自有中间件（in-house）。

三者由引擎自己的 `Bun.serve` 服务：repoint 看板 + 新 gate-inbox + auth。其中**响应式视图 / auth 中间件为通用改进，可上游**。

参考：baime 讨论记录 §6/§15.3 E4；[[dev-workflow-preference]]。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1（E0 完成）之后由 epicd 引擎自驱**；旧 loop-backlog 仍作 soak fallback。本 epic 把 Web 面从"现有 Backlog.md kanban server"切到"引擎自有 Bun.serve"——即 **Web 服务的 host 切换点**（但旧→新 agentic 机制退役仍在 E5）。

## 测试 / build 机制
- **单元测试**：auth 中间件（鉴权/会话/拒绝路径）；gate-inbox 数据层（读 E2 API、裁决写回）。
- **e2e**：沿用现有 `@playwright/test` 框架，新增 gate-inbox 移动视口流程（加载 → 裁决 → 升级）、kanban repoint 后的回归（过滤/拖拽/All Tasks 表格）、auth 登录流程；CI 须把这些纳入（注意现有 CI 已 scope bun test 到 ./src 以排除 Playwright，e2e 须独立 job）。
- **build**：`build:css`（Tailwind v4 CLI）须纳入引擎自有 server 的构建；`bun run build` 全绿；移动优先视图须通过 lighthouse/响应式基本校验。

## Web UI 改进方向（明确化）
1. **kanban repoint**：现有 React + Tailwind v4 UI **原样迁移**到引擎自有 `Bun.serve`，**保留**过滤、拖拽、All Tasks 表格、milestone swimlane 等既有功能，零功能回归；仅换 server host 与 API 基址。board 列须由 pipeline state 派生（承接 E3 输出），不硬编码 Basic/Epic。
2. **gate-inbox（新增，移动优先）**：新路由页面，读 E2 gate-event log API，列出待裁决 gate；支持异步裁决（approve/reject）与"升级问题"；移动优先布局（单列、触控友好）。是否做成 PWA 在 plan 决定。
3. **auth**：引擎自有中间件，包住 kanban + gate-inbox 两条路由；不依赖外部 auth 服务。
4. **通用部分**（响应式视图 / auth 中间件）标注为可回馈上游。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] gate-inbox（移动优先）：读 gate-event log，支持异步裁决/升级问题
- [ ] kanban repoint 到引擎自有 server
- [ ] auth 自有中间件接入
- [ ] 通用 UI/auth 部分可回馈上游
