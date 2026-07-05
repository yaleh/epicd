---
id: BACK-629
title: >-
  adr-as-contract-harness 最小切片：契约条款 enforcement 层级 + oracle 字段 + meta-lint +
  negative-control 入 DoD-defaults
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 06:07'
updated_date: '2026-07-05 08:08'
labels:
  - 'kind:feature'
  - 'epicd:bootstrap'
dependencies: []
references:
  - docs/proposals/2026-07-03-adr-as-contract-harness.md
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
真正的内核是**契约集**，不是代码（guard#2 已证 MVD 可由契约重建，字节不同、suite-green）。但契约散落在 ADR/UML/task/proposal/plan/DoD，多为自然语言（语义维度高、compact 后易丢维——ADR-013 实测）。形式化的**充分必要边界 = crystal/molten 线**（ADR-013）：机器门控条款必须降维到可执行 oracle；判断条款保持 semantic、由 architect reviewer 守。本切片把这条纪律**结构化**，落地 docs/proposals/2026-07-03-adr-as-contract-harness.md 的最小可用面。

## 范围（最小）
1. **层级标记**：约定契约条款 frontmatter 字段 `enforcement: structural|executable|semantic` 与 `oracle:`（test/lint/gate 命令，或 reviewer）。给现有 ADR-010..016 回填该两字段。
2. **meta-lint**：一个可执行检查——标 `enforcement: executable` 却 oracle 缺失/为 null 的条款 = **契约债**，报错列出；`semantic` 条款不报错。接入 `bun run check` 或独立 package script。
3. **negative-control 入 DoD-defaults**：把「机器门控条款 done 的前提 = 有一个 negative-control 演示 gate 拒绝违例输入」加入 definition_of_done_defaults，对新任务默认生效。

## oracle 完备性判据
一个从未被违例输入运行过的 gate 与 `return true` 不可区分。故 **negative-control 覆盖率 = 机器门控条款形式化充分性的度量**。本任务把该度量变成默认门（呼应 E1 memory 的 recurring stub 暗礁：门禁从没抓到 stub）。

## 非目标
- 不引入新形式语言（TLA+/精化类型）——对已可靠的 crystal 无收益、对 molten 无能为力；前沿 bug 全在接缝，靠 gate+negative-control 抓。
- **不形式化判断条款**（over-crystallization = 脆性，ADR-013 D2）。
- 不回填所有历史 task 的 negative-control（只改 defaults + 新任务）。

关联：BACK-628（自审计 epic 用的正是这条度量）· ADR-013 · ADR-016 · memory bootstrap-ignition-epic。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 文档化 frontmatter 字段 enforcement ∈ {structural,executable,semantic} + oracle:；ADR-010..016 各回填该两字段
- [ ] #2 存在可执行 meta-lint：对标 enforcement: executable 且 oracle 缺失的条款报错并列出；semantic 条款不报错；接入 bun run check 或 package script
- [ ] #3 meta-lint 有 negative-control 自测：构造一个 executable-但-oracle-null 样例确认 lint 拒绝；一个合规样例确认通过
- [ ] #4 definition_of_done_defaults 增加'机器门控条款须有 negative-control'项，对新建任务默认出现（回归测试或验证记录）
- [ ] #5 不新增形式语言依赖；不改判断条款的 semantic 载体
- [ ] #6 重分类量化基线：记录重分类前后 enforcement 分布——前=6/6 ADR 为 semantic（0 条可机器验证）；后=统计 N_exec（executable 条款数）/ N_sem（保留 semantic 条款数）。N_exec/N_sem 显著上升（semantic 从占满降为少数真判断条款），作为成本控制证据（per-iteration 验证成本 ≈ N_exec·c_test + N_sem·c_review，semantic 层贵 10²–10³ 倍，故 N_sem 是成本驱动因子）
- [ ] #7 semantic 约束不进入 per-iteration 检查：executable 条款可每轮/每 advance 跑（=单测成本）；semantic 条款批到 milestone 边界评审，不每轮 spawn reviewer——meta-lint 或文档明确此分频策略，避免 per-iteration 成本越 '高一个数量级' 上限
<!-- AC:END -->



## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 实现计划（约束注册表接线，非字段回填）

前提认知（实测 2026-07-05）：ADR-010..016 的 frontmatter 已带 enforcement/oracle/lint/applies-to/stage 字段，但全部标 enforcement: semantic，且无 harness 消费——即死数据。ENG-1/2/3/8 实际已有可执行测试（含负例控制），却被标为 semantic。本任务=重分类+接线+补覆盖率维度，不是新建。

### Phase 1 — 重分类（改数据，不改代码）
Stage 1a. 逐 ADR 建立 约束→oracle 映射表，把已有测试背书的条款从 semantic 升为 executable：
  - ENG-1 cap 幂等      → oracle: bun test engine-safety-cap        · coverage: has-negative-control
  - ENG-2 worktree 隔离 → oracle: bun test engine-safety-worktree
  - ENG-3 merge 串行+冲突即停 → oracle: bun test engine-safety-cross-mechanism-lock
  - ENG-8 无自证终态    → oracle: bun test engine-adjudicate-eng8   · coverage: has-negative-control (engine-autonomous-e2e.test.ts:133)
Stage 1b. 保留真正需人判断的为 semantic：ADR-013 载体律、ADR-016 正交性检查——不强行晶体化（over-crystallization=脆性，ADR-013 D2）。
Stage 1c. frontmatter 增补 coverage: has-negative-control|none 字段（executable 条款必填）。

### Phase 2 — meta-lint 接线（可执行检查）
Stage 2a. 写 meta-lint：遍历 docs/adr/*.md frontmatter，对 enforcement: executable 且 oracle 缺失/null/不可解析的条款报错并列出；semantic 条款不报错；executable 但 coverage: none 的条款报 契约债 warning。
Stage 2b. 接入 bun run check（或独立 package script，与 biome check 并列）。
Stage 2c. meta-lint 自测（负例控制）：造 executable+oracle:null 样例确认报错；造合规样例确认通过。→ 满足 AC#3。

### Phase 3 — negative-control 入 DoD defaults
Stage 3a. backlog/config.yml definition_of_done 追加：机器门控条款须有 negative-control（构造违例输入证明 gate 拒绝）。
Stage 3b. 回归验证：新建任务默认出现该 DoD 项。→ 满足 AC#4。

### 收敛证据
- meta-lint 在 CI/check 中通过，且对现有 6 ADR 报出的 契约债 清单已归零或列为已知（记录在 final-summary）。
- 基线度量：重分类前 6/6 ADR 为 semantic（0 条可机器验证）；重分类后 executable 条款数 = N，其中 has-negative-control = M。M/N = 机器门控条款形式化充分性。

### 边界
不新增形式语言（TLA+/精化类型）；不形式化判断条款；不回填历史 task 的 negative-control（只改 defaults + 新任务）。
<!-- SECTION:PLAN:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-07-05 06:08
---
ID 说明：本号曾属'自观察闭环'epic（已 archive、其两点新意折入 BACK-604 AC#8/#9）。archive 后 CLI 从活跃最大号重新分配，本 contract-harness 任务复用了 629。活跃板上 629 唯一=本任务；引擎只扫 backlog/tasks，不涉 archive，无运行时歧义。BACK-604 评论里提到的'BACK-629（自观察闭环）'指的是那个已归档任务。
---
<!-- COMMENTS:END -->
