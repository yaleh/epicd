---
id: BACK-686
title: pipeline 驱动机制与队列语义：driver 纯传输 + claim 硬化 + actor 四分类 + 统一 implementing
assignee: []
created_date: '2026-07-08 03:58'
updated_date: '2026-07-08 07:36'
labels:
  - 'kind:epic'
  - 'area:engine'
  - 'area:runtime'
dependencies: []
references:
  - docs/proposals/2026-07-08-pipeline-driving-and-queue-mechanism.md
priority: high
ordinal: 96000
pipeline_id: execution
phase: done
entry_phase: authoring/backlog
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
> 状态：done（3 child A/B/C 均已合并、独立 fresh-context adjudicate 通过；epic 级 Stage-4 机械验收见下）。规格来自已收敛 proposal `docs/proposals/2026-07-08-pipeline-driving-and-queue-mechanism.md`（§11 决策与冻结）。本 Epic 拆为 3 个 child（A/B/C），逐个走 authoring→refining 钉死 plan 后再 promote。

## 背景

BACK-682 落地后一次真实驱动暴露两件事：(1) driver 从不写 phase——迁移由各 phase 的 actor 落笔；(2) `actor=machine` 太粗，把"引擎 tick 内机械活"与"必须派 LLM 会话的长耗时活"混为一类。proposal 据此把驱动机制收敛为：driver=纯传输、队列=(phase,claim) 派生、actor 四分类(machine-agent/machine-mechanical/gate/human/none)、claim 升为带租约+reaper 的一等 in-flight 记录、统一 implementing(分解是它的内部分支)。

## 冻结的 spine（proposal §11.1，本 Epic 及 child 不得推翻）

1. driver = 纯传输：phase 迁移永远由该 phase 的 actor 落笔，driver 从不写 phase。
2. 两模式同一循环：fixpoint-convergence(前台)与 monitor(后台)是同一 tick 循环的两套 invoke/claim 实现；替换 driver 不改变任何一次 phase 迁移的落笔方。
3. 队列 = (phase, claim) 派生：不加/删 phase 表达队列，不在处理时清空 phase；崩溃恢复靠 claim 租约过期自动重排队。
4. actor 四分类 + kind 绑定：machine-agent↔skill / machine-mechanical↔script / gate↔script+skill / human / none；registry 条目的 kind 携带该分类。
5. claim 升为一等：引擎原生、带租约 + reaper 的 in-flight 记录，覆盖全部 agent-phase；存 claim 元数据(worktree/branch/entry_phase/lease/puller 标识)，不存 phase 副本。
6. 统一 implementing：promote 恒落 implementing；decompose 是 implementing 内部分支(agent 判定 compound → invoke epic-decompose 子能力建子 → awaiting-children)；分支汇入 adjudicating，"流回"只经 guarded retreat→entry_phase。

## 定案的叉（proposal §11.2）

- evaluating 折进 adjudicating gate（作为独立 phase 退役）。
- draft→drafting、spike→spiking、ready→implementing 改名（同批）。
- epic-decompose 不作 phase-skill，由 implementing 的 skill 内部调用；phase-coverage 删 execution/decomposing 条目。

## 交付物裂解（3 child，proposal §11.3）

- **child A**：claim/in-flight 硬化（引擎原生 claim 记录 + staleness reaper + A1: entry_phase 在 promote 写 + adjudicating claim 保护 + puller 上下文标识）。
- **child B**：actor 细化 + kind 绑定（registry 加 kind + evaluating 降 script 退出 dispatch + adjudicating 变 gate）。
- **child C**：统一 implementing（ready→implementing 承重改名 + decomposing 折入 + promote 去分叉 + kind:epic 降 hint + drafting/spiking 改名）。

落地顺序：A1 → (A2 ∥ B) → C。

## 终态 execution pipeline（proposal §10.6）

implementing(agent) ─┬─ 叶子 ──────────────┐
                     └─ compound: 建子 ─▶ awaiting-children(none) ─┘
                                                                   ▼
                                                 adjudicating(gate) ─▶ done
                                                        └─▶ needs-human / retreat→entry_phase(implementing)

execution phase 数 7→5：implementing / awaiting-children / adjudicating / needs-human / done。

## 自举安全序约束（proposal §11.5）

每步 merge 后引擎必须仍能驱动自己(Stage-2 fixpoint)：decomposing 不能在有 in-flight epic 用它时删；ready→implementing 的 backfill 与引擎读取路径同批切；C 的 Acceptance 必须挂"引擎用新 implementing 驱动一个真实 epic 到 done"的自举 meter。

## 依赖关系

- BACK-660（monitor）依赖 child A。
- BACK-682 的死 retreat 边（entry_phase 从未写入）由 child A1 修复。

## Integration Acceptance

Stage-4 fixpoint-meter：对已合并的 assembled system（非各 child DoD 并集）逐条重跑。AC#6 的 stale-label 路由 bug（gateAdjudicating 曾按 kind:epic 标签而非真实 children 分叉）即由本节重跑发现并修复（commit 5318a630）。

```bash
bun test src/test/engine-implementing-self-host-e2e.test.ts src/test/pipeline.test.ts src/test/engine-claim-reaper.test.ts src/test/engine-retreat-real-task.test.ts src/test/engine-scan-kind.test.ts src/test/engine-adjudicating-gate.test.ts src/test/engine-fields-backfill.test.ts src/test/engine-decompose-precedence.test.ts src/test/engine-autonomous-e2e.test.ts
```

```bash
! grep -rn '"ready"\|"decomposing"' src/engine
! grep -rn '"draft"\|"spike"\|"ready"' src/engine/pipeline.ts
grep -n 'kind:epic.*hint\|hint.*kind:epic' plugin/skills/primitive-executor/SKILL.md
```

```bash
bunx tsc --noEmit
```

## 参考

- docs/proposals/2026-07-08-pipeline-driving-and-queue-mechanism.md（权威规格，§1–11）
- docs/task-lifecycle-model.md、docs/adr/ADR-010/011/015、docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md
- plugin/skills/{fixpoint-convergence,adjudicate,primitive-executor}/SKILL.md
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 [整体自举] 引擎不依赖 monitor/任何外部 driver，用统一后的 implementing 把一个真实 epic 端到端驱动到 done：promote→implementing(内部判 compound)→建子→awaiting-children→adjudicating(gate)→done；verify: 组合运行 A/B/C 三 child 落地后的 src/test/engine-implementing-self-host-e2e.test.ts（对齐 engine-autonomous-e2e.test.ts 模式），全程 0 次 monitor/human 介入
- [x] #2 [队列语义业务可见] execution pipeline 恰为 5 态 implementing/awaiting-children/adjudicating/needs-human/done（7→5），'排队 vs 在跑' 完全由 (phase, claim) 派生，不再有 ready/decomposing 残留态；verify: src/test/pipeline.test.ts 断言 states 长度与名称；grep -rn '"ready"\|"decomposing"' src/engine 为空
- [x] #3 [claim 崩溃恢复业务可见] kill -9 一个正在 implementing 的 worker 后，无需人工干预，staleness reaper 在租约过期后自动让该 task 重新可派发（phase 不变、claim 消失），不会永久卡在 processing；verify: src/test/engine-claim-reaper.test.ts + src/test/engine-implementing-self-host-e2e.test.ts 中的注入 stale claim 场景
- [x] #4 [退回边真实可用] BACK-682 的三分类回退契约在真实 task 上不再是死代码：一个真实 task 从 execution/adjudicating 单步回退到其 entry_phase（=implementing），契约校验 + gap-fingerprint 去重（第二次同类 gap → needs-human 而非再退）全部生效；verify: src/test/engine-retreat-real-task.test.ts
- [x] #5 [spawn 成本可见节省] 端到端跑一个 epic 时，kind:script 阶段（evaluating 折叠后）与 adjudicating gate 的 light 路径全程 0 次会话 spawn，只有 kind:skill 与 gate 的 full 路径才 spawn；verify: src/test/engine-scan-kind.test.ts + src/test/engine-adjudicating-gate.test.ts 断言 spawn 调用计数
- [x] #6 [改名批次完整、无空窗] draft/spike/ready 三个改名（→drafting/spiking/implementing）与对应 backfill 同批落地，任何时刻不存在'board 显示旧名、引擎只认新名'的空窗；verify: src/test/engine-fields-backfill.test.ts 覆盖三个旧名的 backfill；grep -rn '"draft"\|"spike"\|"ready"' src/engine/pipeline.ts 为空
- [x] #7 [对外契约不变] 已发布 MCP tool 名称与 CLI 子命令签名相较本 Epic 开工前一致；verify: grep -rn 'mcp__backlog__' src/mcp/tools/ 与 bun run cli --help 输出对 main 基线的 diff 为空
- [x] #8 [逐步自举安全] child A / (A2∥B) / C 三次 merge 中的每一次落地后，引擎立即重新跑一次 Stage-2 fixpoint（自己驱动自己）并保持绿——任何一次 merge 之后若自举断裂，视为该次 merge 未完成，不得继续下一 child；verify: 每次 child 合并后重跑 src/test/engine-autonomous-e2e.test.ts 或其后继 self-host 测试
- [x] #9 [kind:epic 降级为可推翻先验，业务可见] adjudicating 的 compound/primitive 路由恒由真实 children 数量判定，不由 kind:epic 标签判定（标签过期不会误导已决策的路由，双向）；decompose 判断本身（CLAUDE.md 两段式 test）是 primitive-executor skill 内的 LLM 判断，非机械代码，其双向覆盖语义记录于 plugin/skills/primitive-executor/SKILL.md（非机械项，明确标注）；verify: bun test src/test/engine-decompose-precedence.test.ts；grep -n 'kind:epic.*hint\|hint.*kind:epic' plugin/skills/primitive-executor/SKILL.md 非空
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Stage-4 evaluate: engine evaluate BACK-686 ran the epic's own Integration Acceptance shell commands (mechanical, ADR-019 fixpoint-meter) against the assembled system, then aggregated children A/B/C's terminal phases — all green, epic → done. One real cross-child integration bug was found and fixed during this Stage-4 pass before evaluate: gateAdjudicating (src/engine/adjudicate-gate.ts) routed epic-vs-primitive on the stale kind:epic label instead of real children count, which could let an unfinished kind:epic-labeled leaf slip to done; fixed in commit 5318a630, regression-tested in engine-adjudicating-gate.test.ts and engine-decompose-precedence.test.ts. AC#6 (renumbered #9) rewording: split the mechanical routing guarantee (tested) from the decompose test's own LLM-judgment override semantics (documented in primitive-executor/SKILL.md, explicitly flagged non-mechanical per CLAUDE.md AC conventions) — the originally-named verify test src/test/engine-decompose-precedence.test.ts did not exist pre-session; now created scoped to the mechanical guarantee only. Full bun test --parallel: 2065 pass/0 fail; bunx tsc --noEmit clean; bun run check . clean (12 pre-existing warnings).
<!-- SECTION:NOTES:END -->
