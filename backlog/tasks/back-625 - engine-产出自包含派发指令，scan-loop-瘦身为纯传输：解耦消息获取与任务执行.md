---
id: BACK-625
title: engine 产出自包含派发指令，scan-loop 瘦身为纯传输：解耦消息获取与任务执行
status: 'Basic: Proposal'
assignee:
  - '@claude'
created_date: '2026-07-05 02:30'
updated_date: '2026-07-05 02:54'
labels:
  - 'kind:refactor'
dependencies: []
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 为什么

本会话实跑 epicd-run 时发现：scan-loop.cjs 的 renderEvent 走 fallback，所有事件降级为裸 `prefix:id`。根因是 `resolveTemplatesDir` 硬编码默认路径 `plugin/skills/loop-backlog/templates/`（不存在；唯一模板在 `.codex/skills/epicd-run/templates/basic-ready.md`），且 SKILL 未像 baime 那样显式传 `--templates-dir`。

但路径 bug 只是症状。更深的问题是**分层**：epicd 有引擎（src/engine/，pipeline/phase/actor→handler 的单一真相源），而 scan-loop 却拿一个搁在 `.codex/skills/.../templates/`、与引擎和 npm 分发包（package.json `files: ["scripts/*.cjs"]` + 单二进制 build）都脱节的 .md 文件重新编码"phase=ready 该干嘛"。这是两个真相源，也是路径耦合 bug 的温床。任何 `__dirname` 相对的模板查找在 npm 安装 / 编译二进制下都会断。

参照 baime 演化史（ADR-012/013/014）：per-event 指令的正确载体是"磁盘代码每 tick 生成的 stdout"（免疫 compact），不是 LLM 写一次的 Monitor description（会退化）。baime 把指令放进磁盘 template 由 scanner 渲染；但 baime 没有引擎，template 是它唯一合理载体。epicd 有引擎，能把指令产出下沉到引擎，做 baime 结构上做不到的解耦。

## 核心洞察：三层正交解耦

当前 scan-loop 把"消息获取"和"任务执行"焊在一起（共用 `prefix:id` 键 + 在同一 tick 里既扫执行状态又渲染指令）。实际是三个正交关注点：

1. **信号身份**（稳定机器键 `prefix:id`）— 只服务 acquisition 边沿去重 + 自清除谓词。内存态、随 scanner 生命周期、重启即 reset（正确：新 session 须让存量 actionable 重新浮现，ADR-012 B2）。scanner 独有。
2. **指令载荷**（自包含派发文本，含绝对路径 handler 命令 + 反分诊守则）— 由执行语义权威（引擎）产出，scanner 当不透明字节透传，不解析、不渲染。
3. **执行守卫**（flock exec-lock + .caps cap 标记 + status 迁移）— worker 独有、磁盘上、durable 跨重启。ADR-012 C1/C2。现状已正确（handle-basic-ready.sh），不改。

关键推论：acquisition 去重永远只看信号身份（层 1），从不看载荷（层 2）。所以载荷可以任意富，dedup 一字节不改——"富消息怎么去重"是把两层焊死才臆想出的伪问题。

## 目标形态

- **引擎 `engine scan`（src/engine/scan.ts）**：每条 actionable 不再只发裸 `basic-ready:<id>`，而发【首行稳定机器键 `basic-ready:<id>`】+【其后多行自包含载荷】。载荷含：task 标题、handle-basic-ready.sh 绝对路径命令、spawn agent 指令、engine complete 收尾、以及反分诊守则（不要 arm 新 Monitor / 不要问用户确认 / 非事件输出丢弃）。引擎拥有 phase→handler 映射，是产载荷的正确权威。
- **scanner `scan-loop.cjs`**：读引擎行 → 按首行机器键做 edge-dedup（`notified` Map 逻辑不变）→ 整块透传 + `---EVENT---`。删除 renderEvent / resolveTemplatesDir / --templates-dir / 模板目录依赖。只保留 dedup + 生命周期（EPIPE 自愈 / singleton / trap 停止）。`.codex/skills/epicd-run/templates/basic-ready.md` 降为纯人类文档或删除。
- **Monitor description（epicd-run SKILL）**：删"Each stdout line is a self-contained instruction — follow it verbatim"这句 meta 话术（载荷本身是祈使句，自证是指令）；反分诊守则已进载荷。

## 必须保留的桥（不可拆）

acquisition（内存、电平再浮现）与 execution（磁盘、durable 已认领）通过**看板执行状态喂给引擎扫描**协调：任务被 claim → 离开 ready → 从 `engine scan` 结果消失 → edge-clear 出 `notified` → 停止再发。这是自清除谓词（ADR-009）。重构后引擎 emit 仍须由 interpreter.scan 的 (pipeline_id, phase→machine-actor) 谓词驱动，保证已认领任务自动掉出 emit 集。拆了这座桥 = 已认领任务被反复重发 或 冷启动看不到存量。

## 范围与非目标

- 本任务只做 execution 车道 `basic-ready`（最高频、已验证的通道）。epic-ready / epic-eval-due / review-due 的富载荷留后续（它们目前连模板都没有，且 handler 更复杂）。
- 不改 handle-basic-ready.sh / engine complete / worker 执行守卫（层 3 已正确）。
- 不做 baime 式 adapter/config 外置化（epicd 单引擎，无需可插拔源）。
- 保留 `--scan-once` 发裸 `prefix:id`（探测/测试用），只有 `--loop` 发富载荷。

## 参考

- 被纠正的前案：BACK-614（把 renderEvent+模板定为"scan-loop 单一渲染器"——本任务推翻这个定位，改由引擎产载荷）。
- baime：docs/adr/ADR-012（Monitor 行为契约 A/B/C 三组）、ADR-013（description 退化故障 + Amendment 指令载体迁移）、ADR-014（结晶/熔融相变边界）；plugin/scripts/monitor-poll.ts（当前 renderEvent 位置 line 733）；plugin/skills/monitor/SKILL.md line 70-72（显式警告漏传 --templates-dir 会降级——epicd 正是抄漏了这半）。
- src/engine/scan.ts（现 scanReadyLines，发裸行）、src/engine/interpreter.ts（scan 谓词）、src/engine/pipeline.ts（phase→actor）、plugin/scripts/scan-loop.cjs（现 renderEvent/resolveTemplatesDir/tick dedup）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 engine scan --loop 路径为每个 actionable basic-ready 任务发出【首行 basic-ready:<id> 机器键 + 其后自包含多行载荷】；载荷含 handle-basic-ready.sh 的绝对路径命令、spawn agent 指令、engine complete 收尾、反分诊守则
- [ ] #2 engine scan --once 仍只发裸 basic-ready:<id>（探测/测试语义不变）
- [ ] #3 scan-loop.cjs 删除 renderEvent / resolveTemplatesDir / --templates-dir / 模板目录读取；tick 按首行机器键做 edge-dedup 并整块透传载荷 + ---EVENT---
- [ ] #4 自清除桥保留：被 claim 的任务（离开 phase=ready）在下一 tick 掉出 emit 集并 edge-clear 出 notified，不再重发（回归测试覆盖）
- [ ] #5 epicd-run SKILL 的 Monitor description 删除 'Each stdout line is a self-contained instruction — follow it verbatim'；反分诊守则改由载荷承载
- [ ] #6 分发无关正确性：载荷生成不依赖任何 __dirname 相对的外部文件查找，npm 安装形态（scripts/*.cjs）与单二进制 build 下均产出完整载荷
- [ ] #7 worker 执行守卫（flock/caps/status）与 handle-basic-ready.sh、engine complete 不改；BACK-624 式 basic-ready→claim→执行→complete 全链路端到端仍通过
- [ ] #8 swap-litmus（分层验收锚）：engine 对一个 actionable 任务的输出（机器键 + 自包含载荷）足以驱动任一实现——Monitor 多路复用 seat 或裸 `claude -p <载荷>`——而 engine 一行不改。载荷即 -p 入参，monitor 对其内容 agnostic
- [ ] #9 存活/单例/自清除机械（EPIPE 自愈、singleton reap、level-trigger 电平再浮现）是 Monitor 适配器专属，留在 scan-loop，绝不进 engine；engine 只按 (pipeline_id, phase→machine-actor) 谓词产 emit
- [ ] #10 翻转 L1 守护测试 src/test/epicd-run-wiring.test.ts：现断言 'preserves renderEvent templating'（line 46-47）+ 依赖 .codex/skills/epicd-run/templates/basic-ready.md 存在——这是锁死旧模板架构的静态不变量。改为断言 scan-loop.cjs 无 renderEvent/templatesDir、engine scan 产自包含载荷、模板文件不再是 dispatch 权威
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 架构定位（2026-07-05，参 docs/uml/runtime-deployment.puml + use-case-model.md 漂移表 + ADR-014）

本任务的定位由一个系统级重构厘清：**Monitor 不是调度或执行机制，而是对 Claude Code 调用的封装——计费受迫下 `claude -p` 的替身**。

- invocation seam 的抽象签名 = `invokeClaudeCode(taskPrompt, worktree) → CompletionResult`。两种实现：理想态 `claude -p "<自包含 prompt>"`（每任务一 headless 进程，天然独立/并行/无状态）；现实态一个常驻交互 seat 挂 Monitor 多路复用（item-ready→stdout→session 收到→spawn 背景 Agent，Agent 才是 `claude -p` 等价体）。Monitor = 让一个 seat 冒充 N 个独立 `claude -p` 的多路复用适配器。
- 四角色归位：**supervisor**（单例/存活）+ **invocation transport**（把 item-ready 投给 seat）留在 monitor 脚本；**driver**（scan→item-ready，已归位 BACK-614）+ **prompt authoring**（本任务搬走的 renderEvent）归 engine。
- engine emit 的自包含载荷 = 你要喂 `claude -p` 的 prompt。renderEvent 待在 monitor 是范畴错误（等于 `claude -p` 伸手去模板目录改写入参）。
- push vs pull 差异（为何仍需层 1/层 3 解耦）：`claude -p` 是 push（调用者 await）；Monitor 是反转控制（engine 只能 emit，session 随 /clear 生灭、投递不可靠）。电平再浮现+自清除（ADR-009）补偿不可靠投递、flock+caps 补偿重复投递——这是"在反转控制、单 seat、session 易逝信道上模拟一次可靠调用"的代价，裸 `claude -p` 无此代价。

验收锚：满足 swap-litmus ⇒ monitor 从"焊死的执行机制"变为"可替换的调用适配器"，计费松绑后可换 `claude -p` 进程池、engine 零改动。

（编号更正）上条架构定位引用的 ADR 应为 **ADR-015**（Monitor 是调用适配器 —— `claude -p` 的计费替身）；ADR-014 已被 adr-as-contract-harness 提案占用。swap-litmus 的规范锚在 ADR-015 D4。

## 同步影响面清点（2026-07-05 扫描结果）

**必须随本任务改（实现耦合）**：
- src/test/epicd-run-wiring.test.ts —— 现锁旧设计：`it("preserves renderEvent templating")` 断言 scan-loop 含 renderEvent；`describe(".codex/skills/epicd-run/templates/basic-ready.md")` 断言模板文件在。本任务须翻转这些断言（见新增 AC）。此测试是 BACK-614 立的 L1 不变量，是"旧设计的守门测试"，不翻它 build 不会绿。
- .codex/skills/epicd-run/SKILL.md —— Monitor description 删"Each stdout line is a self-contained instruction"（已在 AC）。
- .codex/skills/epicd-run/templates/basic-ready.md —— 载荷移入 engine 后降为纯人类文档或删除（已在描述）。

**已随本轮文档同步（非本任务代码范围）**：
- docs/adr/ADR-015（新）、docs/uml/use-case-model.md 漂移表、docs/uml/runtime-deployment.puml + 重生成的 svg/png、docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md（Monitor 行加 ADR-015 前向指针）。

**判定无需改**：
- ADR-012 引用 baime ADR-017（ENG-8 信任模型）—— 与本定位正交，无冲突。
- "monitor 驱动的 Claude Code"措辞（use-case-model §5、multi-lane proposal）—— 语义是"经 monitor 驱动的 CC"，非"monitor 即 driver"，ADR-015 已澄清，保留。
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
