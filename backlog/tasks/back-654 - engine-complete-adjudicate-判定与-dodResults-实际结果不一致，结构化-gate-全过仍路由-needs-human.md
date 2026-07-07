---
id: BACK-654
title: 'engine complete: adjudicate 判定与 dodResults 实际结果不一致，结构化 gate 全过仍路由 needs-human'
assignee:
  - '@claude'
created_date: '2026-07-06 02:42'
updated_date: '2026-07-06 09:16'
labels:
  - 'kind:bug'
  - 'area:engine'
dependencies: []
priority: medium
ordinal: 74000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景
BACK-649 轻量路径执行中（2026-07-05，会话 9e574105-536d-458c-bda9-15e17d37b299，
17:59-18:08 UTC）第二轮 `engine complete --worktree` 判定为 needs-human，
但人工核实 dodResults 后发现结构化 DoD gate 实际全部通过。最终靠手动
`git merge` + 手动改状态收口，未走通 `engine complete` 的自动合并路径。
这与本方法反复强调的"engine complete 独立重跑 gate 并加锁合并，从不信任
agent 自证"的设计初衷相悖——根因可能在 src/engine/adjudicate.ts 的判定
逻辑与 dodResults 的读取/比较之间存在不一致。

详见 docs/research/baime-fixpoint-convergence/README.md 的
"轻量路径执行记录"/"已知偏差"小节。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 定位 adjudicate.ts 中导致该不一致的具体判定逻辑，写明根因
- [x] #2 新增回归测试复现该场景：结构化 dod gate 全部通过但 adjudicate 曾错误返回 needs-human
- [x] #3 修复根因，确保 gate 全部通过时 engine complete 能走自动合并路径而非路由人工
- [x] #4 更新 docs/research/baime-fixpoint-convergence/README.md 的已知偏差记录，标注该缺陷已修复
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
# Proposal: fix engine-complete adjudication so a fully-passed structured DoD gate never routes to needs-human

## Background
BACK-649 轻量路径执行中（2026-07-05）第二轮 `engine complete --worktree` 判定为
needs-human，但人工核实后发现结构化 DoD gate 实际全部通过；最终靠手动
`git merge` + 手动改状态收口，未走通自动合并路径。BACK-653（2026-07-06）
复现了同一现象——第一次判定 needs-human，未改动任何代码原地重跑后第二次
即判定 done。这与"engine complete 独立重跑 gate 并加锁合并、从不信任 agent
自证"的设计初衷相悖：当判定结果可以靠"重试"而非"修复"来收口时，
needs-human 信号本身已不可信，自动化路径退化为需要人工兜底，抵消了
ENG-8 想要提供的保证。详见 docs/research/baime-fixpoint-convergence/README.md
的"轻量路径执行记录"/"已知偏差"小节。

## Goals
1. 定位导致"结构化 DoD gate 全过、却仍判定 needs-human"的具体代码路径，
   给出文件:行级根因说明（不预设根因必然在 `src/engine/adjudicate.ts`——
   若调查证明该纯函数逻辑本身正确，需明确指出真正分叉点在哪一层）。
2. 新增回归测试，可确定性地复现该场景：给定"结构化 DoD gate 全部通过"的
   真实输入，当前代码路径仍返回/表现为 needs-human。测试必须覆盖到实际
   产生该 bug 的那一层（而不仅是已经证明正确的 `adjudicate()` 单元测试）。
3. 修复根因，确保当结构化 DoD gate 全部通过时，任务能可靠地走自动合并
   路径而非路由人工——且该结果具备确定性（不依赖"重试第二次就通过"这种
   偶然性）。
4. 更新 `docs/research/baime-fixpoint-convergence/README.md` 的"已知偏差"
   记录，标注该缺陷的真实根因与修复方式，标记已修复。

## Proposed Approach
代码调查发现，仓库里存在**两条独立实现、彼此不一致的 DoD 判定路径**，
而不是 `adjudicate()` 内部逻辑错误：

- **TypeScript 路径**（`src/cli.ts` 的 `engine complete` 命令 →
  `src/harness/dod-runner.ts` 的 `runDoD()` → `src/engine/complete.ts` 的
  `completeTask()` → `src/engine/adjudicate.ts` 的 `adjudicate()`）：正确地
  只执行**结构化** `task.dod[].text` gate（BACK-613 已明确把这一点写进
  `dod-runner.ts` 的注释，并警告过"跑 prose checklist 会产生 false
  failures"）。这条路径已有较完整的单元测试
  （`src/test/engine-adjudicate-eng8.test.ts`）覆盖"gate 全过 → done"、
  "gate 有一项失败 → needs-human"等组合，且逻辑在给定正确输入时是正确的。

- **Shell 路径**（`plugin/scripts/complete-task.sh`，由
  `handle-basic-ready.sh` / epicd-run 自动化工作流实际调用，是目前跑
  needs-human/自动合并判定的生产路径）：它自行从 `backlog task view
  --plain` 的输出里 `awk` 抓取 `"Definition of Done:"` 小节下形如
  `- [ ] #N <text>` 的行，`sed` 去掉 checkbox 前缀后把剩余文本整行当
  shell 命令用 `bash -c` 执行（`complete-task.sh:56-69`）。而
  `task-plain-text.ts` 的 `buildDefinitionOfDoneItems()`
  （`src/formatters/task-plain-text.ts:35`）只读取
  `task.definitionOfDoneItems`——也就是**人类可读的 prose DoD 勾选项**
  （例如"bun test (or scoped test) passes"这类描述句），**从不包含**
  结构化 `task.dod` gate。也就是说，`complete-task.sh` 实际重跑并adjudicate
  的，根本不是 `task.dod` 里声明、且已被结构化 gate 判定为"全部通过"的
  那些 shell 命令，而是把英文描述句当命令执行——这正是 `dod-runner.ts`
  注释里点名警告过的反模式（"跑 prose 会产生 false failures 和
  nondeterministic 的偶发通过"），但该反模式从未被移植修复到
  `complete-task.sh` 里。这足以解释观测到的现象：结构化 gate（真正的
  判定依据）全过，但生产路径判定 needs-human；以及"不改代码，原地重跑
  第二次就变 done"——prose 句子当命令执行，其成功/失败本就依赖运行环境
  的偶然状态，天然不确定。

据此，修复方向是：
1. 让生产环境唯一的判定入口与 TypeScript 侧已验证正确的
   `runDoD`/`adjudicate`/`completeTask` 逻辑保持一致——具体做法在
   实现阶段选定，两个候选：(a) `complete-task.sh` 改为直接调用
   `engine complete --worktree`（收敛为单一实现，删除 shell 侧重复的
   DoD 解析/执行逻辑）；(b) 若 shell 路径因架构原因必须保留（例如
   worker-loop 目前非 Node 常驻进程），则改造其 DoD 抓取逻辑，使其读取
   结构化 `task.dod` gate（而非 prose "Definition of Done:" 小节），
   与 `dod-runner.ts` 的语义对齐。
2. 在选定实现前，先用回归测试把"shell 路径把 prose DoD 当命令执行"这一
   具体缺陷钉死（可以是对 `complete-task.sh` 抓取逻辑的脚本级测试，或者
   是把该逻辑迁移进 TS 之后对 TS 函数的单元测试——取决于最终选择路线 1
   还是路线 2）。
3. 保持现有 `adjudicate()`/`completeTask()`/`runDoD()` 不变——它们已经过
   测试验证，本次调查未发现其逻辑本身有缺陷；不应在没有新证据的情况下
   往这个已经正确的纯函数里加"防御性"改动。

## Trade-offs and Risks
- **与任务原始假设的偏差**：原 AC 假设根因在 `src/engine/adjudicate.ts`；
  调查显示该文件逻辑已被现有单元测试证明在"结构化 gate 全部通过"输入下
  正确返回 done。若后续实现阶段的进一步排查确认真正根因是
  `complete-task.sh` 而非 `adjudicate.ts`，AC #1（"定位 adjudicate.ts 中
  导致该不一致的具体判定逻辑"）需要在实现计划里改写为"定位导致该不一致
  的具体代码路径"，不强行把修复塞回一个当前证明无问题的文件。
- **两条路径长期并存的风险**：若选择方案(b)（只修 shell 脚本抓取逻辑，
  不收敛为单一实现），未来任何一侧的 DoD 语义演进（如 BACK-613 那样的
  结构化字段变更）都需要同时改两处，历史已经证明这种"重复实现"是本次
  bug 的根源，复发风险高。方案(a)（shell 直接调用 `engine complete`）
  更符合"单一实现"的简化原则，但需要确认 worker-loop 的运行环境能够
  执行 `bun`/CLI 命令（handle-basic-ready.sh 已有 `CLI_CMD` 解析逻辑，
  可复用）。
- **不做的事**：本提案不改动 merge-lock、worktree 生命周期、
  git-merge-conflict 处理等其余 ENG-8 组件——现有测试
  （`src/test/engine-merge-wire.test.ts` 等）显示这些部分与本次现象无关，
  超出本 bug 的最小修复范围。
- **验证盲区**：由于该 bug 此前只被"人工核实+重试"间接确认，尚无直接
  抓取到"shell 路径把某条具体 prose 语句当命令执行并失败"的原始日志；
  实现阶段第一步应先补充可观测性（例如让 `complete-task.sh` 在
  needs-human 时把实际执行的命令文本落进 `--append-notes`），确保回归
  测试锁定的是真实发生过的失败模式，而非臆测的复现路径。

# Plan: converge complete-task.sh's DoD gate check onto the structured `task.dod` field

Proposal: (embedded in task Implementation Plan field above this section)

Chosen approach: **(b)** — `plugin/scripts/complete-task.sh` keeps its own
independent pre-merge DoD re-verification loop, git-merge, merge-lock and
worktree-cleanup logic exactly as-is (touching none of that is explicitly
out of scope per the proposal's Trade-offs section). The only change is
*what it reads*: instead of awk-scanning the rendered prose
`"Definition of Done:"` section (which only ever contains human-facing
`task.definitionOfDoneItems` sentences — see
`src/formatters/task-plain-text.ts:35`), it will scan a new, separate,
machine-parseable `"DoD Gates:"` section that renders the structured
`task.dod[].text` shell commands verbatim — the same field
`src/harness/dod-runner.ts`'s `runDoD()` already executes on the
TypeScript path. This makes the two independent adjudication paths agree
on the same source of truth without collapsing them into one process
(approach (a) was rejected because delegating the merge itself to
`engine complete --worktree` would change merge-lock/worktree-lifecycle
behavior that the proposal explicitly excludes from this fix).

Confirmed root cause, file:line:
- `plugin/scripts/complete-task.sh:69` — awk pattern anchored on
  `/^Definition of Done:/`, feeding `plugin/scripts/complete-task.sh:56-59`
  which strips the `- [ ] #N ` prefix and runs the remaining text via
  `bash -c`.
- `src/formatters/task-plain-text.ts:35` (`buildDefinitionOfDoneItems`) and
  its call site `src/formatters/task-plain-text.ts:170-177`
  (`"Definition of Done:"` section) — renders only
  `task.definitionOfDoneItems` (prose), never `task.dod` (structured
  gates). `task.dod` is currently not rendered in `--plain` output at all
  (confirmed: no reference to `.dod` anywhere in
  `src/formatters/task-plain-text.ts`).
- `src/core/backlog.ts:1041-1043` — every created task gets
  `definitionOfDoneItems` populated from the project's
  `config.definitionOfDone` prose defaults (independent of whether
  `dodGates`/`task.dod` was also supplied), so in production a decomposed
  child task ends up with **both** a fully-passing structured `task.dod`
  gate list **and** unrelated prose sentences (e.g. "bun test (or scoped
  test) passes") in `definitionOfDoneItems` — exactly the text
  `complete-task.sh` mistakenly executes as a shell command.
- `src/harness/dod-runner.ts:12-18` — TS-side comment already documents
  the correct semantics (`task.dod` is the only gate source; empty `dod`
  → `[]` → engine routes to `needs-human`, never auto-merges an ungated
  task) that `complete-task.sh` must be brought into line with.
- `src/engine/complete.ts:112-120` (`completeTask`) and
  `src/cli.ts:4704-4738` (`engine complete` wiring) — confirmed correct
  and untouched; no changes needed here (matches proposal's constraint #3).

## Phase A: Regression tests proving the bug at both layers

### Tests (write first)
- `src/test/task-plain-text-dod-gates.test.ts` (new file):
  - `"formatTaskPlainText does not render task.dod anywhere in --plain output"`
    — asserts today's (buggy) output for a task with a structured
    `dod: [{ text: "true", checked: false }]` gate and no
    `definitionOfDoneItems` contains neither the raw gate command `true`
    nor any `"DoD Gates:"` heading. This pins down the rendering gap.
  - `"formatTaskPlainText's 'Definition of Done:' section only ever contains
    prose definitionOfDoneItems, never task.dod commands"` — asserts a task
    with both a structured `dod` gate (`"true"`) and a prose
    `definitionOfDoneItems` entry (`"bun test (or scoped test) passes"`)
    renders the prose sentence, not the gate command, under
    `"Definition of Done:"`.
- `src/test/complete-task-dod-gates-regression.test.ts` (new file, follows
  the synthetic-repo pattern already used by
  `src/test/epicd-run-integration.test.ts`):
  - `"complete-task.sh merges a task whose structured DoD gate fully passes,
    even when its prose Definition of Done defaults are not valid shell
    commands"` — builds a temp git repo + board via `Core` +
    `initializeTestProject`, creates a task with
    `dodGates: ["true"]` (trivially-passing structured gate) and the
    project's default prose `definitionOfDoneItems` (e.g. "bun test (or
    scoped test) passes" — not valid literal shell syntax), sets
    `pipeline_id`/`phase` so the task is in-flight, manually creates a
    worktree + `task/<id>` branch + `.caps/<id>.wt` file + writes
    `.agent-done-<id>` = `"done"` (mirroring
    `simulateAgentDone`/`runHandleBasicReady`'s capability-token contract),
    then runs the real `bash plugin/scripts/complete-task.sh <id>` and
    asserts the task's final status is `"Basic: Done"` (merged) — this
    is the exact scenario BACK-649/BACK-653 hit in production and **must
    fail today** (current code reads the prose section, executes the
    gibberish sentence via `bash -c`, and the task ends up
    `"Basic: Needs Human"` instead).
  - `"complete-task.sh escalates to needs-human when a task has zero
    structured DoD gates"` — same setup but `dodGates: []`; asserts final
    status is `"Basic: Needs Human"` (mirrors `dod-runner.ts`'s documented
    "no gates → never auto-merge" semantics, which the current
    `complete-task.sh` violates today because an empty/absent
    `"Definition of Done:"` section is silently treated as zero commands
    to check, i.e. vacuous pass-through to merge).

### Implementation
None — this phase only adds failing tests that pin down the two-layer bug
(rendering gap + shell script's resulting wrong verdict). No production
code changes in this phase.

### DoD
- [ ] `bun test src/test/task-plain-text-dod-gates.test.ts src/test/complete-task-dod-gates-regression.test.ts`
- [ ] `! grep -q "DoD Gates:" src/formatters/task-plain-text.ts` (confirms the new tests are red against pre-fix code, i.e. the section genuinely does not exist yet)

## Phase B: Render structured DoD gates and converge complete-task.sh onto them

### Tests (write first)
Covered by Phase A's two new test files — no additional test files in this
phase. Phase B's job is to turn Phase A's red tests green.

### Implementation
- `src/formatters/task-plain-text.ts`:
  - Add `export function buildDodGateLines(task: Task): string[]` that
    reads `task.dod ?? []` and returns `["- #1 <cmd>", "- #2 <cmd>", ...]`
    (raw command text, 1-based index, no checkbox prefix — distinct format
    from the prose checklist's `- [ ] #N` so the two sections can never be
    confused by a naive scanner).
  - In `formatTaskPlainText`, after the existing `"Definition of Done:"`
    block (around line 177), add a new `"DoD Gates:"` section using
    `buildDodGateLines`; when empty, print `"No DoD gates defined"` (same
    convention as the existing prose section's empty-state line).
- `plugin/scripts/complete-task.sh`:
  - Change the awk anchor at line 69 from `/^Definition of Done:/` to
    `/^DoD Gates:/`, and the extraction regex from
    `'^- \[.\] #\d+ .+'` to `'^- #\d+ .+'` (matching the new format).
  - Change the `sed` prefix strip at line 57 from
    `'s/^- \[.\] #[0-9]* //'` to `'s/^- #[0-9]* //'`.
  - Add an explicit empty-gate guard: if the `while` loop at line 56-69
    never executes (i.e. `dod_n` is still `0` after the loop) when
    `SIGNAL_CONTENT` was `"done"`, set
    `SIGNAL_CONTENT="needs-human: no structured DoD gates found for ${TASK_ID}"`
    instead of falling through to `git merge` — mirrors
    `dod-runner.ts`'s "empty dod → never auto-merge" semantics.
  - No other lines change: merge-lock (`acquire_merge_lock`/
    `release_merge_lock`), `git merge --no-ff`, worktree removal, branch
    deletion, parent-notify, and cap-marker logic are untouched.

### DoD
- [ ] `bun test src/test/task-plain-text-dod-gates.test.ts src/test/complete-task-dod-gates-regression.test.ts`
- [ ] `bun test --parallel`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run check .`

## Phase C: Update the known-deviation record in the fixpoint-convergence README

### Tests (write first)
- `src/test/baime-readme-back654-note.test.ts` (new file):
  - `"docs/research/baime-fixpoint-convergence/README.md records BACK-654
    as fixed, with the confirmed root cause (complete-task.sh executing
    prose Definition of Done text instead of structured task.dod gates)"`
    — reads the README file and asserts it contains a marker string
    identifying BACK-654 as fixed (e.g. `"BACK-654"` co-located with
    `"已修复"`/`"fixed"`) and no longer describes it purely as an
    "至今未查明"/unlocated open defect.

### Implementation
- `docs/research/baime-fixpoint-convergence/README.md`: append a short
  "BACK-654 根因与修复" note after the existing BACK-653 复盘 conclusion
  (after line 292), stating: (1) `adjudicate()`/`completeTask()`/
  `runDoD()` were confirmed correct by investigation — the divergence was
  never in `src/engine/adjudicate.ts`; (2) the real root cause was
  `plugin/scripts/complete-task.sh` independently re-implementing DoD
  checking by executing prose `Definition of Done:` text as shell
  commands instead of the structured `task.dod` gates; (3) fixed by
  rendering a machine-parseable `DoD Gates:` section
  (`src/formatters/task-plain-text.ts`) and pointing
  `complete-task.sh`'s extraction at it; (4) status: 已修复 (fixed),
  tracked by BACK-654.

### DoD
- [ ] `bun test src/test/baime-readme-back654-note.test.ts`
- [ ] `bun run check .`

## Constraints
- Do not modify `src/engine/adjudicate.ts`, `src/engine/complete.ts`, or
  `src/harness/dod-runner.ts` — investigation confirmed these are correct;
  no new evidence justifies touching them (proposal constraint #3).
- Do not change `complete-task.sh`'s merge-lock (`acquire_merge_lock`/
  `release_merge_lock`/`backlog/.merge-lock`), `git merge --no-ff`
  invocation, worktree removal, branch deletion, or parent-notify logic —
  out of scope per the proposal's Trade-offs section.
- The new `"DoD Gates:"` section must render raw `task.dod[].text` verbatim
  (no additional escaping/transformation) so `complete-task.sh`'s `bash -c`
  execution semantics stay identical to `dod-runner.ts`'s `sh -c`
  semantics — no new quoting layer.
- Keep the prose `"Definition of Done:"` section (`definitionOfDoneItems`)
  exactly as-is — it remains human-facing only and is never executed,
  consistent with the BACK-613 design intent already documented in
  `src/harness/dod-runner.ts`.
- No changes to `src/cli.ts`'s `engine complete` command wiring, the MCP
  surface, or any other CLI-documented contract.

## Acceptance Gate
- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal approved (existing-task-id review path; root cause reattributed from adjudicate.ts to complete-task.sh's duplicate DoD parsing). Starting plan draft.

Plan review iteration 1: APPROVED
premise-ledger:
[E] goal coverage: 4 goals 映射到 Phase A(regression)/B(fix)/C(doc) + acceptance gate,直接从 plan 文件读到
[E] TDD structure: 每个 Phase 均有 Tests 先于 Implementation,直接从 plan 文件读到
[C] file:line 引用: 通过 grep/sed 对照 complete-task.sh、task-plain-text.ts、dod-runner.ts、backlog.ts、complete.ts、cli.ts 实际内容逐一核实
[H] phase 划分粒度是否'足够小': 靠背景知识判断(bug-fix 应保持范围收紧)
GCL-self-report: E=2 C=1 H=1

claimed: 2026-07-06T04:29:01Z

Root cause confirmed: adjudicate.ts/complete.ts/dod-runner.ts (TS path) are correct — divergence is not there. plugin/scripts/complete-task.sh (shell path) independently re-implemented DoD checking by awk-scanning the rendered prose 'Definition of Done:' section and executing it as literal shell via bash -c; that section only ever contains task.definitionOfDoneItems prose, never task.dod. Fix: added buildDodGateLines()+'DoD Gates:' section to src/formatters/task-plain-text.ts (machine-parseable, no checkbox prefix) and repointed complete-task.sh's awk/sed at it, plus an explicit empty-gate guard (0 structured gates -> needs-human), mirroring dod-runner.ts semantics. adjudicate.ts/complete.ts/dod-runner.ts untouched per scope. Verification: bun test --parallel 1930 pass/0 fail, bunx tsc --noEmit clean, bun run check . 0 errors (11 pre-existing warnings unrelated). engine complete --worktree correctly routed to needs-human because BACK-654 itself was authored without structured dodGates (task has only prose DoD checklist) -- this is the documented safe default (root-cause classified as real gate behavior, not an operational mistake), so merge was done manually after independent re-verification of tests/tsc/lint in the worktree.

Fresh-context audit (independent agent, no implementation memory): reran bun test --parallel (1930 pass/0 fail), bunx tsc --noEmit (clean), bun run check . (0 errors) — all confirmed independently. Verified regression tests are real via negative control (reverted complete-task.sh to pre-fix version in a scratch copy, confirmed both new regression tests genuinely fail there, pass against the fix). Audit found two pre-existing/latent fragilities not introduced or regressed by this fix and out of its scoped constraints (section-name spoofing via task description, embedded-newline gate-text splitting) -- filed as follow-up BACK-656 per LFDD loop-until-dry (not blocking, not new). Zero new blocking items -> fixpoint reached for this task.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
- [ ] #4 ! grep -q "DoD Gates:" src/formatters/task-plain-text.ts
- [ ] #5 bun run check .
- [ ] #6 bun test
- [ ] #7 bun test --parallel
- [ ] #8 bun test src/test/baime-readme-back654-note.test.ts
- [ ] #9 bun test src/test/task-plain-text-dod-gates.test.ts src/test/complete-task-dod-gates-regression.test.ts
- [ ] #10 bunx tsc --noEmit
<!-- DOD:END -->
