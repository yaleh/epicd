---
id: BACK-602
title: 'E2: 结构化 gate-event log（仪器）'
assignee: []
created_date: '2026-06-26 09:00'
updated_date: '2026-07-05 09:55'
labels:
  - 'kind:epic'
  - 'epicd:E2'
dependencies:
  - BACK-600
ordinal: 3000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
人面向 task 仍是 markdown（视图）；gate event **同时**追加到结构化、可查询的日志（仪器）。引擎只知道 `GateEvent` 的通用形状 `{id, item_id, pipeline_id, gate, actor, verdict, timestamp, payload}` 与读写 API（可上游）。

**边界（§7）**：E/C/H、GCL、delta_H 的语义全在 `payload`，由 baime 的 GCL 管线解释——引擎 core 永不硬编码这些。存储 append-only、可查询（JSONL 或 SQLite，实现待定）。

参考：ADR-011 D-4；baime 讨论记录 §7/§15.3 E2。

---

## 驱动节点（旧→新机制）
本 epic 在 **M1（E0 完成）之后由 epicd 引擎自驱**；旧 loop-backlog 仅作 soak fallback，本 epic 不触发旧机制退役。注意：当前 GCL 事件已临时落在 `docs/research/gcl-events.jsonl`，本 epic 须把该临时格式收敛进正式 `GateEvent` 存储——即这是"临时 JSONL → 引擎正式 gate-event log"的切换点（数据迁移须在 plan 中明确）。

## 测试 / build 机制
- **单元测试**：GateEvent append-only 写入、并发写串行化、读写 API、查询过滤；payload 不被 core 解释的边界测试（core 不含 E/C/H 字段）。
- **e2e**：CLI/API 层集成测试（写入 → 查询往返）；属基质层，无浏览器 e2e。
- **build**：存储选型（JSONL vs SQLite）须在 plan 定下并说明理由；`bunx tsc --noEmit` + `bun run check .` + `bun run build` 全绿。

## Web UI 改进方向
本 epic **不建 UI**，但须提供 **Web 可消费的读 API**——它是 E4（BACK-604）gate-inbox 页面的唯一数据源。读 API 须支持按 pipeline/gate/actor/时间过滤与分页，以便移动优先 inbox 增量加载。E4 依赖此契约，故 API 形状须在本 epic 冻结。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `GateEvent` 通用 schema + append-only 存储（JSONL/SQLite）
- [x] #2 读写 API（引擎给基质，不解释 payload）
- [x] #3 baime GCL 管线可从 log 读取并解释 payload 中的 E/C/H
- [x] #4 引擎 core 不含任何 E/C/H/GCL 硬编码
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# E2: gate-event log — Epic Decomposition

> 颗粒度纪律（CLAUDE.md）：每个 child ≈ 一个可评审 PR（≤~2000 行）。E2 范围内聚
> （单一子系统：GateEvent 存储 + API + 一个现有调用方迁移），故只切两个 child，
> 不比照 E1 按字段轴拆四份。

## 现状 survey（file:line 已核对）
- 唯一现存 gate-event 写入点：`src/harness/stage2-gate.ts:120` `recordStage2Gate`
  产出 `Stage2GateRecord {gate_type:"stage2", timestamp, passed, reason?,
  failures?, rebuiltRepoPath}`，由 `src/cli.ts:4811-4813`
  （`engine stage2-gate` 命令）拼一行 JSON 追加进
  `docs/research/gcl-events.jsonl`（`appendFileSync`，无锁、无 schema、无查询
  API）——这就是 epic description 说的"临时格式"。全仓库 grep 确认这是唯一
  调用方（无需处理第二个迁移点）。
- 目标 `GateEvent` 通用形状（epic description）：
  `{id, item_id, pipeline_id, gate, actor, verdict, timestamp, payload}`。
  `payload` 承载 E/C/H/GCL 语义，core 不解释。

## 存储选型（plan 阶段定，不留到实现中期）
**JSONL，append-only 文件**（非 SQLite）：
- 已有先例（gcl-events.jsonl 本身就是 JSONL），迁移是格式收敛而非推倒重来。
- 不引入新依赖（SQLite 需要 bun:sqlite + schema 迁移机制，当前无证实需求）。
- 满足 append-only + 可查询（顺序读 + 内存过滤，量级：gate event 是低频治理
  事件，非高吞吐日志，无需索引）。
- 若未来量级证明 JSONL 不够（如 O(万)+ 行后查询变慢），再开新 task 评估
  SQLite——不在本 epic 预先设计。

## Sub-Task Decomposition

### 602.1 — GateEvent 核心：schema + append-only 存储 + 读写 API + 查询过滤
- **交付**：新模块（如 `src/core/gate-event-store.ts`）：
  - `GateEvent` 类型（对齐 epic description 的通用形状）。
  - `appendGateEvent(store, event)` — 追加一行 JSON，从不改写/删除已写行
    （append-only）。
  - `queryGateEvents(store, filter?)` — 按 pipeline_id/gate/actor/时间范围过滤，
    支持分页（E4 gate-inbox 增量加载需要）。
  - 存储适配层注入（真实文件 vs 测试 fixture），沿用本仓库既有"real primitive
    注入"惯例（如 `MergeLockFs`/`FieldLockFs`），不新造第二套约定。
- **Acceptance（含 negative control，非仅 DoD 勾选）**：
  - `bunx tsc --noEmit` && `bun run check .` 绿。
  - append-only 的 negative control：构造一次试图"改写/删除已写 event"的调用
    路径，确认真的被拒绝或该 API 根本不提供这类方法（而不是"测试没覆盖这条
    路径"）。
  - core 不解释 payload 的 negative control：构造一个 payload 内含
    `E`/`C`/`H`/`gcl` 等字段名的 event，grep + 走查
    `gate-event-store.ts` 确认代码里没有任何对这些字段名的字符串匹配/特判
    （AC#4 的可验证形式）。
  - 真实并发写测试：多个 Promise（或多进程）并发 `appendGateEvent`，确认写入
    互不丢失/不交错损坏——不是对 mock 锁断言"应该会序列化"。
  - 查询过滤单测：按 pipeline_id/gate/actor/时间范围/分页返回正确子集。
- **依赖**：无（基础）。

### 602.2 — 迁移唯一现存调用方 + 冻结读 API 契约（E4 依赖）
- **交付**：
  - `src/harness/stage2-gate.ts` 的 `recordStage2Gate`/`src/cli.ts`
    的 `engine stage2-gate` 命令改为写入 602.1 的 `GateEvent` 存储（替代直接
    `appendFileSync` 到 `docs/research/gcl-events.jsonl`），字段映射：
    `gate="stage2"`, `verdict=passed?"pass":"fail"`,
    `payload={reason,failures,rebuiltRepoPath}`, `actor="machine"`。
  - 现存 `docs/research/gcl-events.jsonl` 里已积累的历史行**只读迁移**一次
    （one-shot 脚本或 CLI 子命令），不破坏现有分析脚本对该文件的读取假设——
    若有依赖旧路径的消费方，须先 grep 确认（呼应 E1 backfill child 的
    "向后兼容超集"原则）。
  - 冻结读 API 形状：为 E4/BACK-604 gate-inbox 写一个 e2e 往返测试（写入→
    查询），固定分页/过滤参数签名，作为该契约的可执行 spec。
  - AC#3 模拟验证：写一个测试模拟"baime GCL 管线"角色——只用读 API 取出
    payload 里的 E/C/H 字段并断言可解释，同时断言 `gate-event-store.ts`
    自身代码路径没有引用这些字段名（与 602.1 的 negative control 呼应，
    但这次是从"外部消费方视角"验证契约可用，而非从 core 内部验证边界）。
- **依赖**：602.1（需要其存储 + API）。

## Ordering
```
602.1 (GateEvent 核心)
   │
   ▼
602.2 (迁移现存调用方 + 冻结 API 契约 + AC#3 模拟)
```

## Constraints / invariants
- **向后兼容超集**：迁移不删除/不移动 `docs/research/gcl-events.jsonl` 本身
  （历史行只读保留或一次性迁移，不破坏现有对该文件的读取假设）。
- **core 不硬编码 E/C/H/GCL**：payload 是不透明 blob，602.1/602.2 的代码路径
  里不得出现 `if (field === 'E')` 一类特判。
- **无 UI**：E2 只交付读 API；E4 消费，本 epic 不建 web/board 渲染。
- **存储选型已锁定为 JSONL**（见上），不在实现阶段重新讨论。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fresh-context audit (post-evaluate) round 1 findings + resolutions:
- Finding 1 (HIGH, fixed): engine stage2-gate's default --record path collided with the pre-existing legacy baime-GCL-schema file docs/research/gcl-events.jsonl (18 real historical rows, different schema than GateEvent). Fixed by pointing the default to a new docs/research/gate-events.jsonl (src/cli.ts), leaving the legacy file untouched per the epic's own "不删除/不移动" constraint. Verified: tsc/check/bun test --parallel all green (1820 pass/0 fail).
- Finding 2 (MEDIUM, filed as follow-up BACK-635): queryGateEvents does an unvalidated JSON.parse(line) as GateEvent cast; risk substantially reduced now that new writes go to a clean file, but still worth a minimal shape check.
- Finding 3 (nitpick, fixed): epic-level ACs #1-4 checked off to reflect genuinely Done children.
- Deferred: BACK-636 filed for the originally-scoped one-shot migration of the 18 legacy rows into the GateEvent store — no longer required to prevent corruption (writer collision resolved), scope/need to be re-decided independently.
<!-- SECTION:NOTES:END -->
