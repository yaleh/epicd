---
id: BACK-601
title: 'E1: field-registry 与 schema 收敛'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-06-26 09:12'
labels:
  - 'kind:epic'
  - 'epicd:E1'
dependencies:
  - BACK-600
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把字段处理收敛为**单一描述符表**（field-registry）：`parse / serialize / validate / TaskCreateInput / TaskUpdateInput / MCP schema` 全部由它派生，取代当前 ≥5 处分散逻辑。baime 概念（role、cap、结构化 DoD、扩展字段）作为该机制的**声明实例**注册，引擎不硬编码。

包含 `role` 派生规则（叶子⇒裸 Task、有子⇒Epic）落地，以及 ADR-005（`kind:` label）前提调整为 role 派生/声明。该层为**通用改进，可上游**。

参考：ADR-011 D-5/D-6；baime 讨论记录 §15.3 E1。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1（E0/BACK-600 完成）之后由 epicd 引擎自驱**（dogfood），不再由人工推进；旧 loop-backlog 仅作 soak 期 fallback。本 epic **不**触发旧→新机制的正式退役（退役/M2 发生在 E5/BACK-605）。field-registry 是底层重构，须在引擎自驱链路上验证 schema 派生不破坏既有 task 读写。

## 横切迁移：M1 时回填路线图 task 到引擎 schema（本 epic 认领）
§9「迁移横切各 epic」落到本 epic（字段层是回填的天然归属）：
- **背景**：schema 是**超集**，引擎读**同一批** `backlog/tasks/*.md`；E0 由旧 loop 建、产出的子任务（如 BACK-600.x）也生在旧格式里。引擎要在 M1 后自驱 E1–E6，这些 task 文件必须带上引擎字段。
- **要求**：本 epic 须提供**就地回填**机制——为现有 task 文件回填空的引擎字段（`pipeline_id` / `state` / `role` / `parent_id` / `dod` / `cap`），由 field-registry 的 default/derive 规则驱动（role 由树位置派生，state 从现有 status 映射）。
- **纪律（不可硬迁移）**：回填**就地、幂等、可并行**——旧 loop 与引擎读同一批文件，回填不得破坏旧 loop 对这些文件的读取（向后兼容超集）。**不搬家、不换目录**。
- **验收**：现有 backlog/tasks/ 全量回填后，旧 loop-backlog 仍能解析、引擎也能按 `(pipeline,state)` 识别；BACK-600..606 + 其子任务往返无损。

## M1 边界纪律（前置守卫）— 本 epic 是第一个被引擎自驱的 epic，故在此钉死边界
检查 BACK-600 子任务（600.4/600.5/600.6）后确认以下四点**未被 E0 覆盖**，本 epic 在依赖引擎自驱前必须把它们当前置守卫：

1. **跨机制并发锁（问题 1，安全必修）**：600.5 的 merge 锁是**引擎进程内**的（`proper-lockfile`，明示不做分布式锁）；旧 loop 用 `.merge-lock`/`.caps`/`.active-agents` 簿记。**两套锁不同名 ⇒ 旧 loop 与引擎可同时 advance 真板上同一 task = 损坏库**。守卫：M1 后引擎与旧 loop **必须共享同一把板级锁**（引擎的锁文件路径与旧 loop 的 `.merge-lock` 对齐），或把 soak fallback 钉为**冷备**（引擎在跑时旧 loop 不得起，单一活动驱动器）。本 epic 的回填**绝不能**在旧 loop 与引擎同时活动时跑。
2. **Stage 2 fixpoint 前置（问题 2，信任根必修）**：600.6 的 "fixpoint" 只是**驱动收敛幂等**（跑两遍第二遍 no-op），**不是** §15.1 的 Stage 2「MVD 重建 MVD（复现自身构造、过同套件）」。在 Stage 2 自托管 fixpoint 未通过前，引擎驱动 E1 属"用未验证驱动器跑真实路线图"。守卫：本 epic（及其后所有引擎自驱 epic）开跑前，须确认 Stage 2 fixpoint 已作为 M1 宣布的显式 gate 通过；若 E0 未补此 gate，本 epic 须在 plan 标记为阻塞前提。
3. **自指板隔离（问题 4）**：epicd 真板包含引擎自己的创世记录（BACK-600 及其子任务）；引擎将操作记录其自身起源的文件。sandbox 与真板隔离须滴水不漏，回填只在真板、sandbox 跑 tracer——二者**绝不串台**。（与上文"横切迁移"纪律联动。）
4. **M1/E5/M2 软边界（问题 5，澄清）**：M1 = 引擎自驱**引擎自身**（本 epic 起）；M2 = baime 采用引擎（E5 后）。E5 的"可移植性验收"在 M1 阶段只能用**合成空 repo** 验，**真实证明在 M2**（baime 实迁）。本 epic 须在 plan 承认：M1 内的合成验收 ≠ M2 真实验收，二者不可互相冒充。

## 测试 / build 机制
- **单元测试**：FieldDescriptor 表驱动的 parse/serialize/validate 往返；每个声明实例（role / cap / 结构化 dod / 扩展字段）各有注册与往返用例；回归现有 task 解析测试；**回填迁移的幂等性测试**（重复回填不改变结果）。
- **e2e**：纯数据层，无新增 e2e；但须保证现有 Playwright e2e（@playwright/test）不回归。
- **build**：`bunx tsc --noEmit`、`bun run check .`（Biome）、`bun run build` 全绿；MCP schema 由 registry 派生后须通过 MCP 契约校验。

## Web UI 改进方向
本 epic **不新增 UI**。但 MCP/CLI schema 由 registry 派生 ⇒ Web UI 的 task 表单、详情页字段须与新描述符表同步；验收须确认现有 kanban / task 详情页 / All Tasks 表格视图字段读写零回归。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] 单一 `FieldDescriptor` 表驱动 parse/serialize/validate/MCP schema
- [ ] role 由树位置派生；仅在需预声明意图时存储
- [ ] ADR-005 前提调整为 role 派生/声明
- [ ] 通用部分可作为 PR 回馈上游
