---
id: BACK-605.4
title: >-
  Wire runDoD into cli engine run realSpawn (M1 e2e found: dodRunner not
  injected → needs-human)
status: 'Basic: Backlog'
assignee: []
created_date: '2026-07-04 07:51'
labels:
  - 'kind:basic'
  - 'kind:feature'
  - 'epicd:E5'
dependencies:
  - BACK-605.3
parent_task_id: BACK-605
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
M1 确认实跑（sandbox，真 `claude` worker）**成功证明核心自治**：真 worker → commit → `git merge` → 改动落主分支（`hello.txt` on main）。**但 verdict = `needs-human`**（非 done）。根因：`src/cli.ts` `engine run` 的 `realSpawn(task, cwd, runner, gitWorktreeRunner)` **未注入 dodRunner**（605.3 把 dodRunner 设为**可选** + 测试自注入 → 掩盖了 cli 的遗漏）→ `dodResults` undefined → `adjudicate` 落 legacy checkbox 路径 → 未勾 → needs-human。**ENG-8 在 production 路径没真跑。**

## 范围（~1 行 + 回归守卫）
- `src/cli.ts` `engine run`：import `runDoD`（`src/harness/dod-runner.ts`），把它作为**第 5 参 dodRunner** 注入 `realSpawn`（`(t, wt) => runDoD(t, wt)`）。
- 加**回归守卫**：断言 cli engine run 注入了 dodRunner（这正是被 optional 参数掩盖的一类——须有可执行守卫，而非只靠可选默认）。
- 验证：sandbox M1 实跑 → `phase=done`（引擎真跑 DoD 通过后自动判 done）。

## 非目标
- 其它引擎/pipeline 改动。

## 参考
BACK-605.3（dodRunner 可选 + adjudicate ENG-8）；M1 proof run（/tmp/epicd-m1-sbx，needs-human）；`src/cli.ts` engine run realSpawn 调用（4-arg）。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
