---
id: BACK-601
title: 'E1: field-registry 与 schema 收敛'
status: 'Epic: Done'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-05 08:48'
labels:
  - 'kind:epic'
  - 'epicd:E1'
dependencies:
  - BACK-600
ordinal: 2000
pipeline_id: execution
phase: done
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
- [x] #1 单一 FieldDescriptor 表驱动 parse/serialize/validate/MCP schema
- [x] #2 role 由树位置派生；仅在需预声明意图时存储
- [x] #3 ADR-005 前提调整为 role 派生/声明
- [ ] #4 通用部分可作为 PR 回馈上游
- [x] #5 per-task 只存结构量 pipeline_id + 裸 phase 名；删除惰性 state 字段；status 显示串 = label(role, phase) 派生；phase/turn/role 不再摩平进持久串
- [x] #6 turn 不 per-task 持久——由 pipelineDef[phase].actor 派生（actor 字段在 E3/BACK-603）；role 由树派生；search-service NormalizedFilters 增按 pipeline_id / phase 过滤；Task 增 refine_log（内嵌，供 E7）；旧 status 串迁移为 parse→phase（role/turn 不迁，派生）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# E1: field-registry 与 schema 收敛 — Epic Decomposition (architect-reviewed)

> 引擎的 decomposer 读下方 **## Sub-Task Decomposition**，每条 entry 建一个 child Basic task。
> 颗粒度纪律（CLAUDE.md）：每个 child ≈ 一个可评审 PR（≤~2000 行），一个 worktree+merge+gate 周期；
> child 内部工作用 Phase→Stage 组织在**其自身 plan 内**，不再拆 task。
> Plan review：drafter + independent architect（grounding 全部核对通过；8 项 fix 已并入：D1 回归守卫入 A+行为级、D2 presence-gating、B1 拆 C、A1 state 覆盖、A2 backfill 覆盖、C1 601.1 边、C2 D 依赖、F2 D 前置内联）。

## 当前分散的字段处理点（survey，file:line 已核对）
D-5 要收敛的重复：今天改一个字段要独立改这些地方：
1. **Parse** — `src/markdown/parser.ts:176-218`（`parseTask`）逐字段手写；引擎字段 pipeline_id:207 / phase:208 / parent_id:209 / dod:210-212 / cap:213 / role:214-217（内联 compound|primitive 校验）。
2. **Serialize** — `src/markdown/serializer.ts:49-76`（`serializeTask`）第二套独立映射，presence 用真值门（`...(task.phase && {phase})`）；引擎字段 :70-75。
3. **Types + role** — `src/types/index.ts`：`Task`(:86-99)、`TaskCreateInput`(:143-168，引擎字段 :165-167)、`TaskUpdateInput`(:170-211，**无**引擎字段)、`roleOf`(:137-141)。
4. **Create/validate** — `src/core/backlog.ts`：`createTaskFromInput`(:975-1079，引擎字段直写 :1068-1070 = 605.7)、`requireCanonicalStatus`(:297-304)、`updateTaskFromInput`(:1689-1708)。注意：`updateTask`(:1093)→`saveTask`→`serializeTask`；decomposer 经 `core.updateTask({...task, phase})`（decomposer.ts:110/143）走 serialize，不走 updateTaskFromInput。
5. **MCP schema** — `src/mcp/utils/schema-generators.ts`：`generateTaskCreateSchema`(:40-149)/`generateTaskEditSchema`(:154-411) 逐字段手写 JSON Schema，`additionalProperties:false`；**引擎字段缺席**。status enum 经 `getStatusFieldEnumValues`(:8-35) 半集中派生（唯一已表驱动的字段，其余的样板）。
6. **搜索过滤** — `src/core/search-service.ts:47-53`（`NormalizedFilters`）仅 statuses/priorities/assignees/labels/modifiedFiles；**无 pipeline_id/phase**。
7. **status↔role/phase 编码** — `backlog/config.yml:2-3`：statuses 每值 `"<Role>: <Phase>"`；但 `src/` 内**无 `label(role,phase)` 投影函数**（grep 确认）。status（canonical、全链路）与引擎 `phase`（仅 `src/engine/*` 读）是两条独立轴。

**Grounding note**：`label()`/`refine_log` 均**不存在**（grep 确认，净新增）。**无持久 `state` 字段**（status 是 canonical，phase 引擎专用）——epic 的"删 state"已由 E0/决策记录消化，E1 不引入第二条持久轴（见 A1）。

## Sub-Task Decomposition

四个新 Basic child（A/B/C/D）+ 既有 601.1 = 五。各映射 ≥1 个 E1 goal；合计覆盖 registry 核心、派生 parse/serialize/validate/create/update、MCP schema、role 派生、搜索过滤、refine_log、status↔phase 投影、backfill。

### 601.1（既有，勿重建）：定义 IssueSource 接口并抽取 LocalIssueSource
- 已是 BACK-601 child，保留。与字段轴**正交**（data-access seam：list/get/upsert over Core，扩 `src/engine/store.ts::makeBoardStore`），非 schema seam。
- **依赖边（C1）**：实现 **∥ A**（601.1 只 transport Task 暴露的字段，不重声明）；但其 AC#3（transport registry-derived schema）**须在 A merge 后验证**。DAG 上 601.1 实现独立、AC#3 收口在 A 后。

### A — field-registry 核心 + 派生 parse/serialize/validate + role 派生 + 引擎字段 reconcile + 搜索过滤 + refine_log 描述符
- **交付**：单 PR 引入唯一 `FieldDescriptor` 表（`{yamlKey,tsName,type,parse,serialize,validate,mcpSchema,present?}` per ADR-011 D-5），把 `parseTask`/`serializeTask` 改为**由表生成**（非手列字段）。折入 `roleOf` 派生（叶⇒primitive/裸 Task、有子⇒compound/Epic）并注册为 `role` 描述符 derive（AC#2）；ADR-005 前提文本从强制 `kind:` label 调整为 role 派生/声明（AC#3）。**Reconcile 已发布的引擎字段**（pipeline_id/phase/parent_id/dod/cap/role）为表中声明实例——表**拥有**它们且 parse/serialize **字节一致**。**折入**（B1）：`NormalizedFilters` 增 pipeline_id/phase 过滤 + 注册 `refine_log` 描述符（二者只是"多注册描述符 + 一处 filter 列表"，属自然 registry 工作）。
- **presence-gating（D2）**：表的 serialize **保留每描述符真值 presence 规则**（空串引擎字段仍**省略** key，与今天 `...(task.phase && …)` 一致），否则破坏字节一致 + 旧 loop parse。
- **Scope**：`src/markdown/parser.ts`、`serializer.ts`、`src/types/index.ts`、新 registry 模块（如 `src/core/field-registry.ts`）、`src/core/search-service.ts`（filter）、ADR-005 文本。Phase→Stage：(1) FieldDescriptor + 注册全字段集（core+引擎+refine_log），逐实例 round-trip 单测；(2) parseTask/serializeTask 改表驱动，语料字节一致；(3) role derive + ADR-005 + 搜索 filter。
- **依赖**：无（基础）。E0/600.7 已 merge。
- **Acceptance（含 D1 行为级回归守卫——本 child 落 reconcile，故守卫在此非 B）**：
  - `bunx tsc --noEmit` && `bun run check .` && `bun run build` 绿。
  - **语料 golden**：parse→serialize 每个现存 `backlog/tasks/*.md` 为 no-op（`git diff --exit-code` on tasks dir）；golden 语料**含一个空引擎字段的 task**（D2）。
  - **行为级回归（D1，非仅静态语料）**：(a) `createTaskFromInput({pipeline_id,phase,parent_id})` 产出的 frontmatter 与 A 前**字节一致**（对合成 task diff）；(b) `updateTask({...loadedTask, phase})` 经 serializeTask round-trip phase 不丢（decomposer 真实路径）；(c) **BACK-605.5 decomposer + BACK-600.10 stage2-gate 套件不改而绿**（`bun test` engine/harness）。
  - 表驱动单测：每声明实例 register+round-trip（role/cap/dod/pipeline_id/phase/parent_id/refine_log）+ roleOf 叶vs复合；`pipeline_id`/`phase` 搜索返回正确子集。
  - 无硬编码 baime 概念：role/cap/dod 是**注册实例**非 `if(field==='cap')`（可评审）。

### B — MCP/CLI schema 由 registry 派生（+ TaskCreateInput/TaskUpdateInput 对称）
- **交付**：单 PR 使 `generateTaskCreateSchema`/`generateTaskEditSchema` **由表的 `mcpSchema` 派生**（取代 ~360 行手写），并扩 `TaskCreateInput`/`TaskUpdateInput` + `createTaskFromInput`/`updateTaskFromInput` 使 registry 字段（含引擎字段）在 create **与** update 两侧一致接受（收口 site 4/3 的 create/update 不对称）。status enum 仍 config 源但走同一表。
- **Scope**：`src/mcp/utils/schema-generators.ts`、`src/mcp/tools/tasks/*`、`src/types/index.ts`（TaskUpdateInput 引擎字段）、`src/core/backlog.ts`（updateTaskFromInput 对称）。
- **依赖**：**A**（需表 + 每描述符 mcpSchema）。
- **Acceptance**：MCP task_create/task_edit schema 校验（现 MCP 契约测试绿）；经 MCP/CLI 带引擎字段建的 task 与 A golden 一致 round-trip（不丢字段）；`bunx tsc --noEmit` && `bun run check .` 绿。

### C — status↔phase 人面投影（label(role,phase)）
- **交付**（B1 拆分后**只此一事**）：单 PR 引入唯一 `label(role, phase)` 投影（config 已在说的 `"<Role>: <Phase>"` 串）作为**status 显示计算的唯一处**，并把 web/CLI/board/status-callback 的显示读指向它——收敛当前隐式的 status-vs-phase 分裂（site 7），使每 task 持久为 `(pipeline_id, 裸 phase)`、status 串**派生**（AC#5）。`turn`/`role` 保持**派生、绝不持久**（turn=pipelineDef[phase].actor，E3 泛化；role 由树）。
- **A1（AC#5 覆盖澄清）**：AC#5 的"删除惰性 state 字段"是 **no-op**（无持久 state 存在，已由 E0/决策记录消化）；C 只加派生投影，不引入第二条持久轴、无"删除"目标。
- **Scope**：新投影 helper（与 registry 同处，单函数）、显示消费点（web/CLI/board/status-callback）。Phase→Stage：(1) label() + 接显示消费点；(2) 显示回归。**Scope 纪律**：E1 只**产出**投影；**E4 消费**（lane 渲染不在 E1）。
- **依赖**：**A**（role derive 供 label）。与 B、D **并行**。
- **Acceptance**：`label(role,phase)` 是唯一 status 显示计算（无残留 `"Basic: "+phase` 拼串，可评审）；web/CLI/board 显示零回归（现 Playwright e2e + status 测试绿）；`bunx tsc --noEmit` && `bun run check .` 绿。

### D — 现存 task 文件的就地幂等 backfill（M1 roadmap）
- **交付**：单 PR 的 **backfill**：对每个现存 `backlog/tasks/*.md`，由 registry default/derive 填空引擎字段——**结构字段** `pipeline_id`/`phase`/`parent_id`/`role`（role 由树位置派生；phase 由现 `status` 经 registry `parse(status)`→裸 phase 映射）。**A2 覆盖**：`dod`/`cap` **不 backfill**——它们是声明式内容非结构默认，缺省即 absent（epic M1 roadmap 列了 dod/cap，此处显式裁定只回填结构字段 + role，dod/cap/turn 不回填并说明）。就地、幂等、并行安全；**不移动/改名**文件；不得破坏旧 loop 读同批文件（向后兼容超集）。CLI 子命令或一次性迁移。
- **F2（前置内联）**：backfill **不得**在旧 loop 与引擎同时持板时跑——经共享板锁（guard#1，已 discharged）验证；这是 D 的操作前置。
- **Scope**：新 backfill 例程（用 601.1 的 list/upsert + A 的 registry 默认）、迁移入口、幂等测试。Phase→Stage：(1) 由 status+树经 registry 派生 task 的引擎字段；(2) 语料幂等 upsert 循环；(3) round-trip + 双跑幂等 + 旧 loop parse 兼容测试。
- **依赖（C2 修正）**：**A**（registry parse + 默认）、**601.1**（list/upsert）。**不依赖 C**（D 只需 A 的 `parse(status)→phase`，非 C 的显示投影）。最后跑。
- **Acceptance（多为 shell 可查）**：backfill 跑两遍产生同一树（第二遍后 `git diff --exit-code`——幂等）；回填后每引擎管理 task 有 `(pipeline_id, phase)` 使引擎 scan（`run.ts` filter `pipeline_id==='execution'`）识别，且旧 parser 仍解析全部（BACK-600..606 + 子任务无损）；单一活动驱动器下运行（F2）；`bunx tsc --noEmit` && `bun run check .` && `bun test` 绿。

## Ordering & dependencies（C2 修正后）
```
        (E0 / 600.7 — merged)
                 │
                 ▼
               [ A ] registry 核心 + parse/serialize + role + reconcile 引擎字段 + 搜索 filter + refine_log
              /  |  \
             ▼   ▼   ▼
          [ B ] [ C ] [ D ]
        MCP/CLI  label   backfill(需 A + 601.1；不需 C)
        schema  投影
                         ▲
                         │
          [ 601.1 ] IssueSource（实现 ∥ A；AC#3 在 A 后验证）→ 供 D 的 list/upsert
```
- **A first**。**B ∥ C ∥ D-start** 均在 A 后；D 收口需 601.1。**601.1 实现 ∥ A**。
- 关键路径缩短为 **A → D**（C2：去掉 D→C 边，C 显示收敛全程并行）。

## Constraints / invariants
- **勿破已发布引擎字段写路径**：605.7 扩了 TaskCreateInput+createTaskFromInput(1068-1070)；605.5 decomposer + 600.10 stage2-gate **依赖**之。A 须让 registry **拥有** pipeline_id/phase/parent_id 且 create/parse/serialize **字节一致**（reconcile，非重写）；回归守卫在 **A** 的 acceptance（D1）。
- **向后兼容超集**：旧 loop 与引擎读**同批** `backlog/tasks/*.md`；不删旧 loop 依赖的字段；backfill 只加不重构。
- **就地/幂等/并行安全 backfill**：不移动/改名；双跑 no-op；不与双活动驱动器同跑（guard#1）。
- **无硬编码 baime 概念**：role/cap/dod/refine_log 为声明式 FieldDescriptor 实例，引擎核无 `if(field==='cap')`（ADR-011 D-5）。
- **presence-gating 保真**（D2）：registry serialize 保留每描述符真值门；空引擎字段仍省 key。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-04 设计裁决（并入本 epic 范围）：实测确认原生 status（全接线）与引擎 state（惰性、仅 Interpreter.scan 读、无 CRUD 写）平行且断裂——是 fork 意外而非设计轴。裁决：只保留 status 为 canonical，删 state，四轴中的 phase/waiting_on/role 由 parse(status) 派生（config 的 Basic:/Epic: 串本就编码了 role+phase+turn）。这把 E1 原有『state 从 status 映射』的回填纪律收紧为『不保留两个字段』。修订 docs/proposals/2026-07-04-multi-lane-issue-list.md §2.3（waiting_on 由存储改为派生）与四轴 state 图。参考 use-case-model.md 漂移表。

2026-07-04 终版修订（超前一条备注）：之前在“更多字段(独立 waiting_on)+更少 status”与“更少字段(status 唯一 canonical)+更多 status”两极摆摆，二者共犯一错：都把 turn 当成必须持久的 per-task 轴。终版：turn=actor(phase) 归 pipeline-data（非 per-task），role 归树，故 per-task 只存 (pipeline_id, 裸 phase)，字段与 status 词汇两者都更少。status 串=label(role,phase) 派生显示。见 proposal §2.3 终版 + workitem-lifecycle-state.puml。PipelineState.actor 泛化在 E3。

2026-07-04 对齐 E0 成果（不改骨架，一条重叠备注）：600.8 交付了 `src/engine/store.ts::makeBoardStore`（TaskStore over Core）——它是 child1 IssueSource（601.1）的**种子**。E1 的 IssueSource 应**扩展**它（加 list/upsert），不另建平行抽象。其余四轴/迁移不变。E1 仍是 dogfood 目标，**待真 worker（BACK-605.1）就位后再由引擎自驱**。

guard#2 (Stage 2 self-host fixpoint) discharge path clarified after BACK-600.10 architect review:
- BACK-600.10 delivers the Stage 2 VERIFIER + self-test (instrument only) — it does NOT by itself clear guard#2.
- guard#2 is discharged ONLY by a recorded 'stage2 passed:true' event from a REAL engine-produced rebuild (soak): engine drives a worker to rebuild the MVD from contracts, then runStage2Fixpoint proves (a) rebuilt tree passes MVD_TEST_FILES AND (b) the rebuilt driver drives a tracer to fixpoint (self-application, not just unit-green — else it's Stage 1 relabeled).
- Therefore E1 dogfood stays blocked on: 600.10 done (instrument) → a passing Stage 2 soak run (evidence). Do NOT treat 600.10-done as guard#2 cleared.

guard#2 (Stage 2 self-host fixpoint) — DISCHARGED 2026-07-04.
A genuine Stage 2 run passed: the MVD (14 engine/harness files) was reconstructed from its contracts (10 MVD_TEST_FILES + tracer + src/types) ALONE, in an isolated cp-proof tree (originals deleted, no git history), by an independent worker. The rebuild is byte-different from the originals (driver 158 / pipeline 49 / decomposer 155 diff lines — genuine reconstruction, not cp). The BACK-600.10 gate (engine stage2-gate CLI) returned PASSED: suite-green (97 tests / 10 files) AND drive-fixpoint (rebuilt driver self-drives engine-tracer-fixpoint). Negative control confirmed the gate is meaningful (sabotaging rebuilt adjudicate() → gate FAILED suite-failed). Recorded to docs/research/gcl-events.jsonl at engine HEAD 6e361dc.
→ E1 hard trust-root gates now all satisfied (guard#1 shared-lock ✅, guard#2 Stage 2 ✅). Remaining before E1 dogfood: E1 needs its own refined epic plan (Sub-Task Decomposition skeleton the decomposer reads) + engine fields (role:compound, pipeline_id:execution, phase:ready).

Sub-Task Decomposition refined via feature-to-backlog (drafter + independent architect). Grounding all verified (file:line accurate). 8 architect fixes applied: D1 regression guard→A behavioral; D2 presence-gating; B1 split C (label-only) folding filters+refine_log into A; A1 state-delete coverage clarified (no persisted state exists); A2 backfill scope (structural fields+role only, dod/cap not backfilled); C1 601.1↔A edge; C2 D deps A+601.1 not C; F2 D single-driver precondition inlined. Children: A(registry core) → B(MCP schema) ∥ C(label projection) ∥ D(backfill, needs A+601.1); 601.1(IssueSource) ∥ A. Ready for engine decompose.

2026-07-05 verification (BACK-628.1 点火): children BACK-609/610/611/612 全 Basic:Done。独立复核(非自证)：src/core/field-registry.ts 存在,含 FIELD_DESCRIPTORS/parseFields/serializeFields/label()/displayStatus() 真实实现(非 stub);bun test src/test/field-registry* 42/42 pass;bunx tsc --noEmit 干净;search-service.ts 含 pipeline_id/phase 过滤;refine_log 字段存在。AC#1/2/3/5/6 核实满足并勾选。AC#4(通用部分回馈上游)未做,已拆分为独立低优先级任务(不阻塞本 epic 收口)。

2026-07-05: phase corrected done→ (via BACK-628.1). Prior 'needs-human' was leftover bookkeeping from the BACK-622 decomposer status/phase desync bug (already fixed, see commit c6391a3's own note: 'escalated to needs-human by hand pending BACK-622's fix'). Since BACK-622 is Done and children verified Done+working, epic closed.

2026-07-05 收口：先前的 'Epic: Needs Human' 是 BACK-622 bug（decomposer status/phase 脱节）修复前的历史性人工修正（commit c6391a3），发生在 601.1/609-612 完成之前。现全部 5 个 child（601.1/609/610/611/612）均 Basic: Done；用 bun run cli engine evaluate BACK-601 走真实引擎聚合（非手工改 phase）重新求值 → phase=done，status 经 BACK-627 的派生逻辑自动同步为 'Epic: Done'。E1 收口。
<!-- SECTION:NOTES:END -->
