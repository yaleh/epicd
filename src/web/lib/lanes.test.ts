import { describe, expect, it } from "bun:test";
import type { Task } from "../../types";
import {
	buildLanes,
	buildPhaseColumns,
	DEFAULT_LANE_KEY,
	groupTasksByLaneAndStatus,
	groupTasksByPhase,
	laneKeyFromMilestone,
	laneKeyFromPipeline,
	NO_PHASE_KEY,
	NO_PHASE_LABEL,
	NO_PIPELINE_LABEL,
	PIPELINE_TERMINAL_PHASE,
	phaseColumnLabel,
	phaseKeyOf,
	sortTasksForStatus,
} from "./lanes";

const makeTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2024-01-01",
	...overrides,
});

describe("buildLanes", () => {
	it("creates milestone lanes including No milestone and task-discovered milestones", () => {
		const tasks = [
			makeTask({ id: "task-1", milestone: "M1" }),
			makeTask({ id: "task-2", milestone: "Extra" }),
			makeTask({ id: "task-3" }),
		];
		const lanes = buildLanes("milestone", tasks, ["M1"]);
		expect(lanes.map((lane) => lane.label)).toEqual(["No milestone", "M1", "Extra"]);
	});

	it("falls back to a single lane when mode is none", () => {
		const lanes = buildLanes("none", [], ["M1"]);
		expect(lanes).toHaveLength(1);
		expect(lanes[0]?.key).toBe(DEFAULT_LANE_KEY);
	});

	it("excludes archived milestones from lane definitions", () => {
		const tasks = [makeTask({ id: "task-1", milestone: "M1" })];
		const lanes = buildLanes("milestone", tasks, ["M1"], [], { archivedMilestoneIds: ["M1"] });
		expect(lanes.map((lane) => lane.label)).toEqual(["No milestone"]);
	});

	it("canonicalizes numeric milestone aliases to configured milestone IDs", () => {
		const tasks = [makeTask({ id: "task-1", milestone: "1" })];
		const lanes = buildLanes(
			"milestone",
			tasks,
			[],
			[{ id: "m-1", title: "Release 1", description: "", rawContent: "" }],
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-1");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("1");
	});

	it("canonicalizes zero-padded milestone ID aliases to configured milestone IDs", () => {
		const tasks = [makeTask({ id: "task-1", milestone: "m-01" })];
		const lanes = buildLanes(
			"milestone",
			tasks,
			[],
			[{ id: "m-1", title: "Release 1", description: "", rawContent: "" }],
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-1");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("m-01");
	});

	it("filters archived numeric milestone aliases from lane definitions", () => {
		const tasks = [makeTask({ id: "task-1", milestone: "1" })];
		const lanes = buildLanes("milestone", tasks, [], [], {
			archivedMilestoneIds: ["m-1"],
			archivedMilestones: [{ id: "m-1", title: "Archived", description: "", rawContent: "" }],
		});
		expect(lanes.map((lane) => lane.label)).toEqual(["No milestone"]);
	});

	it("prefers active title aliases when archived milestones reuse the same title", () => {
		const tasks = [makeTask({ id: "task-1", milestone: "Shared" })];
		const lanes = buildLanes(
			"milestone",
			tasks,
			[],
			[{ id: "m-2", title: "Shared", description: "", rawContent: "" }],
			{
				archivedMilestoneIds: ["m-0"],
				archivedMilestones: [{ id: "m-0", title: "Shared", description: "", rawContent: "" }],
			},
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-2");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("Shared");
	});

	it("prefers real milestone IDs over numeric title aliases in lane definitions", () => {
		const tasks = [makeTask({ id: "task-1", milestone: "1" })];
		const lanes = buildLanes(
			"milestone",
			tasks,
			[],
			[
				{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
				{ id: "m-2", title: "1", description: "", rawContent: "" },
			],
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-1");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("m-2");
	});
});

describe("buildLanes (pipeline mode)", () => {
	it("creates pipeline lanes including No pipeline and task-discovered pipeline_ids, sorted alphabetically", () => {
		const tasks = [
			makeTask({ id: "task-1", pipeline_id: "epicd" }),
			makeTask({ id: "task-2", pipeline_id: "backlog" }),
			makeTask({ id: "task-3" }),
		];
		const lanes = buildLanes("pipeline", tasks, []);
		expect(lanes.map((lane) => lane.label)).toEqual([NO_PIPELINE_LABEL, "backlog", "epicd"]);
		expect(lanes.map((lane) => lane.pipelineId)).toEqual([undefined, "backlog", "epicd"]);
	});

	it("does not duplicate lanes for tasks sharing the same pipeline_id", () => {
		const tasks = [makeTask({ id: "task-1", pipeline_id: "epicd" }), makeTask({ id: "task-2", pipeline_id: "epicd" })];
		const lanes = buildLanes("pipeline", tasks, []);
		expect(lanes.map((lane) => lane.label)).toEqual([NO_PIPELINE_LABEL, "epicd"]);
	});
});

describe("groupTasksByLaneAndStatus", () => {
	const tasks = [
		makeTask({ id: "task-1", status: "To Do", milestone: "M1" }),
		makeTask({ id: "task-2", status: "In Progress" }),
		makeTask({ id: "task-3", status: "To Do", milestone: "Extra", ordinal: 5 }),
	];

	it("groups tasks under their milestone lanes", () => {
		const lanes = buildLanes("milestone", tasks, ["M1"]);
		const grouped = groupTasksByLaneAndStatus("milestone", lanes, ["To Do", "In Progress"], tasks);

		expect((grouped.get(laneKeyFromMilestone("M1"))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["task-1"]);
		expect((grouped.get(laneKeyFromMilestone(null))?.get("In Progress") ?? []).map((t) => t.id)).toEqual(["task-2"]);
		expect((grouped.get(laneKeyFromMilestone("Extra"))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["task-3"]);
	});

	it("places all tasks into the default lane when lane mode is none", () => {
		const lanes = buildLanes("none", tasks, []);
		const grouped = groupTasksByLaneAndStatus("none", lanes, ["To Do", "In Progress"], tasks);
		const defaultLaneTasks = grouped.get(DEFAULT_LANE_KEY);

		expect(defaultLaneTasks?.get("To Do")?.map((t) => t.id)).toEqual(["task-3", "task-1"]);
		expect(defaultLaneTasks?.get("In Progress")?.map((t) => t.id)).toEqual(["task-2"]);
	});

	it("normalizes archived milestone tasks to no milestone", () => {
		const lanes = buildLanes("milestone", tasks, ["M1"], [], { archivedMilestoneIds: ["M1"] });
		const grouped = groupTasksByLaneAndStatus("milestone", lanes, ["To Do", "In Progress"], tasks, {
			archivedMilestoneIds: ["M1"],
		});
		expect((grouped.get(laneKeyFromMilestone(null))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["task-1"]);
	});

	it("normalizes numeric aliases for archived milestones to no milestone", () => {
		const archivedMilestones = [{ id: "m-1", title: "Archived", description: "", rawContent: "" }];
		const archivedAliasTasks = [makeTask({ id: "task-1", status: "To Do", milestone: "1" })];
		const lanes = buildLanes("milestone", archivedAliasTasks, [], []);
		const grouped = groupTasksByLaneAndStatus("milestone", lanes, ["To Do"], archivedAliasTasks, {
			archivedMilestoneIds: ["m-1"],
			archivedMilestones,
		});
		expect((grouped.get(laneKeyFromMilestone(null))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["task-1"]);
	});

	it("prefers real milestone IDs over numeric title aliases when grouping tasks", () => {
		const tasksWithNumericTitleCollision = [makeTask({ id: "task-1", status: "To Do", milestone: "1" })];
		const milestones = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "1", description: "", rawContent: "" },
		];
		const lanes = buildLanes("milestone", tasksWithNumericTitleCollision, [], milestones);
		const grouped = groupTasksByLaneAndStatus("milestone", lanes, ["To Do"], tasksWithNumericTitleCollision, {
			milestoneEntities: milestones,
		});
		expect((grouped.get(laneKeyFromMilestone("m-1"))?.get("To Do") ?? []).map((task) => task.id)).toEqual(["task-1"]);
		expect((grouped.get(laneKeyFromMilestone("m-2"))?.get("To Do") ?? []).map((task) => task.id) ?? []).toHaveLength(0);
	});

	it("groups tasks under their pipeline_id lanes", () => {
		const pipelineTasks = [
			makeTask({ id: "task-1", status: "To Do", pipeline_id: "epicd" }),
			makeTask({ id: "task-2", status: "In Progress", pipeline_id: "backlog" }),
			makeTask({ id: "task-3", status: "To Do" }),
		];
		const lanes = buildLanes("pipeline", pipelineTasks, []);
		const grouped = groupTasksByLaneAndStatus("pipeline", lanes, ["To Do", "In Progress"], pipelineTasks);

		expect((grouped.get(laneKeyFromPipeline("epicd"))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["task-1"]);
		expect((grouped.get(laneKeyFromPipeline("backlog"))?.get("In Progress") ?? []).map((t) => t.id)).toEqual([
			"task-2",
		]);
		expect((grouped.get(laneKeyFromPipeline(undefined))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["task-3"]);
	});

	it("falls back tasks with no pipeline_id into the No pipeline lane", () => {
		const pipelineTasks = [
			makeTask({ id: "task-1", status: "To Do" }),
			makeTask({ id: "task-2", status: "To Do", pipeline_id: "" }),
		];
		const lanes = buildLanes("pipeline", pipelineTasks, []);
		const grouped = groupTasksByLaneAndStatus("pipeline", lanes, ["To Do"], pipelineTasks);

		expect((grouped.get(laneKeyFromPipeline(undefined))?.get("To Do") ?? []).map((t) => t.id)).toEqual([
			"task-1",
			"task-2",
		]);
	});
});

describe("groupTasksByPhase", () => {
	it("orders phases alphabetically and sorts tasks by priority within each phase", () => {
		const tasks = [
			makeTask({ id: "task-1", phase: "Execution", priority: "low" }),
			makeTask({ id: "task-2", phase: "Execution", priority: "high" }),
			makeTask({ id: "task-3", phase: "Design", priority: "medium" }),
			makeTask({ id: "task-4", phase: "Design" }),
		];

		const groups = groupTasksByPhase(tasks);

		expect(groups.map((g) => g.phase)).toEqual(["Design", "Execution"]);
		expect(groups[0]?.tasks.map((t) => t.id)).toEqual(["task-3", "task-4"]);
		expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["task-2", "task-1"]);
	});

	it("falls back tasks with no phase into a single trailing No phase group instead of crashing", () => {
		const tasks = [
			makeTask({ id: "task-1", phase: "Execution" }),
			makeTask({ id: "task-2" }),
			makeTask({ id: "task-3", phase: "" }),
		];

		const groups = groupTasksByPhase(tasks);

		expect(groups.map((g) => g.phase)).toEqual(["Execution", "__none"]);
		expect(groups[1]?.label).toBe(NO_PHASE_LABEL);
		expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["task-2", "task-3"]);
	});

	it("returns an empty array for an empty task list without crashing", () => {
		expect(groupTasksByPhase([])).toEqual([]);
	});
});

describe("phaseKeyOf", () => {
	it("returns the task's phase when set", () => {
		expect(phaseKeyOf(makeTask({ phase: "evaluating" }))).toBe("evaluating");
	});

	it("falls back to NO_PHASE_KEY when phase is missing or blank", () => {
		expect(phaseKeyOf(makeTask({}))).toBe(NO_PHASE_KEY);
		expect(phaseKeyOf(makeTask({ phase: "" }))).toBe(NO_PHASE_KEY);
		expect(phaseKeyOf(makeTask({ phase: "   " }))).toBe(NO_PHASE_KEY);
	});
});

describe("phaseColumnLabel", () => {
	it("title-cases hyphenated phase keys", () => {
		expect(phaseColumnLabel("awaiting-children")).toBe("Awaiting Children");
		expect(phaseColumnLabel("done")).toBe("Done");
	});

	it("returns the shared No phase label for NO_PHASE_KEY", () => {
		expect(phaseColumnLabel(NO_PHASE_KEY)).toBe(NO_PHASE_LABEL);
	});
});

describe("buildPhaseColumns", () => {
	it("returns the execution pipeline's phases in pipeline order (AC#4), not hardcoded status names", () => {
		const columns = buildPhaseColumns([]);
		expect(columns).toEqual([
			"ready",
			"decomposing",
			"awaiting-children",
			"evaluating",
			"adjudicating",
			"needs-human",
			"done",
		]);
	});

	it("ends in the pipeline's terminal phase", () => {
		const columns = buildPhaseColumns([]);
		expect(columns.at(-1)).toBe(PIPELINE_TERMINAL_PHASE);
		expect(PIPELINE_TERMINAL_PHASE).toBe("done");
	});

	it("appends other pipelines' phases (e.g. authoring/exploration) sorted after the execution pipeline", () => {
		const tasks = [makeTask({ id: "task-1", phase: "refining" }), makeTask({ id: "task-2", phase: "spike" })];
		const columns = buildPhaseColumns(tasks);
		expect(columns.slice(0, 7)).toEqual([
			"ready",
			"decomposing",
			"awaiting-children",
			"evaluating",
			"adjudicating",
			"needs-human",
			"done",
		]);
		expect(columns.slice(7)).toEqual(["refining", "spike"]);
	});

	it("appends a trailing No phase column only when at least one task has no phase", () => {
		const withNoPhase = buildPhaseColumns([makeTask({ id: "task-1" }), makeTask({ id: "task-2", phase: "done" })]);
		expect(withNoPhase.at(-1)).toBe(NO_PHASE_KEY);

		const withoutNoPhase = buildPhaseColumns([makeTask({ id: "task-1", phase: "done" })]);
		expect(withoutNoPhase).not.toContain(NO_PHASE_KEY);
	});
});

describe("groupTasksByLaneAndStatus with a custom keyOf extractor", () => {
	it("buckets tasks by phase instead of status when phaseKeyOf is passed", () => {
		const tasks = [
			makeTask({ id: "task-1", status: "To Do", phase: "ready" }),
			makeTask({ id: "task-2", status: "In Progress", phase: "evaluating" }),
			makeTask({ id: "task-3", status: "Done" }),
		];
		const lanes = buildLanes("none", tasks, []);
		const columns = buildPhaseColumns(tasks);
		const grouped = groupTasksByLaneAndStatus("none", lanes, columns, tasks, undefined, phaseKeyOf);

		expect(
			grouped
				.get(DEFAULT_LANE_KEY)
				?.get("ready")
				?.map((t) => t.id),
		).toEqual(["task-1"]);
		expect(
			grouped
				.get(DEFAULT_LANE_KEY)
				?.get("evaluating")
				?.map((t) => t.id),
		).toEqual(["task-2"]);
		expect(
			grouped
				.get(DEFAULT_LANE_KEY)
				?.get(NO_PHASE_KEY)
				?.map((t) => t.id),
		).toEqual(["task-3"]);
	});
});

describe("sortTasksForStatus", () => {
	it("prioritizes ordinal when present and falls back to updatedDate for done statuses", () => {
		const tasks = [
			makeTask({ id: "task-1", status: "Done", updatedDate: "2024-01-02", createdDate: "2024-01-01" }),
			makeTask({ id: "task-2", status: "Done", ordinal: 1, updatedDate: "2024-01-01" }),
			makeTask({ id: "task-3", status: "Done", updatedDate: "2024-01-03", createdDate: "2024-01-01" }),
		];

		const sorted = sortTasksForStatus(tasks, "Done").map((t) => t.id);
		expect(sorted).toEqual(["task-2", "task-3", "task-1"]);
	});
});
