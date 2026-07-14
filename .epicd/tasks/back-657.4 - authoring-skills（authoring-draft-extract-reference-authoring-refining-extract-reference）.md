---
id: BACK-657.4
title: >-
  authoring skills（authoring/draft extract/reference + authoring/refining
  extract/reference）
assignee:
  - '@claude'
created_date: '2026-07-06 15:51'
updated_date: '2026-07-14 06:36'
labels: []
dependencies: []
references:
  - docs/task-lifecycle-model.md
  - docs/adr/ADR-011-workitem-schema-and-pipeline-contract.md
  - plugin/skills/README.md
  - plugin/skills/primitive-executor/SKILL.md
  - BACK-657.1
  - BACK-657.2
  - BACK-657.3
parent_task_id: BACK-657
ordinal: 89000
pipeline_id: execution
phase: done
parent_id: BACK-657
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
为 authoring/draft 与 authoring/refining 两个机器 phase 建执行 skill：plugin/skills/authoring-draft/(SKILL.md,contract.json) 与 plugin/skills/authoring-refining/(SKILL.md,contract.json)，提取/引用 feature-to-backlog 与 epic-to-backlog 里已在用的 proposal-draft-plus-self-review-loop 与 plan-refinement-review-loop 方法论，改写为 epicd-native、对 baime 零运行时依赖的 skill。creation_path 按方法论是否已有收敛证据判断：若能从本仓 backlog/tasks 历史里找到方法论已被反复实际使用的证据则用 extract，否则用 reference 并在 contract 与任务实现笔记里显式说明理由。SKILL.md 须在开头显式声明运行时接线（monitor 自动 invoke）尚未接通（E7/BACK-608 未完成），今日仅可人工/由人指导的 agent 手动 invoke。在 plugin/skills/phase-coverage.json 登记两条覆盖；更新 src/test/phase-skill-coverage.test.ts 反映覆盖变化。不新增 lint/contracts 机制，复用 BACK-657.1 的 skill-lint.sh 与既有 contract.json 形状；不动 engine 核心机制，不接生产 transport。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 plugin/skills/authoring-draft/{SKILL.md,contract.json} 存在，SKILL.md 显式声明运行时接线待后续（E7/BACK-608）
- [ ] #2 plugin/skills/authoring-refining/{SKILL.md,contract.json} 存在，SKILL.md 显式声明运行时接线待后续（E7/BACK-608）
- [ ] #3 两个 contract.json 的 creation_path 取值经过判断（extract 或 reference/既有 provenance 分类之一），并在任务实现笔记里写明判断理由
- [ ] #4 plugin/skills/phase-coverage.json 登记 authoring/draft->authoring-draft 与 authoring/refining->authoring-refining
- [ ] #5 src/test/phase-skill-coverage.test.ts 更新以反映 authoring/draft 与 authoring/refining 已覆盖
- [ ] #6 bash plugin/scripts/skill-lint.sh --all 通过；grep -ri baime plugin/ 无结果
- [ ] #7 不修改 engine complete/adjudicate/DoD重跑/merge-lock/worktree/claim/pipeline-as-data 机制；不接生产 transport
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: plugin/skills/authoring-draft/{SKILL.md,contract.json} and plugin/skills/authoring-refining/{SKILL.md,contract.json} — two extract-class phase-execution skills for the authoring pipeline's two machine phases (draft, refining; src/engine/pipeline.ts's authoringPipeline states, both actor:"machine"). Both SKILL.md files state near the top, explicitly, that runtime wiring (monitor/engine dispatch auto-invoking these phases) is NOT connected yet (E7/BACK-608 pending) — today invocation is manual/human-directed only. Reused BACK-657.1's contract.json schema/lint/registry unchanged; no new lint/contracts mechanism introduced.

Extract-vs-reference judgment (the task's core discretionary call): plugin/skills/README.md's contract.json schema recognizes exactly three creation_path values — extract, mechanical, experiment-pending — with no "reference" bucket (checked src/test/skill-provenance.test.ts and skill-lint.sh directly; both hard-fail on any other value). mechanical would misrepresent these two skills (they DO encode a real methodology — a self-review loop / an independent-review loop — mechanical is reserved for "no methodology to validate"). experiment-pending would contradict actually shipping the skill now (its schema note says "no skill ships yet"). That leaves extract as the only value in the actually-supported taxonomy that fits "a real methodology has been used", so the substantive judgment was: is there real empirical convergence evidence for it?

Searched this repo's own backlog/tasks/*.md and git log for evidence (not a hypothetical — actual prior runs in this project's own history): grep across backlog/tasks/*.md turns up dozens of tasks recording explicit "Proposal ... APPROVED"/"Plan review iteration N: APPROVED" cycles, including real NEEDS_REVISION->fix->APPROVED convergence with a concrete defect caught and corrected (e.g. BACK-605.7's plan review iteration 1 caught a real ordering bug in a scan-before-register sequence, fixed in iteration 2; BACK-605.1's plan review iteration 1 caught a real phase-ordering defect (import before creation), fixed in iteration 2; BACK-600.9's proposal->plan review path recorded as "9 invariants passed, correctly scoped as Basic"). For the draft/proposal step specifically: BACK-663's notes show an explicit "Proposal self-review: APPROVED" round; BACK-600 (this repo's own E0 keystone epic) and BACK-657 (this very epic) both show "Epic proposal approved" as a real recorded event, not a hypothetical description. This is exactly the bar the task asked me to check: "proven via repeated actual use across many tasks in this repo's own history" — met for BOTH the draft/proposal-review loop and the plan-refinement-review loop, so BOTH skills are creation_path=extract.

Nuance documented (per the task's explicit instruction, since it matters and the schema can't express it): this evidence is NOT a dedicated docs/research/ methodology-bootstrapping write-up with Observe->Codify->Automate stages and V_instance/V_meta convergence metrics (that formal apparatus exists in this repo only for LFDD, under docs/research/baime-fixpoint-convergence/). It is empirical convergence evidence recorded as a byproduct of this project's own normal operation — every task in backlog/tasks/, including this very BACK-657.4, is itself drafted and refined via this same two-phase pattern, so the convergence evidence is self-referential and extremely repeated, just not written up as a standalone experiment document. provenance in each contract.json points at one concrete real task file (back-663 for draft, back-605.1 for refining) that documents an actual converged review round, plus a provenance_note field explaining this nuance in full (both contract.json files carry that extra field; skill-lint.sh only validates phase/creation_path/provenance so the extra field does not break the lint).

Registered authoring/draft -> authoring-draft and authoring/refining -> authoring-refining in plugin/skills/phase-coverage.json. Updated src/test/phase-skill-coverage.test.ts: added two positive-control tests (mirroring the existing execution/ready one) and tightened the "remaining uncovered" assertion from 4 phases to 2 (execution/decomposing, execution/evaluating — owned by BACK-657.3, running concurrently in a separate worktree not yet merged here); the it.failing() full-coverage invariant is untouched and correctly stays red (2 real gaps remain from this branch's perspective).

No changes to engine mechanics (complete/adjudicate/DoD re-run/merge-lock/worktree/claim/pipeline-as-data) and no production transport wired — both explicitly out of scope per the task and per BACK-657's non-goals.

Verification: bunx tsc --noEmit clean. bun run check . itself is broken pre-existing in this worktree (biome vcs.useIgnoreFile reports 0 files processed for "." regardless of changes — confirmed also broken on an unrelated sibling worktree with zero changes, and previously documented as pre-existing by BACK-657.2's own notes); ran bunx biome check against every file this task touched directly instead — clean. bun test (sequential, full suite): 2009 pass / 2 skip / 0 fail (up from BACK-657.2's 2007 baseline, +2 for the new positive-control tests) — note the worktree was initially missing its node_modules symlink (per this repo's L0 config, worktree-symlinks: node_modules), which made the one build-dependent test (epicd-plugin-synthetic-repo.test.ts) fail; created the missing symlink (gitignored, not a tracked change) and reran clean. bun test --parallel ./src: 2008 pass / 1 fail — the 1 failure (has-children-indicator.test.ts, a 5000ms timeout under parallel contention) is the documented pre-existing parallel-only flake; confirmed passing in isolation (5/5). plugin/scripts/skill-lint.sh --all exits 0 (authoring-draft and authoring-refining both pass; primitive-executor still passes; 5 legacy skills skip gracefully). grep -ri baime plugin/ returns zero matches. bun scripts/fixpoint-back665.ts: 7/10 green, unchanged from BACK-657.2's baseline (phase-skill-coverage stays green; the 3 red checks are pre-existing and owned by other tasks — BACK-664, BACK-657 child 3, BACK-660/BACK-664 — no regression from this change).

Note: BACK-657.4 itself had to be created (did not pre-exist in this worktree) — this worktree's copy of the epic only listed BACK-657.1/.2 as subtasks; a concurrent worktree had already claimed BACK-657.3 for the epic-lifecycle-skills child, so the auto-assigned next ordinal in this worktree collided at .3. Manually renumbered the newly-created task file/frontmatter to BACK-657.4 (no CLI support exists for explicit ID assignment) before starting implementation, to match the task actually assigned to this session.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
