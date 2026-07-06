---
id: BACK-660
title: monitor 前台顺序 loop 执行（取代 scan-loop push + 座席外包受限后台 Agent），解锁前台全工具/skill 调用
status: 'Basic: Draft'
assignee: []
created_date: '2026-07-06 07:44'
updated_date: '2026-07-06 11:16'
labels:
  - 'kind:feature'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
pipeline_id: authoring
phase: draft
parent_id: BACK-665
role: primitive
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态：draft。里程碑 A（手动用 skill 驱动执行）达成后的下游；proposal/plan 待进一步讨论后再补，勿直接跑 feature-to-backlog。

## 背景

到「手动用 skill 驱动执行」为止不需要 monitor：skills（BACK-657）+ 4 轴数据/CLI/web（BACK-655 + 已有）+ phase→skill 表就够，人可在一个 Claude Code 会话里按任务的 (pipeline_id, phase) 手动 invoke 对应 skill。本任务是把这一步**自动化**。

当前生产执行链路：scan-loop.cjs（push 流式传输）→ engine scan → engine dispatch <id> → src/engine/dispatch.ts 渲染 payload → Monitor 座席 → handle-basic-ready.sh（认领+worktree）→ 座席 spawn 一个受限后台 Agent 干活 → engine complete。受限后台 Agent 的 allowed-tools 只有 Bash/Read/Write/Edit/Glob/Grep（dispatch.ts:81），无 Skill/Agent 工具、不能再嵌套派 Agent——故无法 invoke phase skill。

## 目标

把执行改为**前台顺序 loop**：一个独立 Claude Code 会话跑 monitor（重构后的 scan-loop），取一个 ready item → 在该会话自己的前台执行（可用全套前台工具，含 Skill）→ engine complete → 循环。并让 dispatch 按 (pipeline_id, phase) 从 registry（BACK-657 child 1 交付、folded 进覆盖 manifest 的单一真值）查出 skill 附到消息，前台会话 invoke。

## 做什么

- 重构 scan-loop：从 push 流式（逼座席外包）改为 sequential/pull（取一个→前台执行→complete→再取）。
- 执行 locus 从受限后台 Agent 移到会话前台：替换 dispatch.ts payload 里“spawn 后台实现 Agent”段（dispatch.ts:50-81）为前台执行指令。
- 保留每车道 driver/lane 抽象：单会话内顺序，多车道靠多会话；不写死单车道。
- 更新 run/epicd-run 操作 skill，arm 新前台 loop。
- payload 仍由引擎 author（dispatch.ts），仍自包含、仍过 ADR-015 swap-litmus；按 (pipeline,phase) 注入 skill 引用，前台会话 invoke。

## 不动点（严格不改 / 必须保持）

1. 核心状态机 & pipeline-as-data（ADR-011 D-2）：pipeline 定义、phase/actor 语义、interpreter scan 谓词不改。
2. 完成路径（ENG-8）：engine complete/adjudicate/DoD 独立重跑/merge-lock/worktree 隔离 不改；worker 永不自证 done。
3. ADR-015 swap-litmus & 分层：payload 仍自包含、仍由引擎 author（dispatch.ts）；prompt authoring 不下沉到 scan-loop 传输层，也不塞进 Monitor 核心。装了插件的裸 claude -p 也能按名 invoke skill。
4. 认领 & 隔离：handle-basic-ready.sh 的 exec-lock/cap 幂等/.caps/.wt/.signal、单驱动守卫（.active-agents）、merge 串行化 不改。
5. 前向兼容：不排除未来切到「后台 agent 支持的更大并发」模式（已有让后台 agent 获得派生 agent + todo list 能力的方案）；driver/lane 抽象要能容纳未来 N 并发。

## 非目标

- 不做 phase→skill registry 本身（BACK-657 child 1 交付）；本任务只消费它做运行时注入。
- 不做 authoring/exploration 机器 phase 的生产 transport 接线（E7/BACK-608、BACK-641）。
- 不改 BACK-655 conformance 范围、不动 adjudicate（BACK-654）。

## 参考

- docs/adr/ADR-015-monitor-as-invocation-adapter.md（Monitor=invocation adapter；scan-loop 纯传输；swap-litmus）
- docs/task-lifecycle-model.md（4 轴模型 + phase→skill 表）
- src/engine/dispatch.ts（renderBasicReadyDispatch 的后台-Agent-offload 段）
- plugin/scripts/scan-loop.cjs（现状 push 流式轮询）
- BACK-657（phase 执行 skill 集 + child 1 的 phase→skill registry）；BACK-655（4 轴数据 conformance）；docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md（多车道 supervisor 方向）
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
