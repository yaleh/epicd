---
id: BACK-660
title: manda-monitor 执行座席：并发 task subagents + epicd skill 直调 + 深层嵌套（取代受限后台 Agent）
assignee: []
created_date: '2026-07-06 07:44'
updated_date: '2026-07-14 02:12'
labels:
  - 'kind:feature'
  - 'area:engine'
  - 'area:runtime'
dependencies:
  - BACK-682
pipeline_id: authoring
phase: drafting
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

当前执行链路：`engine supervisor` 扫板 → emit payload 到 stdout → Monitor 座席读取 → `handle-basic-ready.sh`（认领 + worktree）→ spawn **受限后台 Agent**（`allowed-tools: Bash/Read/Write/Edit/Glob/Grep`，无 Skill/Agent 工具）→ engine complete。受限工具集使后台 Agent 无法调用 phase skill，BACK-660 最初设计为「前台顺序 loop」来解决这个问题。

2026-07-13 架构讨论后确认更优路径：以 **manda-monitor 作为执行座席**替换受限后台 Agent。manda-monitor（depth-0 会话）并发 spawn depth-1 Agent subagents；depth-1 subagents **可直接调用 epicd skills**；若需更深层执行，还可通过 cap-proxy（`cap-requests-<broker>` channel）请求 parent 代为 spawn depth-2 Agent（MAX_DEPTH = 3）。前台顺序 loop 方案因此废止。

## 新执行模型

```
engine supervisor --loop
  └─ supervisorTick()                    [scan + cap-mark + field-lock，不变]
       └─ emit → manda-dispatch submit
                    ↓
             manda pending channel
                    ↓
         manda-monitor 会话（depth-0）
           ├─ Agent subagent (depth-1, task A) → invoke epicd:primitive-executor
           ├─ Agent subagent (depth-1, task B) → invoke epicd:adjudicate
           └─ Agent subagent (depth-1, task C) → invoke skill X
                └─ cap-proxy → parent → depth-2 subagent（如需）
```

manda-monitor 的 claim/settle/reap/cancel 治理由 manda 负责；epicd engine 只管任务板状态（cap marker + phase 迁移 + DoD gate）。

## 做什么

1. **supervisor.ts `emit` 回调**：改为调用 `manda-dispatch submit <taskId> "<payload>"`，替换当前的 stdout 打印。field lock 和 cap marker 不变。
2. **dispatch.ts payload 重写**：移除「spawn ONE background implementation Agent + allowed-tools 白名单 + wait for .agent-done-X Monitor」段（dispatch.ts:50–100 区间）；改为：
   - Step 1–5：仍运行 `handle-basic-ready.sh`（认领 + worktree，不变）
   - Step 6（新）：按 `(pipeline_id, phase)` 从 `phase-coverage.json` 查出 skill，直接 invoke
   - 移除 `.agent-done-<taskId>` signal-file 约定（manda DispatchSettle 替代）
3. **manda-monitor 配置**：为 epicd 项目配置 `.manda/config.yml`，接 epicd supervisor 发出的 pending channel；绑定 dispatch executor role。
4. **engine supervisor CLI**：`engine supervisor --once/--loop` 的 emit 实现换为 manda-dispatch submit（含 manda daemon 地址配置）。
5. **dispatch.ts phase→skill 注入**：payload 按 `(pipeline_id, phase)` 注入 skill 引用，从 `phase-coverage.json` 读取（BACK-657 child 1 已交付 registry）。

## 非目标

- 不改 supervisorTick board 扫描 + cap-marking + field lock 逻辑
- 不改 handle-basic-ready.sh 的 exec-lock/cap 幂等/.caps/.wt 机制
- 不改 engine complete / DoD gate / merge-lock（ENG-8）
- 不改核心状态机 / pipeline-as-data（ADR-011 D-2）
- 不做 authoring/exploration 车道的 manda 接线
- 不实现 MAX_DEPTH > 1 的具体用例（cap-proxy 由 manda 提供，本任务不需配置深层 spawn 场景）

## 参考

- manda 项目 `/home/yale/work/manda`（README.md、plugin/skills/manda-monitor/、internal/dispatch/）
- ADR-015 swap-litmus（dispatch payload 仍由 engine 单点 author）
- src/engine/supervisor.ts（emit 回调改造点）
- src/engine/dispatch.ts（renderBasicReadyDispatch，payload 重写点）
- plugin/scripts/handle-basic-ready.sh（认领/worktree，保留）
- BACK-657 child 1（phase-coverage.json registry）；BACK-682（收敛机制层，前置依赖）
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 supervisor.ts emit 回调改为 manda-dispatch submit；engine supervisor --once 不再向 stdout 打印 dispatch payload，改为 submit 到 manda pending channel；有集成测试或脚本断言该行为
- [ ] #2 dispatch.ts payload 中「spawn 受限后台实现 Agent + wait for .agent-done-X」段被移除；新 payload 包含 handle-basic-ready.sh（Step 1–5）+ invoke phase skill 指令；有 snapshot/单元测试覆盖新 payload 结构
- [ ] #3 端到端：manda-monitor 会话运行时，一个真实 task 从 ready → implementing → done 全程不经过受限后台 Agent，depth-1 subagent 直接 invoke epicd phase skill 完成执行
- [ ] #4 并发：manda-monitor 能同时持有 ≥2 个 in-flight depth-1 task subagents（manda 治理，不需 epicd 层额外代码）
- [ ] #5 ADR-015 swap-litmus 继续成立：payload 仍由 dispatch.ts 单点 author；phase→skill 查找逻辑仅在 dispatch.ts 内；scan-loop.cjs（兼容传输）不含 skill 选择分支
- [ ] #6 不改核心状态机（ADR-011 D-2）：pipeline 定义、phase/actor 语义、interpreter scan 谓词不变；既有 scan 谓词测试套件全绿
- [ ] #7 不改完成路径（ENG-8）：engine complete/DoD 独立重跑/merge-lock/worktree 隔离不变；既有 engine complete 测试套件全绿
- [ ] #8 不改认领隔离机制：handle-basic-ready.sh 的 exec-lock/cap 幂等/.caps/.wt、单驱动守卫、merge 串行化不变；既有隔离机制测试套件全绿
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-13：原「前台顺序 loop」方案废止。manda-monitor 作为执行座席，解决了受限后台 Agent 无法调用 skill/Agent 工具的根本问题，同时获得并发执行（多 depth-1 subagents）和治理（claim/reap/cancel）能力。supervisorTick 扫描层不变；emit 回调是唯一改造点；dispatch.ts payload 去除后台 Agent 段并注入 phase skill 引用。
<!-- SECTION:NOTES:END -->
