---
id: BACK-601
title: 'E1: field-registry 与 schema 收敛'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-04 03:48'
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
<!-- AC:BEGIN -->
- [ ] #1 单一 FieldDescriptor 表驱动 parse/serialize/validate/MCP schema
- [ ] #2 role 由树位置派生；仅在需预声明意图时存储
- [ ] #3 ADR-005 前提调整为 role 派生/声明
- [ ] #4 通用部分可作为 PR 回馈上游
- [ ] #5 per-task 只存结构量 pipeline_id + 裸 phase 名；删除惰性 state 字段；status 显示串 = label(role, phase) 派生；phase/turn/role 不再摩平进持久串
- [ ] #6 turn 不 per-task 持久——由 pipelineDef[phase].actor 派生（actor 字段在 E3/BACK-603）；role 由树派生；search-service NormalizedFilters 增按 pipeline_id / phase 过滤；Task 增 refine_log（内嵌，供 E7）；旧 status 串迁移为 parse→phase（role/turn 不迁，派生）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Epic Plan (骨架) — E1 field-registry 与 schema 收敛（数据面）

> 本骨架只钉 child 边界与时序（设计制品，像 E5）。**decompose（真正建 children）留给 M1 后引擎自驱——E1 是 M1 dogfood 的第一个 epic，手工拆会抢掉 dogfood。** 设计锚点：proposal `docs/proposals/2026-07-04-multi-lane-issue-list.md` §2.3；state 图 `docs/uml/workitem-lifecycle-state.puml`；class 图 architecture-class-skeleton / presentation-class。

### Background
E1 把字段处理收敛为**单一 FieldDescriptor 表**，并落四轴终版的**数据面**。**引擎内部 slice（`state`→裸 `phase`、`actionable`→`actor`）已提前抽进 600.7（E0）**，因 600.4 driver 需先建于其上。E1 剩：人面 `status`↔`phase` 全量迁移、field-registry 统一、role 派生、IssueSource（601.1）、就地回填。

### Goals（映射 AC）
1. 单一 FieldDescriptor 表驱动 parse/serialize/validate/MCP schema — AC#1
2. role 由树位置派生 — AC#2
3. ADR-005 前提调整为 role 派生/声明 — AC#3
4. 通用部分可回馈上游 — AC#4
5. per-task 只存 pipeline_id + 裸 phase；删惰性 state；status = label(role,phase) 派生 — AC#5
6. turn 不存（actor 派生）；search 加 pipeline_id/phase 过滤；Task 加 refine_log；旧 status→phase 迁移 — AC#6

### Sub-Task Decomposition（child 边界）
1. **IssueSource（BACK-601.1，已存）** — `list/get/upsert` + LocalIssueSource；存储无关数据源。
2. **FieldDescriptor registry** — 单表驱动 parse/serialize/validate/MCP schema（AC#1）；role 由树派生（AC#2）；ADR-005 前提调整（AC#3）；通用可上游（AC#4）。取代当前 ≥5 处分散逻辑。
3. **status↔phase 人面迁移** — `label(role, phase)` 投影；web/CLI/board/回调改读派生 status；收敛现有重复 ~4 处 status 启发式为单一投影（AC#5 人面侧）。**承 600.7 引擎 slice**；**与 E4 分工**：E1 出投影/数据面，E4 用于多车道 UI。
4. **search 过滤 + refine_log 字段** — NormalizedFilters 加 pipeline_id/phase（AC#6）；Task schema 加 refine_log（内嵌，供 E7）。
5. **就地回填迁移** — 现有 `backlog/tasks/*.md` 回填 `pipeline_id`/`phase`（role/turn 派生），**幂等、就地、不搬目录、不破坏旧 loop 读取**；须在**单一活动驱动器**下跑（M1 跨机制锁纪律，见本 epic 描述"M1 边界纪律"§1）。

### Sequencing
600.7（E0 引擎 slice）→ child2（FieldDescriptor）→ child3（status↔phase 迁移，需 600.7+child2）‖ child4（search+refine_log）→ child5（回填，最后、单一驱动器下）。child1（IssueSource）可与 child2 并行。

### Constraints
- 600.7 已做引擎内部 phase/actor；E1 **不重复**引擎 slice，只做人面全量迁移 + registry + 回填。
- 与 E4 分工：E1 出 `label()` 投影 + 数据面过滤；E4 消费之做多车道 UI/驱动者指示。refine_log 字段 E1 加、E7 用。
- role 派生自树，仅在需预声明意图时存。
- 回填绝不在旧 loop 与引擎同时活动时跑（M1 跨机制锁）；不搬家、不换目录（向后兼容超集）。
- **decompose（建 children）= M1 后引擎自驱的 dogfood 目标**；本骨架仅设计，不建 children。若 pre-M1 需手工拆，须显式承认那不是 dogfood。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-04 设计裁决（并入本 epic 范围）：实测确认原生 status（全接线）与引擎 state（惰性、仅 Interpreter.scan 读、无 CRUD 写）平行且断裂——是 fork 意外而非设计轴。裁决：只保留 status 为 canonical，删 state，四轴中的 phase/waiting_on/role 由 parse(status) 派生（config 的 Basic:/Epic: 串本就编码了 role+phase+turn）。这把 E1 原有『state 从 status 映射』的回填纪律收紧为『不保留两个字段』。修订 docs/proposals/2026-07-04-multi-lane-issue-list.md §2.3（waiting_on 由存储改为派生）与四轴 state 图。参考 use-case-model.md 漂移表。

2026-07-04 终版修订（超前一条备注）：之前在“更多字段(独立 waiting_on)+更少 status”与“更少字段(status 唯一 canonical)+更多 status”两极摆摆，二者共犯一错：都把 turn 当成必须持久的 per-task 轴。终版：turn=actor(phase) 归 pipeline-data（非 per-task），role 归树，故 per-task 只存 (pipeline_id, 裸 phase)，字段与 status 词汇两者都更少。status 串=label(role,phase) 派生显示。见 proposal §2.3 终版 + workitem-lifecycle-state.puml。PipelineState.actor 泛化在 E3。
<!-- SECTION:NOTES:END -->
