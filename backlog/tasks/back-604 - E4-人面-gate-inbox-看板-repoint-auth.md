---
id: BACK-604
title: 'E4: 人面 — 多车道 issue-list（主面）+ 内联 gate + auth'
status: 'Basic: Awaiting Children'
assignee:
  - '@claude'
created_date: '2026-06-26 09:00'
updated_date: '2026-07-05 14:57'
labels:
  - 'kind:epic'
  - 'epicd:E4'
dependencies:
  - BACK-601
  - BACK-602
  - BACK-603
  - BACK-628
ordinal: 5000
pipeline_id: execution
phase: awaiting-children
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
建立 human 的主交互面。human 是 **gate owner**。主面 = **多车道 issue-list**（以现有 All Tasks 表 `TaskList.tsx` + `src/web/lib/lanes.ts` 为基座），**不再是 kanban**。gate-inbox **融入** issue-list —— 即其中 `waiting_on=human` 的行，**不另设独立页**。kanban 降级为 **deprecated** 桌面总览（代码保留、导航隐藏），不再是主面。auth 为引擎自有中间件。

裁决依据本会话（2026-07-04）：docs/proposals/2026-07-04-multi-lane-issue-list.md · docs/uml/presentation-class.puml · docs/uml/use-case-model.md（三平面/四轴）。

## 三轴解耦（本面据以呈现）
- **车道 = `pipeline_id`**（结构，来自 config pipelines[]）：复用 `lanes.ts`，加**第三个 `LaneMode="pipeline"`**，laneKey = pipeline_id，可折叠 swimlane（复用 Board.tsx 结构）+ lane-switcher。
- **车道内 = phase 分列（有序）+ priority 排序**；**label 正交 OR 过滤**（沿用现 search 语义，narrows within a lane，不定义车道）。
- **每行驱动者指示**：👤 待你 gate / 🤖 Claude Code 正处理 / ⏳ 排队待取 / ⚠️ stale —— 由 `waiting_on ⋈ Coordinator claim` **join** 得出；经现有 WS `tasks-updated` 实时刷新。**soak 期 claim 来自 baime `.active-agents`/`.caps` 适配器**（Coordinator 契约形状 soak↔引擎不变，见 driver-supervisor §7 R5）。

## 范围
1. **多车道 issue-list（新主面）**：pipeline 泳道 + lane-switcher + phase 分列 + priority 排序 + label 正交过滤；基座 `TaskList.tsx`/`lanes.ts`/`Board.tsx` swimlane 复用。
2. **驱动者指示 + 运行时 join**：每行 👤/🤖/⏳/⚠️；Coordinator 读 shim（soak：baime `.active-agents`）。
3. **内联 gate-review**：`waiting_on=human` 行内 approve/reject/escalate，写回 `status`（推进 phase/waiting_on），复用 WS 广播。gate-inbox = 本面的 needs-human 行，不另设页。
4. **kanban 降级**：标 deprecated、导航隐藏、列由 pipeline state 派生（承接 E3），零功能回归；repoint 到引擎自有 `Bun.serve` 仅作桌面总览。
5. **auth**：引擎自有中间件，包住 issue-list + 桌面总览路由。
6. **状态显示收敛**：把现有重复 ~4 处 status 启发式（`TaskList.getStatusColor`/`TaskColumn`/`MilestonesPage`/`terminal-status`）收敛为单一 `label(phase,turn,role,plane)` 单向投影（R3）。

通用部分（响应式视图 / auth 中间件 / lanes pipeline 扩展）标注可回馈上游。

## 依赖说明
- **E1（BACK-601）**：需 `waiting_on` 派生（parse(status)）+ search-service 按 `pipeline_id/waiting_on` 过滤 + config pipelines[]。
- **E2（BACK-602）**：gate 决策记入 gate-event log。
- **E3（BACK-603）**：board/车道列由 pipeline state 数据驱动，不硬编码 Basic/Epic。

## 测试 / build 机制
- **单元**：`lanes.ts` pipeline 模式分组；`label()` 投影；驱动者指示 (waiting_on × claim) 真值表；Coordinator shim 读 baime `.active-agents`。
- **e2e**（沿用 `@playwright/test`，独立 job）：多车道加载 / 折叠 / lane-switcher；内联 gate-review（approve/reject/escalate）；驱动者指示随 WS 刷新；kanban（deprecated）回归。
- **build**：`build:css`（Tailwind v4）纳入引擎 server 构建；`bun run build` 全绿；移动优先视图基本校验。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 多车道 issue-list 为主视图：按 pipeline_id 分可折叠 swimlane（复用 lanes.ts，新增 LaneMode=pipeline），车道内按 phase 分列、priority 排序，label 正交 OR 过滤
- [ ] #2 每行驱动者指示（👤/🤖/⏳/⚠️）由 actor(phase)（从 pipeline-data 查，非 per-task 字段）⨝ Coordinator claim 得出，经现有 WS tasks-updated 实时刷新；soak 期 claim 来自 baime .active-agents/.caps 适配器
- [ ] #3 gate-inbox 融入 issue-list：actor(phase)=human 行内联 approve/reject/escalate 写回 phase（promote→Backlog / 重开→机器 phase / 拒→归档），不另设独立页
- [ ] #4 kanban 降为 deprecated 桌面总览：导航隐藏、列由 pipeline phase 派生（不硬编码 Basic/Epic）、零功能回归；不再是主面
- [ ] #5 状态显示收敛：现有重复 ~4 处 status 启发式收敛为单一 label(role, phase) 单向投影（渲染边界；engine 读 phase key 查 pipeline-data，不解读显示串）
- [ ] #6 auth 引擎自有中间件接入（包住 issue-list + 桌面总览）；通用 UI/auth/lanes 扩展部分可回馈上游
- [ ] #7 e2e（@playwright/test 独立 job）覆盖：多车道加载/折叠/切换、内联 gate-review、驱动者指示随 WS 刷新、kanban(deprecated) 回归
- [ ] #8 自观察反馈闭环：一个 agent 经 web API + Playwright 观察运行中的板，把异常（status/phase desync、stale claim、空 worktree 孤儿）自动经 backlog CLI 建 task 并链接来源；至少演示一次真实检出→建 task
- [ ] #9 本面的子任务经 engine decompose-apply 创建（由 agent 撰写的 JSON 子任务数组喂入，而非手工 backlog task create），dispatch/complete 走既有 scan-loop 反应式机制（Monitor + scan-loop.cjs）；每个 child 至少一条 gcl-events.jsonl 记录引用其实际执行的 engine dispatch <id> payload 作为证据。完全无人值守的自主 decompose 推迟到未来 epic（待 LLM 驱动的 decompose-proposal 步骤验证后）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# BACK-604 Pre-Decompose Survey & AC#8/#9 Concretization

## A. Current-state survey

**Routes** (`src/web/App.tsx:477-548`): `/` (board), `tasks` (:510, TaskList), `milestones` (:526), `drafts` (:538), `documentation*` (:539-541), `decisions*` (:542-544), `statistics` (:545), `gate-inbox` (:546, GateInboxPage), `settings` (:547). No auth-gated route today.

**`src/web/lib/lanes.ts:4`**: `LaneMode = "none" | "milestone"` only — no `"pipeline"` mode exists. `buildLanes`/`groupTasksByLaneAndStatus` (lines 152, 328) key lanes off milestone; adding `pipeline` mode requires a new `laneKeyFromPipeline` analogous to `laneKeyFromMilestone` (:16) plus a branch in `buildLanes`/`groupTasksByLaneAndStatus`. `Task.pipeline_id`/`phase` already exist (`src/types/index.ts:87-88`), so the data is available — this is additive, not a data-model change.

**Swimlane collapse** lives in `src/web/components/Board.tsx` (imports `getTerminalStatus` from `../../utils/terminal-status`, :7, :72) — confirmed reusable structurally, but Board.tsx is milestone/status-column-oriented, not pipeline-phase-oriented; reuse means lifting the collapse/switcher mechanics, not the column logic.

**Status-heuristic duplication (AC#5) — confirmed 4 sites**:
1. `TaskList.tsx:435-446` `getStatusColor` — hardcoded switch on `"to do"/"in progress"/"done"`.
2. `TaskColumn.tsx:82-92` — separate hardcoded color switch (own literal set).
3. `MilestoneTaskRow.tsx:60` — consumes a `statusBadgeClass` prop (heuristic lives at the `MilestonesPage.tsx` caller, not grep-visible in the row itself).
4. `src/utils/terminal-status.ts:1-16` — `getTerminalStatus`/`isTerminalStatus`, a *different* concern (terminal-detection, not color) used by both `Board.tsx` and `TaskList.tsx:11,115`.

None of these read `pipeline_id`/`phase`/`actor` — all are legacy `status` string switches. AC#5's `label(phase, actor)` projection is genuinely new, not a refactor of one existing function.

**WS realtime path confirmed real**: server emits in `src/server/index.ts:258-261` (`broadcastTasksUpdated`, called from ~7 mutation sites e.g. :1043,1275,1469,1501,1517,1654); client consumes at `App.tsx:404` (`if (event.data === "tasks-updated")`).

**GateInboxPage** (`src/web/components/GateInboxPage.tsx:1-16` docstring) — explicitly documented as "read-only observability only... no interactive gate-review submission — those are BACK-604." Confirmed no approve/reject action exists anywhere in the file.

**Auth**: `grep -rniE "auth|middleware" src/web src/engine src/server` returns only the GateInboxPage comment above — zero auth code exists. AC#6 is greenfield middleware, not wiring.

**Playwright**: `playwright.config.ts` exists and already has a working `webServer` block (`command: bun run cli browser --no-open --port 6455`, `reuseExistingServer:false`) — Playwright's own lifecycle manager starts/health-polls/kills the server automatically. `tests/e2e/{smoke,task-crud}.test.ts` exist as precedent e2e specs. `package.json:56` has `test:all` combining `bun test` + `playwright test`. However: no DoD gate in any task (`grep -rl "test:e2e\|bunx playwright" backlog/tasks backlog/completed_tasks` → empty) has ever actually invoked Playwright as a completion gate — BACK-600.5's playwright mentions are tsc type errors, not a running e2e gate. **This would be the first Playwright-as-DoD-gate precedent.**

## B. Proposed child tasks (deliverable-sized, not per-file)

- **604.1 — Pipeline lane mode + reused swimlane/lane-switcher on TaskList** (AC#1): add `LaneMode="pipeline"` to `lanes.ts`, wire lane-switcher UI, phase-columns + priority sort + label OR-filter into `TaskList.tsx`.
- **604.2 — Driver indicator + Coordinator claim-shim + WS join** (AC#2): `actor(phase)` lookup from pipeline-data ⋈ baime `.active-agents`/`.caps` read adapter; per-row badge, WS-refreshed.
- **604.3 — Inline gate-review (approve/reject/escalate) + status-label convergence** (AC#3, #5): write-back phase transitions inline in the row; single `label(phase, actor)` projection replacing the 4 heuristics found above.
- **604.4 — Kanban deprecation + auth middleware** (AC#4, #6): hide nav entry, derive columns from pipeline phase set (no hardcoded Basic/Epic), add engine-owned auth middleware over both routes.
- **604.5 — E2E suite (Playwright, separate job)** (AC#7): since `playwright.config.ts` already owns server lifecycle, the DoD gate command needs **no custom wrapper script** — `bunx playwright test tests/e2e/multi-lane-board.spec.ts` is itself idempotent (webServer auto-starts on the dedicated port 6455, health-polls the URL, and Playwright kills the child process on exit, propagating the real pass/fail exit code). Defense-in-depth variant if isolation from `complete-task.sh`'s per-line `bash -c` execution is a concern:
  `E2E_PORT=6455 bunx playwright test tests/e2e/multi-lane-board.spec.ts; code=$?; pkill -f "cli browser --no-open --port 6455" 2>/dev/null; exit $code`

## C. AC#8/#9 concretization

**AC#8 — recommend re-scope/soften.** Current validated capability (per BACK-628.4 gcl-event, `docs/research/gcl-events.jsonl:18`) is: `engine scan/dispatch/decompose-apply/evaluate` are mechanically driven, but the **decompose JSON child array is still authored by a human/session, piped into `decompose-apply`** — not generated unattended. `plugin/skills/run/SKILL.md` confirms the loop is "Monitor emits event block → agent (main session) acts" — an attended reactive loop, not autonomous end-to-end decomposition. AC#8 as worded ("自身分解并驱动交付") overclaims: today no component *proposes* the decomposition without a human/session in the loop.

Proposed softened AC#8: "BACK-604's children are created via `engine decompose-apply` fed by an agent-authored JSON array (not manual `backlog task create`), and dispatch/complete follow the scan-loop reactive mechanism (Monitor + scan-loop.cjs), evidenced by one `gcl-events.jsonl` entry per child citing the `engine dispatch <id>` payload actually followed." Defer full unattended self-decomposition to a future epic once an LLM-driven decompose-proposal step is validated.

**AC#9 — falsifiable, keep as-is with concrete check**: define pass as one `gcl-events.jsonl` entry with `event: "self_observed_anomaly_ticketed"` containing (a) the Playwright/API observation detail, (b) the `backlog task create` command/output creating the anomaly task, (c) a link field (e.g. `source: "playwright-run:<path>"` or a task dependencies/comment referencing the observed run) tying the task back to the observed evidence. One real occurrence suffices per AC wording ("至少演示一次").
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-04 终版对齐：驱动者指示的“waiting_on”一律理解为 actor(phase)——turn 不 per-task 存，由 pipelineDef[phase].actor 派生（proposal §2.3 终版）。本面只读 phase + 查 pipeline-data 得 actor，再 ⨝ claim；无需 join 任何 waiting_on 字段。gate 裁决写回的是 phase。

[ADR-016 分解正交性检查] advisory，不阻塞分解/dispatch：
- 声明式重叠 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ∩ "604.2 - driver indicator + Coordinator claim-shim + WS join": src/web/components/TaskList.tsx
- 声明式重叠 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ∩ "604.3 - inline gate-review + status-label convergence": src/web/components/TaskList.tsx
- 声明式重叠 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ∩ "604.4 - kanban deprecation + auth middleware": src/web/components/Board.tsx
- 声明式重叠 "604.2 - driver indicator + Coordinator claim-shim + WS join" ∩ "604.3 - inline gate-review + status-label convergence": src/web/components/TaskList.tsx
- 声明式重叠 "604.2 - driver indicator + Coordinator claim-shim + WS join" ∩ "604.4 - kanban deprecation + auth middleware": src/server/index.ts
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.2 - driver indicator + Coordinator claim-shim + WS join": src/web/lib/lanes.ts , src/server/index.ts（共变 3 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.2 - driver indicator + Coordinator claim-shim + WS join": src/web/components/TaskList.tsx , src/server/index.ts（共变 8 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.2 - driver indicator + Coordinator claim-shim + WS join": src/web/components/Board.tsx , src/web/components/TaskList.tsx（共变 9 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.2 - driver indicator + Coordinator claim-shim + WS join": src/web/components/Board.tsx , src/server/index.ts（共变 11 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.3 - inline gate-review + status-label convergence": src/web/components/TaskList.tsx , src/web/components/TaskColumn.tsx（共变 6 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.3 - inline gate-review + status-label convergence": src/web/components/Board.tsx , src/web/components/TaskList.tsx（共变 9 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.3 - inline gate-review + status-label convergence": src/web/components/Board.tsx , src/web/components/TaskColumn.tsx（共变 10 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/lib/lanes.ts , src/web/components/Board.tsx（共变 3 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/lib/lanes.ts , src/web/App.tsx（共变 3 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/lib/lanes.ts , src/server/index.ts（共变 3 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/web/components/Board.tsx（共变 9 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/web/App.tsx（共变 8 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/server/index.ts（共变 8 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/Board.tsx , src/web/App.tsx（共变 9 次）
- 历史强耦合 "604.1 - pipeline lane mode + reused swimlane/lane-switcher on TaskList" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/Board.tsx , src/server/index.ts（共变 11 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.3 - inline gate-review + status-label convergence": src/web/components/TaskList.tsx , src/web/components/TaskColumn.tsx（共变 6 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.3 - inline gate-review + status-label convergence": src/server/index.ts , src/web/components/TaskList.tsx（共变 8 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.3 - inline gate-review + status-label convergence": src/server/index.ts , src/web/components/TaskColumn.tsx（共变 11 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/web/components/Board.tsx（共变 9 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/web/App.tsx（共变 8 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/server/index.ts（共变 8 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.4 - kanban deprecation + auth middleware": src/server/index.ts , src/web/components/Board.tsx（共变 11 次）
- 历史强耦合 "604.2 - driver indicator + Coordinator claim-shim + WS join" ↔ "604.4 - kanban deprecation + auth middleware": src/server/index.ts , src/web/App.tsx（共变 19 次）
- 历史强耦合 "604.3 - inline gate-review + status-label convergence" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/web/components/Board.tsx（共变 9 次）
- 历史强耦合 "604.3 - inline gate-review + status-label convergence" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/web/App.tsx（共变 8 次）
- 历史强耦合 "604.3 - inline gate-review + status-label convergence" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskList.tsx , src/server/index.ts（共变 8 次）
- 历史强耦合 "604.3 - inline gate-review + status-label convergence" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskColumn.tsx , src/web/components/Board.tsx（共变 10 次）
- 历史强耦合 "604.3 - inline gate-review + status-label convergence" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskColumn.tsx , src/web/App.tsx（共变 5 次）
- 历史强耦合 "604.3 - inline gate-review + status-label convergence" ↔ "604.4 - kanban deprecation + auth middleware": src/web/components/TaskColumn.tsx , src/server/index.ts（共变 11 次）
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-07-05 06:06
---
归并 BACK-629（自观察闭环）入本 E4：其两点新意——(1) 由自举环交付 (2) observe→task 传感器——已作为 AC#8/#9 加入本面，退掉平行车道（避免过度分解）。新增依赖 BACK-628（须先自托管才能'由环交付'）。BACK-629 已 archive。
---
<!-- COMMENTS:END -->
