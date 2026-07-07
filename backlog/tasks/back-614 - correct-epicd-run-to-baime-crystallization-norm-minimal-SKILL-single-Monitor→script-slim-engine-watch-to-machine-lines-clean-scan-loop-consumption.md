---
id: BACK-614
title: >-
  correct epicd-run to baime crystallization norm: minimal SKILL (single
  Monitor→script), slim engine watch to machine lines, clean scan-loop
  consumption
assignee:
  - '@claude'
created_date: '2026-07-04 14:51'
updated_date: '2026-07-06 03:46'
labels:
  - 'kind:basic'
dependencies: []
ordinal: 26000
pipeline_id: execution
phase: done
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么
BACK-605.8 落地的 epicd-run 违反了 baime 早已结晶的规范(task-229 '散文协议=过冷液体,压缩下相变失败';task-232 '消除 bash 碎调用,SKILL 单步指令')。具体病症:(a) 我实跑的 Monitor 是一大坨 inline bash 管道;(b) SKILL.md 的 Monitor 命令是 'while true; do bun run cli engine watch --once; sleep 5; done' 的 bash 外壳 + 大量 Step/gap/safety/notes 散文,无 allowed-tools/contracts;(c) scan-loop.js 用 execSync 子进程 + 从渲染后 blob 正则回捞 id,且 watch.ts 自带第二套 renderEvent/---EVENT--- 造成双重渲染;(d) engine watch 唯一消费者就是这条 shell-out。= 过度且错误的修改。

## 决策(已与用户确认)
保留 engine watch 作为扫描单一权威(TS/interpreter.scan);Monitor 只调一个薄脚本(scan-loop.js --loop);逻辑全在脚本,SKILL 只一句 Monitor。copy-then-minimal-adapt,净删为主,不扩量。

## 范围
1. SKILL.md → baime 极简式:单一 Monitor(persistent=true, command='node <plugin>/scripts/scan-loop.js --loop') + allowed-tools: Monitor + 适配 contracts(须含 Monitor(persistent=true / scan-loop;禁含 while true / engine watch --once / TaskList / 散文 Step)。删全部散文。
2. engine watch → 保留但瘦身:只发最小机器行 basic-ready:<id>(复用 interpreter.scan);删 watch.ts 的模板渲染/---EVENT---/templatesDir(渲染权归 scan-loop 一处)。改 engine-watch.test.ts。
3. scan-loop.js → 撤 engineWatchOnce 的子进程+blob 正则回捞;改为干净读 engine watch --once 的 basic-ready:<id> 行喂 channel;保留 dedup/renderEvent+模板/---EVENT---/EPIPE/singleton(唯一渲染器);修 parent_task_id→parent_id;每 tick 用免构建入口(bun src/cli.ts …)避免 CSS 重建。
4. basic-ready.md → 砍散文回 baime 结构;只改必要 token($BAIME_SCRIPTS→脚本路径、backlog→bun run cli、complete-task.sh→engine complete);恢复 .agent-summary per-phase/DoD checkpoint。
5. 保留 engine complete(TS 合并尾);真完成受 BACK-613 阻(不在本任务)。

## 非目标
- scan-loop.js TS 化(后续)。BACK-613 的 DoD 缺陷(独立)。epic-ready/eval(reference-only)。

## 参考
baime plugin/skills/loop-backlog/SKILL.md(极简范式+contracts)、templates/basic-ready.md;baime task-229/232/228;BACK-605.8(被纠正的过度实现);BACK-609(已证手工流)。
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged to main (fast-forward a6590ae). Net -98 lines. Done per copy-then-minimal-adapt: (1) SKILL.md → baime-minimal single Monitor(persistent=true, command='node plugin/scripts/scan-loop.js --loop') + allowed-tools: Monitor + contracts (no while-true/engine-watch-carving in body); deleted all Step/gap/safety/notes prose. (2) engine watch slimmed to emit machine lines 'basic-ready:<id>' via interpreter.scan — removed watch.ts's duplicate renderEvent/---EVENT---/templatesDir (one renderer). (3) scan-loop.js: engineWatchOnce now reads 'basic-ready:<id>' lines directly (no blob regex), via build-free 'bun src/cli.ts'; runtime hardening (---EVENT---/renderEvent/dedup/EPIPE/singleton) untouched; parent_task_id→parent_id fixed. (4) basic-ready.md trimmed to baime structure + restored .agent-summary checkpoints; tokens adapted (bun run cli / engine complete). (5) engine complete kept. Post-merge on main independently verified: tsc PASS; engine watch emits basic-ready:BACK-610/612 only (609 done/611 needs-human correctly excluded); affected tests 33/0; full suite 1653/0; biome exit 0. Worktree removed, branch deleted.
<!-- SECTION:NOTES:END -->
