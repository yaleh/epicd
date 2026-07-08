---
id: BACK-657.3
title: epic-lifecycle skills（execution/decomposing extract + evaluating mechanical）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-06 15:50'
updated_date: '2026-07-07 12:58'
labels: []
dependencies: []
references:
  - docs/adr/ADR-018*.md
  - docs/adr/ADR-019*.md
  - src/engine/dispatch.ts
  - src/harness/evaluator.ts
  - scripts/fixpoint-back665.ts
  - BACK-657.1
  - BACK-657.2
parent_task_id: BACK-657
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
为 execution/decomposing 与 execution/evaluating 两个机器 phase 建执行 skill：plugin/skills/epic-decompose/(SKILL.md,contract.json) [extract, provenance: ADR-018] 与 plugin/skills/epic-evaluate/(SKILL.md,contract.json) [mechanical, 声明无方法论]；在 plugin/skills/phase-coverage.json 登记两条覆盖；更新 src/test/phase-skill-coverage.test.ts 反映覆盖变化。同时修复 ADR-019 gap：src/harness/evaluator.ts 的 evaluateEpic 今日只聚合子任务终态、从不运行 epic 自身 Integration Acceptance——须改为先跑 IA 全绿才继续聚合子任务终态，任一 IA 命令失败或有子任务 needs-human 均路由 needs-human。不动 dispatch.ts 与其余引擎核心机制（complete/adjudicate/DoD重跑/merge-lock/worktree/claim/pipeline-as-data）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugin/skills/epic-decompose/{SKILL.md,contract.json} 存在，creation_path=extract，provenance 引用 ADR-018
- [x] #2 plugin/skills/epic-evaluate/{SKILL.md,contract.json} 存在，creation_path=mechanical，声明无方法论
- [x] #3 plugin/skills/phase-coverage.json 登记 execution/decomposing->epic-decompose 与 execution/evaluating->epic-evaluate
- [x] #4 src/test/evaluate-runs-integration-acceptance.test.ts 新增并通过：IA 全绿+子任务全 done -> epic done；IA 有失败命令 -> epic needs-human（即便子任务全 done）
- [x] #5 src/harness/evaluator.ts 的 evaluateEpic 实际运行 epic 自身 Integration Acceptance 命令并据此 gate，不再仅聚合子任务终态
- [x] #6 src/test/phase-skill-coverage.test.ts 更新以反映 execution/decomposing 与 execution/evaluating 已覆盖
- [x] #7 bash plugin/scripts/skill-lint.sh --all 通过；bun scripts/fixpoint-back665.ts 的 evaluate-runs-integration-acceptance 检查转绿
- [x] #8 不修改 src/engine/dispatch.ts；不触碰 complete/adjudicate/DoD重跑/merge-lock/worktree/claim/pipeline-as-data 机制
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation summary (BACK-657.3, mirrors BACK-657.1/.2 style):

Delivered two phase-execution skills + the ADR-019 evaluate-gap fix, per the epic's own scope-addendum for child 3.

1. plugin/skills/epic-decompose/{SKILL.md,contract.json} — execution/decomposing, creation_path=extract. Extracts the PR-sizing/fold-test decomposition heuristics referenced as "ADR-018" in docs/task-lifecycle-model.md §6 (no separate docs/adr/ADR-018*.md file exists on disk; its converged, currently-enforced content lives in this repo's own CLAUDE.md "Task decomposition granularity" section, cited as provenance). Mirrors src/engine/dispatch.ts's renderEpicReadyDispatch (untouched) as a standalone skill: read epic plan -> judge granularity -> propose children JSON -> `engine decompose-apply`.

2. plugin/skills/epic-evaluate/{SKILL.md,contract.json} — execution/evaluating, creation_path=mechanical, provenance="mechanical: no methodology" (deterministic aggregation, no judgment call). Mirrors renderEpicEvalDueDispatch (untouched) as a standalone skill wrapping `engine evaluate`.

3. Both registered in plugin/skills/phase-coverage.json. src/test/phase-skill-coverage.test.ts updated: execution/decomposing and execution/evaluating now covered; only authoring/draft + authoring/refining remain gaps (BACK-657.4 scope, running in parallel in its own worktree).

4. ADR-019 evaluate-gap fix (the substantive engine change): src/harness/evaluator.ts's evaluateEpic previously ONLY aggregated children's terminal phases, never running the epic's own "## Integration Acceptance" -- an epic could reach done with its own end-to-end acceptance never having run. Fix, TDD (red -> green, src/test/evaluate-runs-integration-acceptance.test.ts written first and confirmed failing against the old evaluator before the fix):
   - New exported extractIntegrationAcceptanceCommands(description) in evaluator.ts: extracts every fenced shell code block inside the Description's "## Integration Acceptance" subsection (reuses the newly-exported extractSection from src/markdown/parser.ts rather than re-implementing section extraction -- that regex previously existed privately in 3 separate files: parser.ts, ui/checklist.ts, core/backlog.ts; exported the parser.ts copy for reuse per the simplicity-first rule, left the other two untouched as out-of-scope refactors).
   - Generalized src/harness/dod-runner.ts: extracted runShellCommands(commands, cwd) as the shared Bun.spawn-based shell-gate primitive; runDoD (task.dod gates) now delegates to it, and evaluateEpic uses the same primitive for Integration Acceptance commands -- one shell-gate runner, not two divergent copies.
   - evaluateEpic now: runs IA commands (if the section is present) via runShellCommands against core.filesystem.rootDir; any non-zero exit routes the epic straight to needs-human (children not even consulted); only if all IA commands pass (or none exist) does it fall through to the pre-existing children-terminal-phase aggregation, unchanged.
   - Convention documented in epic-evaluate/SKILL.md: an IA item must be a fenced shell code block to be machine-enforced; plain prose/inline-code list items are documentation only (a deliberate, simple convention -- avoids fragile inline-code-span parsing for mixed-format IA sections).

5. Zero-baime constraint verified: `grep -ri baime plugin/` finds nothing new.

Verification results:
- bunx tsc --noEmit: clean.
- bunx biome check (equivalent to `bun run check .` -- the bare `bun run check .` script errored in this worktree with "No files were processed... ignored: ." unrelated to this change, confirmed pre-existing by running the same command against a clean stash; `bunx biome check <files>` used directly instead, 0 errors after --write auto-sorted one import block).
- bun test (sequential, full suite): 2012 pass / 2 skip / 1 fail. The 1 fail (src/test/epicd-plugin-synthetic-repo.test.ts) is a pre-existing environment gap unrelated to this change -- `bun run build` fails because `node_modules/@tailwindcss/cli` is not installed in this worktree; confirmed identical failure with this task's changes fully stashed.
- bun test --parallel ./src: machine was under extreme load during this session (uptime load average 19-27 on a 1-session-per-core-ish box, many concurrent agent sessions/background monitors); saw 27-28 unrelated tests timeout-flake under --parallel across repeated runs (cli-milestone-management, engine-promote, task-dod-gate, etc. -- none touching evaluator.ts/dod-runner.ts/parser.ts/skill-registry.ts). Every one of those tests, plus every test file this change actually touches or is adjacent to (evaluate-runs-integration-acceptance, harness-evaluator, phase-skill-coverage, skill-contracts, skill-provenance, engine-dod-runner, cli-dod-gate, task-plain-text-dod-gates, complete-task-dod-gates-regression, engine-spawn-dod, engine-decompose), passes reliably (0 fail) when run directly/in isolation -- confirming load-induced flakiness, not a regression from this diff.
- bash plugin/scripts/skill-lint.sh --all: pass (epic-decompose, epic-evaluate, primitive-executor all pass; 5 legacy operation skills skip as designed).
- bun scripts/fixpoint-back665.ts: 8/10 green, up from 7/10 -- evaluate-runs-integration-acceptance flipped from red to green. The 2 remaining reds (no-persisted-status-role, epicd-self-sufficient-no-baime) are BACK-664/BACK-660 scope, untouched by this task.

Constraints honored: src/engine/dispatch.ts untouched; no changes to complete/adjudicate/DoD-rerun/merge-lock/worktree/claim/pipeline-as-data mechanics (only evaluateEpic's own decision logic in src/harness/evaluator.ts changed); no second phase->skill manifest introduced; no new lint/contracts mechanism (reused BACK-657.1's skill-lint.sh, phase-coverage.json, phase-skill-coverage.test.ts).

Left on branch task/BACK-657.3, not merged into main, per instructions.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
