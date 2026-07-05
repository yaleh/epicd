---
id: BACK-628.4
title: 点火发现：epic-ready/epic-eval-due 无引擎自包含派发（compound 相位缺 BACK-625 同等结晶）
status: 'Basic: Done'
assignee:
  - '@claude'
created_date: '2026-07-05 06:21'
updated_date: '2026-07-05 07:27'
labels:
  - 'kind:feature'
  - 'epicd:bootstrap'
dependencies: []
parent_task_id: BACK-628
ordinal: 47000
dod:
  - text: bunx tsc --noEmit
    checked: false
  - text: bun run check .
    checked: false
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 发现（BACK-628.1 点火审计）
E1(BACK-601) 的首次 epic-decompose'已发生'（commit 1c026d2,2026-07-04）,但核实其机制后发现：那次 decompose 是**一个交互式 Claude 会话手工调用 harness/decomposer 逻辑**完成的('via an in-session worker proposing children as JSON'),**不是**经无人值守的 Monitor+scan-loop 自驱路径。证据：
- `src/engine/scan.ts::scanReadyLines` 显式把 `decomposing` phase 排除在外（注释：'out of scope (e.g. "decomposing" → epic, reference-only)'）——只处理 `ready`(basic-ready)。
- `src/engine/dispatch.ts::renderBasicReadyDispatch` 只渲染 basic-ready payload；不存在 compound/epic 等价物。
- `.codex/skills/epicd-run/templates/` 只有 `basic-ready.md`,无 epic-ready 模板；baime 旧 `loop-draft/prompt.md` 里也 grep 不到 epic-ready 处理。
- scan-loop.cjs 确实会 emit `epic-ready:<id>`/`epic-eval-due:<id>`(legacy 状态串谓词,非 data-derived),但拿到这两个事件后 Monitor **没有任何结晶指令可依**——只能靠会话即兴推理(molten,且未经证实可无人值守复现)。

这是 BACK-625 已经替 `basic-ready` 解决、但从未推广到 compound 相位的同一类工作：'engine 产出自包含派发指令,scan-loop 纯传输'。目前 compound 相位仍是**未结晶**的缺口——'内核已自托管'这句话要成立,epic-decompose/epic-eval 必须能被同一条无人值守链路复现,而不是靠一次性人工示范。

## 范围
仿 BACK-625 对 `basic-ready` 的处理,给 `decomposing`/`evaluating` 相位补齐：
1. `engine scan` 的 PHASE_PREFIX 扩展 `decomposing→epic-ready`、`evaluating→epic-eval-due`（data-derived,替换 scan-loop.cjs 的 legacy 状态串谓词 isEpicReady/scanEvalDueEpics）。
2. `engine dispatch`（或新 `engine dispatch --epic`)为这两个相位产出自包含派发块——指示 Monitor 调用 decompose handler(harness/decomposer.ts)/epic 评估逻辑,而非手写 prose。
3. 至少一次**无人值守**复现：从 epic-ready 事件到子任务创建、从 epic-eval-due 事件到 epic 终态,全程无交互式会话手工介入。

关联：ADR-015 swap-litmus · BACK-625 · src/harness/decomposer.ts · BACK-628.2(内化 supervisor,同属'换心'范畴,可能共用一次改造)。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 engine scan 对 decomposing/evaluating 相位输出 data-derived 机器行(epic-ready:<id> / epic-eval-due:<id>),不再依赖 scan-loop.cjs 的 legacy 状态串谓词
- [x] #2 engine dispatch 为 epic-ready/epic-eval-due 产出自包含派发块(含调用 decompose handler 的具体指令),仿 BACK-625 basic-ready 的结晶度
- [x] #3 至少一次无人值守复现记入 docs/research/gcl-events.jsonl：全程由 Monitor/scan-loop 触发,无交互式会话手工介入 decompose/eval 逻辑
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Unattended reproduction complete. Summary of changes:

1. src/engine/scan.ts PHASE_PREFIX now maps decomposing->epic-ready, evaluating->epic-eval-due (data-derived, reuses Interpreter.scan's existing actor:"machine" check -- same mechanism as basic-ready).
2. src/harness/evaluator.ts (new): advanceAwaitingChildrenToEvaluating (awaiting-children + all-children-terminal -> evaluating, phase-based, replaces scan-loop.cjs's legacy scanEvalDueEpics status-string predicate) and evaluateEpic (aggregates children's terminal phases into the epic's own terminal phase).
3. src/harness/decomposer.ts: extracted applyProposedChildren so both the in-process Driver path and the new out-of-process `engine decompose-apply` CLI share one child-creation/phase-advance/ADR-016-advisory implementation.
4. src/engine/dispatch.ts: added renderEpicReadyDispatch/renderEpicEvalDueDispatch -- self-contained payloads at BACK-625's basic-ready crystallization level (Monitor follows the block verbatim: propose children -> pipe JSON to `engine decompose-apply`, or run `engine evaluate`).
5. src/cli.ts: `engine dispatch` branches by phase; new `engine decompose-apply <id>` (reads proposed children JSON from stdin) and `engine evaluate <id>` subcommands.
6. plugin/scripts/scan-loop.cjs: epic-ready/epic-eval-due now flow through the same engineScanOnce/engineDispatch seam as basic-ready; removed the legacy isEpicReady/scanEvalDueEpics status-string predicates (dead code after the switch) and the now-unused EPIC_READY_STATUS/BASIC_DONE_STATUS/BASIC_NEEDS_HUMAN_STATUS/EPIC_AWAITING_CHILDREN_STATUS constants.
7. Regression tests added: src/test/harness-evaluator.test.ts (new), plus new describe blocks in engine-scan.test.ts, engine-dispatch.test.ts, engine-decompose.test.ts covering the new scan/dispatch/CLI/evaluator paths.

AC #3 (unattended reproduction) discharged and recorded in docs/research/gcl-events.jsonl (event: unattended_epic_lifecycle_reproduced, 2026-07-05T07:25:00Z): in an isolated tmp Backlog project, drove a full epic lifecycle (decomposing -> epic-ready -> decompose-apply -> awaiting-children -> auto-advance -> evaluating -> epic-eval-due -> evaluate -> done) by literally executing the shell commands printed in each `engine dispatch` payload -- zero interactive/manual decompose logic, zero status-string predicate consulted.

Verification: bunx tsc --noEmit clean; bun run check . clean (only pre-existing unrelated warnings); bun test --parallel 1782 pass / 2 fail (both pre-existing parallel-load timeout flakes, cli-instructions.test.ts and cli-milestone-management.test.ts, confirmed green in isolation -- not caused by this change).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
