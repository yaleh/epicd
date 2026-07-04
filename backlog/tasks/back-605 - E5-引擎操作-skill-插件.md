---
id: BACK-605
title: 'E5: 引擎操作 skill 插件（propose/promote/inbox/run/init）'
status: 'Epic: Proposal'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-04 02:53'
labels:
  - 'kind:epic'
  - 'epicd:E5'
dependencies:
  - BACK-602
  - BACK-603
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 loop-backlog 的 agentic 层改写为**引擎面向 LLM 的操作 skill 集**，并**作为 Claude Code 插件随 `epicd` 引擎 repo 发布**（不留在 baime）。改调引擎 API 而非 `backlog task` + sed/grep。

intake 收敛为单个 `propose`；人面集 = `propose` / `promote` / `inbox` / `run` / `init`（+ Monitor/worker）。

**分界（ADR-011 D-7-bis）**：操作 skill 随引擎走（通用、可移植）；方法论 skill（iteration-executor、knowledge-extractor、measurement）留 baime。

**可移植性验收**：全新项目装上 `epicd` 引擎插件即得可用的自治 backlog，对 baime 零引用。

参考：ADR-011 D-7-bis；baime 讨论记录 §14.3/§15.3 E5。

---

## 依赖复核（问题 3）：E5 依赖 E2+E3，不硬依赖 E4
**原依赖 E4 是过耦合，已改为 BACK-602(E2)+BACK-603(E3)。** 理由：E5 的操作 skill 真正需要的是——
- **E2（gate-event log）**：`inbox` skill 读 gate-event log（可走 CLI 路径，不必等 E4 网页）；
- **E3（pipeline 泛化）**：`run` skill 须能驱动任意 pipeline（execution + exploration），依赖 E3 的通用解释器；
- E1（schema）经 E3→E1 传递依赖覆盖。

E4（Web UI）降为**软协同**，非硬前置：E5 完成时若 E4 未就绪，`init`/`run` 拉起的是现有（未 repoint）kanban；E4 就绪后再切到引擎自有 server。

## 驱动节点（旧→新机制）— **正式退役点；M2 拆为 M2a/M2b**
**这是旧机制的正式退役 epic。** 里程碑区分（讨论 §15.2，勿混淆）：
- **M1（早，E0 完成触发）**：引擎自驱**引擎自己的** E1–E6；与 baime 解耦，baime 仍跑旧 loop-backlog。
- **M2a（本 epic 完成触发）= 驱动器替换**：`propose/promote/run` + Monitor/worker 就位 ⇒ **baime（及其它项目）可弃用 loop-backlog 驱动器**，改由引擎驱动；此时 baime 仍可暂留旧 Backlog.md kanban 指向同一批 markdown。**这是"替换 loop-backlog"的真正节点，只需 E2+E3，不需 E4。**
- **M2b（E4 完成触发）= UI/存储替换**：kanban repoint + gate-inbox + auth 就位 ⇒ baime 弃用旧 Backlog.md kanban，全面上引擎自有 Web 面。

把 M2 拆开的意义：**"替换 loop-backlog"（M2a）不应被"重建整个 UI"（M2b）拖住**。原 E5→E4 硬依赖会把二者合并、令 baime 采用大幅延后。

退役顺序（plan 须明确并按序执行）：
1. 新操作 skill（propose/promote/inbox/run/init + Monitor/worker）全部改调引擎 API，跑通；
2. 可移植性验收通过（新 repo 装插件即得自治 backlog，零 baime 引用）——**注意：M1 内只能用合成空 repo 验；真实证明在 M2a baime 实迁（问题 5）**；
3. 旧 `loop-backlog` skill 与 `backlog task + sed/grep` 路径标记 deprecated；
4. **M2a 替换**：按 §9 迁移把 baime 驱动器切到 epicd（读同一批 markdown、回填空字段、并行跑、按 pipeline 逐条切换）；
5. soak 期结束后删除旧 loop（解除 E0–E4 期间一直保留的 soak fallback）。
完成本 epic = 驱动层旧→新切换彻底落地 + M2a 达成（M2b 随 E4）。

## 现有 skill 重构清单（退 / 并 / 迁 / 留）
本 epic 须明确处理每一个现有 baime skill 的归属，不得遗漏：
- **合并进 `propose`**：`feature-to-backlog` / `task-to-backlog` / `epic-to-backlog` / `task-from-template`——§14.3 的 `*-to-backlog` 增殖是 schema 固定分类法错误在 skill 层的翻版，role/domain 变属性后收敛为单个意图动词。
- **瘦身重接线**：`loop-backlog`（SKILL.md ~1900 行）→ 薄壳的 `run` + Monitor/worker，多为**删除 + 改调引擎 API**（讨论 §④/⑥，第 432 行）。**可验收的瘦身目标须在 plan 量化**（目标量级：薄壳，绝大部分 prose/sed/grep 删除）。
- **留 baime（方法论 skill）**：`iteration-executor` / `knowledge-extractor` / measurement 等 + `payload` 中的 E/C/H 语义。
- **spawn 边界（不可迁移）**：harness 始终拥有 worktree + agent 的 *spawn*（讨论第 48 行）；引擎拥有"何时 spawn 哪个 Task"的编排，但实际 spawn 动作仍是 baime/harness 侧的薄 skill。plan 须画清"引擎编排 vs harness spawn"的接缝，避免 spawn 逻辑泄漏进引擎 core。

## 测试 / build 机制
- **单元/集成测试**：每个操作 skill（propose/promote/inbox/run/init）各有 smoke + 集成用例，跑通其引擎 API 调用路径；Monitor/worker 事件分派测试。
- **可移植性验收（自动化）**：脚本化"新建空 repo → 装 epicd 插件 → 跑一个 tracer task 到 done"，断言零 baime 引用（grep 检查）。**此为 M1 内合成验收，非 M2a 真实验收。**
- **插件校验**：`validate-plugin.sh` 通过；plugin.json / marketplace.json 合法；命名空间 `epicd:`。
- **build**：`bun run build`（含 `build:css`）产出可分发二进制 + 插件包；`bunx tsc --noEmit` + `bun run check .` 全绿。

## Web UI 改进方向
本 epic **不改 UI 本体**，但操作 skill 须与 E4 Web UI **软协同**（E4 非硬前置）：
- `inbox` skill 与 E4 gate-inbox 页面**同源**（同一 E2 gate-event log 数据），CLI/LLM 与 Web 两路一致；E4 未就绪时 `inbox` 走 CLI 读 E2 log。
- `run` / `init` skill 须能拉起 Web server：E4 就绪则起引擎自有 `Bun.serve`，否则起现有（未 repoint）kanban；
- 验收须覆盖"插件装好后 `init` 即可起 Web UI"（起哪套 UI 取决于 E4 是否已落）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

- [ ] 操作 skill 收敛为 propose/promote/inbox/run/init + Monitor/worker
- [ ] 全部改调引擎 API，退役 `backlog task` + sed/grep
- [ ] 作为 Claude Code 插件随 epicd repo 发布（命名空间 `epicd:`）
- [ ] 可移植性验收：新项目装插件即得自治 backlog，零 baime 引用

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Epic Plan (骨架) — E5 引擎操作 skill 插件 + monitors

> 据 skills/monitors 规格（UML 为准、baime 为参照）落成的骨架。正式分解在 epic decompose；本骨架钉住 child 边界与时序。设计锚点：docs/uml/runtime-deployment.puml · execution-class.puml · authoring-refine-class.puml · human-operations-activity.puml。

### Background
baime 今天把 agentic 层实现为 `Monitor` 托管 `scan-loop.js`（2 个硬编码 mode、7 个 channel）+ ~1900 行 loop-backlog + `*-to-backlog`/`*-to-draft` skill（调 `backlog task` + sed/grep、写 status frontmatter）。epicd 须把这层重写为**引擎面向的操作 skill**，作为 Claude Code 插件（命名空间 `epicd:`）随引擎发布，改调引擎 API，并泛化到四轴/pipeline-as-data 终版：**每 pipeline 一个 driver**（非 2 mode）、item-ready 由 `(pipeline, phase, actor=machine)` 派生、claim 归 Coordinator、`engine.complete()` 取代 `.agent-done` sentinel。

### Goals（映射 AC）
1. 操作 skill 收敛为 propose/promote/inbox/run/init（+ supervisor/driver/worker 运行时）— AC#1
2. 全部改调引擎 API，退役 `backlog task` + sed/grep — AC#2
3. 作为 Claude Code 插件发布（`epicd:` 命名空间）— AC#3
4. 可移植性：空 repo 装插件即得自治 backlog，零 baime 引用 — AC#4

### Sub-Task Decomposition（child 边界）
1. **supervisor + 每-pipeline driver 运行时** — Monitor host 跑 supervisor；每 pipeline 一个 driver（`Interpreter.scan` → `item-ready:<pipeline>:<phase>:<id>`，仅 `actor=machine ∧ 无有效 claim`）；singleton 键 `(sourceId, pipeline_id)`；把 scan-loop 的 2 mode 泛化为 N。依赖 E3（pipeline-as-data、`PipelineState.actor`）、E0.4（driver/complete）。
2. **worker skill + spawn 接缝** — 薄 harness worker skill，在 item-ready 时 spawn 一个 Agent-in-worktree；**引擎编排"何时/哪个"，harness 做实际 spawn**（ADR-014/017）；`engine.complete` 握手；worker 不得自宣 done。覆盖 execute（feature/chore）与 decompose/evaluate（compound）。依赖 child1、E0.4/E0.5。
3. **refine + reviewer worker skill** — authoring worker，背后是 E7 的 RefineStrategy（feature/chore/epic）；architect reviewer 裁决作为数据回流（refine_log）。边界：**E7 拥有策略逻辑，E5 拥有薄 spawn/skill 打包**。依赖 E7、child1。
4. **`propose` skill** — 收敛 intake（feature/chore/epic 经 kind 属性）→ Draft phase；取代 `*-to-draft` ×3 + capture-draft.sh。
5. **`promote` + `inbox` skill** — 人机 gate 操作：promote（Backlog→Ready）；inbox（在 gate-event log 上做 gate-review：approve/reject/escalate）。依赖 E2。
6. **`run` + `init` skill** — run 起 supervisor+drivers；init 引导 repo（pipelines[] 配置、board）。
7. **插件打包** — plugin.json/marketplace.json、`epicd:` 命名空间、validate-plugin.sh；`bun run build`（含 build:css）产出可分发二进制 + 插件包。
8. **可移植性验收 + 退役 loop-backlog（M2a）** — 空 repo tracer 验收（M1 内合成、M2a 真实）；标 baime loop skill deprecated；按 §9 迁移把 baime driver 切到 epicd；稳定后删 soak fallback。

### Sequencing
E3 + E0.4 → child1(运行时) → child2(workers) ‖ child3(refine workers，需 E7) → child4(propose) ‖ child5(promote/inbox，需 E2) ‖ child6(run/init) → child7(打包) → child8(可移植性 + M2a 退役)。人机操作(4/5/6)在运行时(1)就绪后可并行开发。

### Constraints
- 操作 skill 随引擎走；方法论 skill（iteration-executor / knowledge-extractor / measurement …）+ payload E/C/H 语义留 baime（D-7-bis）。
- 引擎 core 绝不 spawn Claude Code session（spawn 接缝 = harness worker skill）。
- `engine.complete` 是唯一完成握手；`.agent-done-*` 替换而非扩展。
- driver 的 channel 由 `(pipeline, phase, actor)` 派生——不得像 baime 硬编码 kind×status。
- **M2a（driver 替换）只需 E2+E3，不需 E4（UI）**；勿耦合。
<!-- SECTION:PLAN:END -->
