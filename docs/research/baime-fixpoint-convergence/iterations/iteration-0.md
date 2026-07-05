# Iteration 0（回填）：BACK-628 — 达成自托管：自审计 epic

> **回填说明**：本轮工程动作已在本次会话之前真实执行完毕（commit 历史 +
> BACK-628 task 的 implementation-notes 为准）。本文档是**事后**补的 BAIME
> 结构化记录，不重跑任何动作。部分小节（尤其 Pre-Execution Context 的
> `M_{-1}/A_{-1}` 状态）因回填时点较晚、细粒度证据有限，标注为"粗粒度"。

## 1. Executive Summary

BACK-628 是 LFDD 方法在本项目里的**第一次系统性应用**：把"epic 自己审计
自己是否真的做完"这件事，从人工习惯变成一个可重复的流程（decompose 出
blocker → 执行 → eval 判定不动点）。本轮验证了核心假设——**DoD-green 不等于
真实现**（E1 阶段的历史教训）——审计确实抓到一个真实问题：BACK-601.1 的
`IssueSource`/`LocalIssueSource` 落地后零生产调用方，只有自己的测试在用，
违反 CLAUDE.md 的 simplicity-first 原则。用户当场决定直接删除（而非新开
follow-up，因为解决方案本身就是删除），删除后全部门禁复绿，本轮零新增
blocker，epic 收口。

V_instance(s_0) = 0.86，V_meta(s_0) = 0.47（回填打分，见下）。

## 2. Pre-Execution Context

- **M_{-1}, A_{-1}**：LFDD 方法尚未成型；epic 完成依赖人工核对 + 历史上
  多次被动发现的引擎 bug（BACK-622、BACK-631）反推出"需要一个系统性
  审计步骤"这一需求。
- **s_{-1}**：4 个已知阻塞子任务（628.1 点火、628.2 内化 supervisor、
  628.3 TaskUpdateInput 字段对称、628.4 epic dispatch 结晶）尚未全部完成；
  BACK-627/BACK-601.1 作为前置依赖任务待收口。
- **本轮目标**：把上述已知阻塞项执行至 terminal，并首次验证"审计即
  decompose/eval，零新增 blocker 即不动点"这一收敛判据本身是否可行。

## 3. Work Executed

### Phase 1: OBSERVE
- 复核 4 个子任务（628.1-628.4）与两个前置依赖（BACK-627、BACK-601.1）
  的实际完成状态。

### Phase 2: CODIFY
- 把"epic 不特殊——它只是一个 decompose 出 blocker、eval 到审不出新东西
  就 done 的 task"确立为 epic 生命周期的标准语义（写入 BACK-628 自身的
  description，而非另建文档——这正是本次 BAIME 回填要补的"未文档化"缺口）。

### Phase 3: AUTOMATE
- 无新增自动化工具产出于本轮（工具产出集中在 4 个子任务各自的 PR 里，
  已作为独立完成的引擎能力存在：supervisor 内化、TaskUpdateInput 对称、
  epic dispatch 结晶）。

### Phase 4: EVALUATE
- 独立 fresh-context 审计代理复查 BACK-627/628.2/628.3/628.4 四项：均
  CLEAN（真实调用方 + 非平凡断言核验，非仅 DoD 勾选）；TODO/FIXME/HACK
  扫描 `src/engine`、`src/harness`、`src/core/backlog.ts` 零命中。
- **唯一发现**：BACK-601.1 的 `IssueSource`/`LocalIssueSource` 零生产
  调用方。用户确认后直接删除（`src/engine/store.ts` 相关导出 +
  `src/test/engine-store-issuesource.test.ts`，commit `0d05c73`），
  `makeBoardStore` 不受影响。
- 删除后 `bunx tsc --noEmit` / `bun run check .` / `bun test --parallel`
  全绿（2 个已知 flaky 超时测试独立重跑通过，与本次改动无关）。
- 本轮**未**额外派发第二轮独立审计验证这次删除本身——修复即声明不动点。
  （这与 iteration-1 的做法不同，见 iteration-1 的 Evolution Decisions。）

## 4. Value Calculations

### V_instance(s_0)

| 分量 | 分数 | 证据 |
|---|---|---|
| gate_integrity | 1.0 | 4 个子任务 + epic 自身均经真实引擎机制（非人工改状态）收口 |
| defect_signal | 0.85 | 审计抓到 1 个真实 simplicity-first 违规（IssueSource 零调用方），但未发现"活风险"级别的生产缺陷（不像 iteration-1 的 schema 碰撞那么尖锐） |
| audit_cleanliness | 0.75 | 仅 1 轮审计+修复即宣布收口，未做修复后的二次独立复核（流程严谨度低于 iteration-1） |
| scope_discipline | 0.85 | 正确判断"修复方案即删除"故不开 follow-up，但缺少一次显式的"修复后再审一轮"环节 |

V_instance(s_0) = (1.0 + 0.85 + 0.75 + 0.85) / 4 = **0.86**

### V_meta(s_0)

| 分量 | 分数 | 证据 |
|---|---|---|
| completeness | 0.30 | 方法仅以 BACK-628 task 描述里的一段散文存在，无独立方法论文档（本 iteration-0.md 是事后第一次结构化记录） |
| effectiveness | 0.55 | 抓到 1 个真实违规并当场修复，gate_integrity 100%，但样本仅 1 次应用，尚不能判定显著加速 |
| reusability | 0.35 | 仅应用 1 次，尚无跨 epic 复现证据 |
| validation | 0.65 | 有独立 fresh-context 审计作为验证手段，但未做"审计后再审计"的二次确认 |

V_meta(s_0) = (0.30 + 0.55 + 0.35 + 0.65) / 4 = **0.4625 ≈ 0.47**

## 5. Gap Analysis

- **Instance 层**：缺少修复后的二次独立审计确认环节（本身在 iteration-1
  中已补上，见下）。
- **Meta 层**：方法论未独立文档化（completeness 最大缺口）；仅 1 次应用，
  可迁移性证据薄（reusability 最大缺口）。

## 6. Convergence Check

- 双阈值：V_instance 0.86 ≥ 0.80 ✅；V_meta 0.47 < 0.80 ❌ → **未达双阈值收敛**。
- 系统稳定：本方法此时刚定型，无跨轮比较基线（N/A，视为首轮）。
- 目标完成度：epic 自身 4 个子任务全部 Done，AC 1-6 全部满足 ✅。
- 收敛判据（本方法自定义）：**epic 层面已收敛**（零新增 blocker，
  `Epic: Done`）；**方法论层面未收敛**（V_meta 未达阈值）。

## 7. Evolution Decisions

- **流程演化信号**：本轮"发现问题→当场修→直接宣布收敛"的单轮模式，在
  下一轮（iteration-1/BACK-602）被收紧为"发现问题→修→**派第二轮独立
  审计确认**→零新阻塞才收敛"——这是从本轮的 audit_cleanliness 缺口里
  直接推导出的流程改进，且已在 iteration-1 中真实执行（非本次回填臆造）。
- 无 Meta-Agent/Agent 集合意义上的演化（本方法暂不设该层）。

## 8. Artifacts Created

- `src/engine/store.ts`（IssueSource 相关导出删除）
- `src/test/engine-store-issuesource.test.ts`（删除）
- commit `0d05c73`
- BACK-628 task 自身的 implementation-notes（原始一手记录）

## 9. Reflections

- **有效**：negative-control 审计确实抓到了一个真实但容易被忽视的
  simplicity-first 违规——证明"独立 fresh-context 审计"这一步骤本身有效。
- **不足**：审计后没有二次确认闭环，收敛判定的严谨度依赖审计代理一次性
  判断的可靠性，风险敞口比 iteration-1 大。
- **对方法论的启示**：应将"修复后二次独立审计"固化为标准步骤第 5 步的
  一部分，而不是留给下一轮自然演化——已在 README.md 的方法论定义中体现。

## 10. Conclusion

BACK-628 验证了 LFDD 核心假设可行（负控审计能抓到真实问题），epic 层面
真实收敛。方法论层面（V_meta）尚早期，主要缺口是文档化与复现次数不足，
在 iteration-1（BACK-602）中部分弥补（二次审计环节引入），仍需更多轮次
验证可迁移性。
