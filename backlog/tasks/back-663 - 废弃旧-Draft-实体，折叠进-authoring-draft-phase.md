---
id: BACK-663
title: 废弃旧 Draft 实体，折叠进 authoring/draft phase
status: 'Basic: Backlog'
assignee:
  - '@claude'
created_date: '2026-07-06 09:51'
updated_date: '2026-07-06 09:57'
labels: []
dependencies: []
priority: high
ordinal: 81000
pipeline_id: authoring
phase: backlog
dod:
  - text: >-
      bun test src/test/draft-to-authoring-migration.test.ts
      src/web/lib/lanes.test.ts
    checked: false
  - text: grep -q "authoring/draft" docs/task-lifecycle-model.md
    checked: false
  - text: '[ -z "$(ls -A backlog/drafts 2>/dev/null)" ]'
    checked: false
  - text: >-
      bun test src/test/cli-draft-removed.test.ts
      src/test/server-drafts-removed.test.ts
    checked: false
  - text: >-
      ! grep -rq "listDrafts\|promoteDraft\|archiveDraft\|EntityType.Draft"
      src/cli.ts src/core/backlog.ts src/file-system/operations.ts
      src/server/index.ts src/types/index.ts
    checked: false
  - text: '! test -f src/web/components/DraftsList.tsx'
    checked: false
  - text: '! test -f src/core/prefix-migration.ts'
    checked: false
  - text: bun test --parallel
    checked: false
  - text: '! grep -rq "backlog draft " CLI-INSTRUCTIONS.md src/guidelines'
    checked: false
  - text: bun test
    checked: false
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
  - text: '! bun src/cli.ts draft --help'
    checked: false
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: 废弃旧 Draft 实体，折叠进 authoring/draft phase

## Background
docs/task-lifecycle-model.md 自称是任务生命周期的唯一权威参考（CLI/TUI/Web 三个界面都应指向它），但完全没有提到 stock backlog.md 自带的 Draft 实体（`backlog/drafts/*.md`、`DRAFT-N` id 空间、独立 `draft` CLI 命令族、Web `/drafts` 页面）。这个空白不是无害的：排查 DRAFT-16 在 Web "All Tasks" 页面不可见时，无法靠这份"唯一权威文档"定位问题——因为 Draft 实体根本不在模型的管辖范围内。同时，Draft 实体的语义（"一个想法还没被人类 gate 进正式执行"）与新模型里 authoring pipeline 的 `draft(machine)` phase 完全重叠，维护两套并行机制是历史遗留（Draft 实体先于四轴模型存在），不是设计意图。继续维护两套会持续制造类似 DRAFT-16 这样的认知/工具断层。

## Goals
1. `docs/task-lifecycle-model.md` 显式收编旧 Draft 实体：写明它被 authoring/draft phase 取代，并列出折叠过程中不得破坏的不动点。
2. `backlog/drafts/` 下现存的全部 draft 文件（含 DRAFT-16）一次性迁移为 `pipeline_id=authoring, phase=draft` 的 Task，标题/正文/created 时间等内容零丢失，可通过对比迁移前后文件验证。
3. 迁移后的任务能在 Web "All Tasks" 页面的 `authoring` 泳道下正确显示（这是关闭本次 DRAFT-16 不可见问题的验收标准）。
4. 移除独立的 Draft 实体表面：CLI `draft` 命令族（list/create/archive/promote/view/edit）、`/api/drafts*` 路由、`DraftsList.tsx`、Web 侧边栏 "Drafts" 入口，均不再存在，且无死代码残留（可用 grep 验证）。
5. `task create --draft` 与 `task demote` 改为直接对 authoring/draft phase 的 Task 操作，不再依赖 `backlog/drafts/` 目录或 `EntityType.Draft`。
6. 全部测试套件（`bun test --parallel`）在移除/更新 draft 相关测试后保持全绿。
7. `CLI-INSTRUCTIONS.md` 与 `src/guidelines/*` 里的 draft 工作流说明更新为 authoring/draft phase 用法，不再引用已删除的命令。

## Proposed Approach
把 Draft 实体的持久化形态从"独立目录 + 独立 id 前缀 + 独立文件解析路径"收敛为"Task 的一个 `(pipeline_id, phase)` 取值"，复用已有的 promote/demote 转换逻辑（`Core.promoteDraft`/`Core.demoteTask`，`src/core/backlog.ts`）作为迁移与新语义实现的基础，而不是另起一套转换代码。具体分两条主线：

- **数据迁移**：写一次性脚本，把每个 `backlog/drafts/*.md` 转成 `backlog/tasks/*.md`（新分配 Task id，写入 `pipeline_id: authoring`、`phase: draft`，去掉 draft 专属 frontmatter 字段），在本仓库实际执行，替换掉现有的 `backlog/drafts/` 目录内容。
- **表面收敛**：删除 CLI/Server/Web 三处独立的 Draft 表面代码，把它们的功能需求（"创建一个未定稿的想法" "把想法提升为正式任务"）改路由到 Task 的 authoring pipeline 操作上（`task create`（默认已经是 `pipeline=authoring phase=draft`）、`task edit --phase refining/backlog` 做提升）。测试与文档跟随代码改动同步更新，不允许留下半态。

四轴模型本身（`src/engine/pipeline.ts` 的 pipeline 定义、`role`/`actor`/`active` 派生规则）不改，Web 已完成的 pipeline 泳道视图（BACK-644/648）不改——本提案只是把 Draft 数据的入口改道到这套已有机制上。

## Trade-offs and Risks
- **接受的破坏性变更**：这是本仓库对外发布的 `backlog.md` npm 包的公开 CLI 表面变更，任何依赖 `backlog draft ...` 的外部脚本/agent 会断。已与任务发起人确认接受此风险，不做过渡期兼容层（不保留 `draft` 作为别名），因为维护两条并行路径正是当前问题的根源，保留别名等于把同一个技术债务换个位置继续背。
- **不做的事**：不动 `backlog/docs/`、`backlog/decisions/` 独立实体机制——它们与 authoring pipeline 无关的问题域（参考资料 vs 待执行工作项），不在本次折叠范围内。
- **风险**：迁移脚本必须保证内容零丢失（16 个现存文件），且迁移后的新 Task id 需避免与现有 BACK-N 序列冲突——用现有的 id 生成逻辑（`generateNextId`）而非手工分配来规避此风险。

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

---

# Plan: 废弃旧 Draft 实体，折叠进 authoring/draft phase

Proposal: 见本任务 Implementation Plan 字段上半部分（本 Plan 追加于其后）

## Phase A: 模型收编决策 + 一次性迁移脚本与执行

### Tests (write first)
- `src/test/draft-to-authoring-migration.test.ts`（新建）：
  - `it("converts a fixture backlog/drafts/*.md file into a Task file with pipeline_id=authoring, phase=draft, preserving title/body/created")` — 对临时 fixture 目录跑迁移函数，断言输出文件 frontmatter 含 `pipeline_id: authoring`、`phase: draft`，且 title/正文/`created`字段与源文件逐字节一致。
  - `it("assigns a collision-free new task id via the existing generateNextId sequence")` — 断言新 id 不与 fixture 里预置的现有 BACK-N id 冲突。
  - `it("removes draft-only frontmatter fields (no leftover EntityType.Draft markers) from the migrated file")`
- `src/web/lib/lanes.test.ts`（扩展，覆盖 Goal 3）：
  - `it("groups a task with pipeline_id=authoring, phase=draft under the authoring pipeline lane")` — 构造一个 `pipeline_id: "authoring", phase: "draft"` 的 task fixture，调用 `buildPipelineLanes`/`groupTasksByLaneAndStatus`，断言它出现在 `authoring` 泳道下而不是 `NO_PIPELINE_LABEL` 泳道。

### Implementation
- `docs/task-lifecycle-model.md`：新增一节（建议紧跟 §7 术语速查之前），显式声明：旧 Draft 实体（`backlog/drafts/`、`DRAFT-N`）被 `authoring/draft` phase 取代；列出本任务 Proposal 中的 7 条不动点。
- 新增 `src/core/draft-migration.ts`：导出 `migrateDraftToTask(draftPath, core)`，复用 `Core.promoteDraft`（`src/core/backlog.ts:2308-2316`）产出 Task 后，再补写 `pipeline_id: "authoring"`, `phase: "draft"`（不新增第二套转换逻辑）；导出 `migrateAllDrafts(core)` 遍历 `backlog/drafts/*.md`。
- 在本仓库实际执行 `migrateAllDrafts`：把现存 16 个 draft（含 DRAFT-16）转成 `backlog/tasks/*.md`，`backlog/drafts/` 清空。

### DoD
- [ ] `bun test src/test/draft-to-authoring-migration.test.ts src/web/lib/lanes.test.ts`
- [ ] `grep -q "authoring/draft" docs/task-lifecycle-model.md`
- [ ] `[ -z "$(ls -A backlog/drafts 2>/dev/null)" ]`

## Phase B: 移除 CLI / Server / Web 的独立 Draft 表面

### Tests (write first)
- `src/test/cli-draft-removed.test.ts`（新建）：
  - `it("backlog draft <any subcommand> exits non-zero / unknown command")` — spawn `bun src/cli.ts draft list`（及 create/archive/promote/view/edit），断言退出码非 0。
  - `it("task create no longer accepts --draft, task demote no longer exists")` — spawn 断言对应 flag/命令报未知选项。
- `src/test/server-drafts-removed.test.ts`（新建）：
  - `it("GET /api/drafts returns 404")`
  - `it("POST /api/drafts/:id/promote returns 404")`

### Implementation
- `src/cli.ts`：删除 `draft` 命令族（原 `3007-3230` 区域）、`task create --draft` flag、`task demote` 子命令。
- `src/core/backlog.ts`、`src/file-system/operations.ts`、`src/utils/task-path.ts`：删除 `listDrafts`/`saveDraft`/`loadDraft`/`archiveDraft`/`promoteDraft`/`promoteDraftWithUpdates`/`demoteTask`/`demoteTaskWithUpdates`/`getDraftPath`/`normalizeDraftId`/`extractDraftIdFromFilename`/`draftIdsEqual`/`extractDraftBody`。删除整个 `src/core/prefix-migration.ts`（一次性迁移已随旧实体一起退休）。
- `src/utils/prefix-config.ts`、`src/types/index.ts`：删除 `DRAFT_PREFIX`、`EntityType.Draft`。
- `src/core/cross-branch-tasks.ts`、`src/utils/task-builders.ts`：删除 draft 目录扫描/合并分支。
- `src/server/index.ts`：删除 `/drafts` SPA 路由、`/api/drafts` GET、`/api/drafts/:id/promote` POST 及对应 handler (`handleListDrafts`/`handlePromoteDraft`)，statistics wiring 里的 `drafts` 参数。
- Web：删除 `src/web/components/DraftsList.tsx` 整文件；`App.tsx` 删除 draft 路由/import/draft-mode 状态；`SideNavigation.tsx` 删除 "Drafts" 导航项与图标；`TaskDetailsModal.tsx` 删除 `isDraftMode` 分支；`Statistics.tsx` 删除 draft 计数卡片。
- `src/core/statistics.ts`、`src/commands/overview.ts`、`src/ui/overview-tui.ts`：删除 `draftCount` 相关字段与展示。

### DoD
- [ ] `bun test src/test/cli-draft-removed.test.ts src/test/server-drafts-removed.test.ts`
- [ ] `! grep -rq "listDrafts\|promoteDraft\|archiveDraft\|EntityType.Draft" src/cli.ts src/core/backlog.ts src/file-system/operations.ts src/server/index.ts src/types/index.ts`
- [ ] `! test -f src/web/components/DraftsList.tsx`
- [ ] `! test -f src/core/prefix-migration.ts`

## Phase C: 测试收尾 + 文档更新

### Tests (write first)
- 删除 3 个专用测试文件：`src/test/mcp-drafts.test.ts`、`src/test/draft-create-consistency.test.ts`、`src/test/prefix-migration.test.ts`。
- 更新共享测试文件里引用 Draft 实体语义的断言，改为 authoring/draft phase 语义（涉及 `filesystem.test.ts`、`cli-task-lifecycle.test.ts`、`core.test.ts`、`dependency.test.ts`、`cli-plain-output.test.ts`、`prefix-config.test.ts`、`atomic-task-create.test.ts`、`mcp-tasks.test.ts`、`cli-dependency.test.ts`、`auto-commit.test.ts`、`cli-init-no-git.test.ts`）。

### Implementation
- `CLI-INSTRUCTIONS.md`：把 "Draft Workflow" 一节改写为 authoring/draft phase 用法（`task create` 默认落 draft phase；`task edit --phase refining/backlog` 做提升）。
- `src/guidelines/agent-guidelines.md`、`src/guidelines/cli-agent-nudge.md`、`src/guidelines/cli-instructions/overview.md`、`src/guidelines/mcp/task-creation.md`：同步更新，移除对已删除命令的引用。

### DoD
- [ ] `bun test --parallel`
- [ ] `! grep -rq "backlog draft " CLI-INSTRUCTIONS.md src/guidelines`

## Constraints
- 不动点（与 Proposal 一致，实现全程遵守）：
  1. 不引入第二个 Draft 类型/旁路字段（`isDraft`/`draftFields` 等）——authoring/draft phase 就是 Task 的 `(pipeline_id, phase)` 值。
  2. 不新增 status→phase 反向同步；`Core.updateTask` 现有单向 phase→status 同步保持不变。
  3. 不触碰 `backlog/docs/`、`backlog/decisions/` 独立实体机制。
  4. `src/engine/pipeline.ts` 的 authoring pipeline 定义（`draft→refining→backlog`）本身不改。
  5. Web pipeline 泳道视图（BACK-644/648）不回归，迁移后的任务须在 `authoring` 泳道正确显示。
  6. 迁移必须数据保真：16 个现存 draft 文件内容零丢失。
  7. 不允许半态提交：CLI/Server/Web/测试/文档五处必须在同一 PR 内一起完成收口（Phase 内部允许顺序推进，合并时必须闭环）。
- `task create --draft` 与 `task demote` 直接删除而非改造成兼容别名（原因：默认 `task create` 已经落在 `authoring/draft`，专属 flag/命令是重复 API，按 CLAUDE.md "Keep APIs minimal" 原则去掉，改用已有的 `--pipeline`/`--phase` 通用机制）。
- 这是一次已确认接受的破坏性变更：外部消费 `backlog draft ...` 的使用者会断，不做兼容层/别名。
- 每个 Phase 的代码改动量遵循既有估算（~1500-1800 行删除/迁移为主），保持在 Basic task 的 ~2000 行改动量级内。

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`
- [ ] `! bun src/cli.ts draft --help`（确认 draft 命令族已不存在）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal self-review: APPROVED
premise-ledger:
[E] background 说明 WHY 而非仅 WHAT: 直接对照 proposal 文件第一段判断
[E] goals 可验证性: 7 条 goal 均可用 grep/手动核对
[C] feasibility 与代码库对齐: 依据 Explore agent 对 draft 实体的完整扫描结果核对文件路径存在
[H] '不做部分废弃'这条不动点的必要性判断: 依据经验(半态最容易在跨层删除里产生)推断,无仓库内先例可直接引用
GCL-self-report: E=2 C=1 H=1

Proposal approved. Starting plan draft.

Plan review iteration 1: APPROVED
premise-ledger:
[E] goal coverage: 7 goals 逐条映射到 Phase A(1,2,3)/Phase B(4,5)/Phase C(6,7)，Phase A 追加 lanes.test.ts 用例覆盖 Goal 3
[E] TDD 结构: 三个 Phase 均有非空 Tests + Implementation 分节，且顺序正确
[E] DoD/Acceptance Gate 可执行性: 全部为 shell 命令，首项均以 'bun test' 开头，Acceptance Gate 首项等于 cfg.testAll='bun test'
[C] 引用文件路径存在性: 依据此前 Explore agent 的完整代码扫描核对，未重新逐一 grep 验证
[H] Phase 粒度/工作量估算是否落在 Basic ceiling 内: 依据此前 Explore 扫描的 1500-1800 行估算外推，非精确计数
GCL-self-report: E=3 C=1 H=1
<!-- SECTION:NOTES:END -->

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
