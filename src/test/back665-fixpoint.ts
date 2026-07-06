/**
 * BACK-665 — 任务生命周期模型不动点 gauge（"red fixpoint"）。
 *
 * ⚠️ 文件名不含 `.test.`，故 `bun test`（无参）**不会**自动发现它——不会打断其它
 * 任务的 `bun test` DoD。它是 BACK-665 的 evaluate 门，按需显式运行：
 *
 *     bun test ./src/test/back665-fixpoint.ts
 *
 * 每个断言编码 BACK-665 的一条 Integration Acceptance，并映射到负责它的 child。
 * 现在**全 RED**，随 child deliverable 落地逐条转 GREEN。**全 GREEN == 不动点达成。**
 * 这是「迭代到不动点」的收敛信号：不到全绿，业务目标（docs/task-lifecycle-model.md
 * 的模型）未实现——防「执行了一堆 task 但目标未达成」。
 */

import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { label } from "../core/field-registry.js";
import { ALL_PIPELINES } from "../engine/pipeline.js";

const TASKS_DIR = "backlog/tasks";

/** 断言一个由 child 交付的门文件已存在（存在性 gauge；其内部正确性由该门自身负责）。 */
function expectGateDelivered(path: string, child: string): void {
	if (!existsSync(path)) {
		throw new Error(`fixpoint gate 未交付: ${path} —— 由 ${child} 交付`);
	}
}

// ── 要求 1+2：数据结构 + status/role 投影 ──────────────────────────────

test("IA-2 [BACK-664 track C]: 无 task 文件持久化 status:/role: 字段", () => {
	const offenders: string[] = [];
	for (const f of readdirSync(TASKS_DIR)) {
		if (!f.endsWith(".md")) continue;
		const fm = readFileSync(join(TASKS_DIR, f), "utf8").split(/^---$/m)[1] ?? "";
		if (/^\s*(status|role):/m.test(fm)) offenders.push(f);
	}
	expect(offenders).toEqual([]);
});

test("IA-3a [BACK-664 child 1]: status 投影 phase-only，无 Basic:/Epic: 前缀", () => {
	const s = label("compound", "ready");
	expect(s).not.toMatch(/^(Basic|Epic):/);
	expect(s).toBe("Ready");
});

test("IA-3b [BACK-664 child 1]: role 不影响 status 投影（同 phase → 同串）", () => {
	expect(label("compound", "ready")).toBe(label("primitive", "ready"));
});

test("IA-4 [BACK-664 child 1/D]: CLI create/edit 无 -s/--status 编辑面", () => {
	// create/edit 注册 `-s, --status <status>`；list/search 的过滤器不带 `-s`，
	// 故此断言只针对独立编辑面，不误伤合法的 list 过滤器。
	const cli = readFileSync("src/cli.ts", "utf8");
	expect(cli).not.toContain("-s, --status <status>");
});

test("IA-5 [BACK-664 child 1]: web has-children + phase-lane 组件门已交付", () => {
	expectGateDelivered(
		"src/web/lib/status-label.fixpoint.test.ts",
		"BACK-664 child 1（web 组件测试：badge=phase、has-children 独立元素、无 status 下拉）",
	);
});

// ── 要求 3：每个机器 phase 有执行 skill ────────────────────────────────

test("IA-6 [BACK-657 child 1]: phase-skill 覆盖门已交付；machine phase 清单可枚举", () => {
	expectGateDelivered(
		"src/test/phase-skill-coverage.test.ts",
		"BACK-657 child 1（覆盖门：每个 machine phase 有已发布+登记+contracts+provenance 的 skill 或 experiment-pending）",
	);
	const machinePhases = ALL_PIPELINES.flatMap((p) =>
		p.states.filter((s) => s.actor === "machine").map((s) => `${p.id}/${s.name}`),
	);
	// ready/decomposing/evaluating/draft/refining/spike
	expect(machinePhases.length).toBeGreaterThanOrEqual(6);
});

// ── 要求 4：epicd 原生运行时自足、baime 可外部卸载 ────────────────────

test("IA-7 [BACK-660 + BACK-664 track C]: baime-reaper-停用下自足驱动 e2e 已交付", () => {
	expectGateDelivered(
		"src/test/epicd-self-sufficient-no-status.test.ts",
		"BACK-660（monitor 原生运行时）+ BACK-664 track C（claim 轴/删 status）",
	);
});

// ── 自我强制：evaluate 跑 Integration Acceptance（非仅聚合 child 终态） ──

test("IA-eval [BACK-657 child 3]: evaluate 跑 epic Integration Acceptance 并 gate", () => {
	// 现状 evaluateEpic 只聚合 children 终态（src/harness/evaluator.ts:54-65），不跑 epic
	// 自身的 IA——这是 ADR-019 反模式，也是「child 全绿但目标未达」的根因。evaluate skill
	// （child 3）须在 evaluating phase 运行 epic 的 Integration Acceptance 并据以 gate。
	expectGateDelivered(
		"src/test/evaluate-runs-integration-acceptance.test.ts",
		"BACK-657 child 3（evaluate skill 跑 epic IA 并 gate，非仅聚合 children 终态）",
	);
});
