---
id: task-1
title: 'Authoring 作为一等 pipeline:后台化 propose/plan'
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-06-29 03:04'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
把 authoring(propose/plan)建模为 epicd 的第二条 pipeline,其 (pipeline,state) handler 在 Monitor worker(主循环)中运行,因而持有 Agent、能 fan-out 到独立 reviewer——这是后台化 authoring 唯一同时满足「后台 + 主循环 fan-out + 评审独立 + 与 ADR-011 同构」的形态。

Proposal: docs/proposals/2026-06-29-authoring-as-pipeline.md

依据(2026-06-29 实测):嵌套 subagent BLOCKED(子代理无 Agent 工具);子代理只有 final-return、无法回驱父会话;claude -p 被否决。故只有「pipeline + handler」可行。

停在 Basic: Proposal,等 architect 评审与人对 R1(pipeline-as-data 扩展时机)/R3(promote 自动化程度)的方向裁决,再进入 plan。
<!-- SECTION:DESCRIPTION:END -->
