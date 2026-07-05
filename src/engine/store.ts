import type { Core } from "../core/backlog.js";
import type { Task, TaskCreateInput, TaskUpdateInput } from "../types/index.js";
import type { TaskStore } from "./complete.js";

/**
 * Build a TaskStore backed by the real Core (reads and writes backlog/tasks/*.md).
 * autoCommit is disabled so the engine controls when changes are persisted to git.
 */
export function makeBoardStore(core: Core): TaskStore {
	return {
		getTask: (taskId) => core.getTask(taskId),
		updateTask: (task) => core.updateTask(task, false),
	};
}

/**
 * Data-selection filter for IssueSource.list (BACK-601.1). Engine-field equality only —
 * relationship judgement (e.g. "all children terminal") stays with the driver/interpreter,
 * per docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md §7 R5.
 */
export interface IssueSourceFilter {
	pipeline_id?: string;
	phase?: string;
	parent_id?: string;
}

/**
 * Upsert input for IssueSource: presence of `id` selects update (Core.updateTaskFromInput),
 * its absence selects create (Core.createTaskFromInput). One method, not load/save/update
 * (CLAUDE.md minimal-API guidance) — Core's create/update remain genuinely separate
 * underlying code paths (id generation + new file vs. load + mutate), so upsert branches
 * internally rather than forcing a single Core entry point.
 */
export type IssueSourceUpsertInput = TaskCreateInput | ({ id: string } & TaskUpdateInput);

/**
 * Minimal storage-agnostic contract for reading/writing tagged task documents
 * (docs/proposals/2026-07-03-driver-supervisor-multi-lane-runtime.md §4.5 / BACK-601.1).
 * list/get/upsert only — lock/offset/staleness stay with the supervisor, never leak into
 * this interface (§7 R5's data-plane / coordination-plane boundary). No external
 * (GitHub/GitLab) adapter exists or is implemented here; a remote IssueSource would be a
 * separate implementation of this same interface, added without touching driver/supervisor
 * control flow.
 */
export interface IssueSource {
	list(filter?: IssueSourceFilter): Promise<Task[]>;
	get(id: string): Promise<Task | null>;
	upsert(input: IssueSourceUpsertInput): Promise<Task>;
}

/**
 * The sole IssueSource implementation (E1): delegates to Core/FileSystem, reading and
 * writing backlog/tasks/*.md. Extends makeBoardStore's Core delegation rather than
 * building a parallel data-access abstraction.
 */
export function makeLocalIssueSource(core: Core): IssueSource {
	return {
		async list(filter) {
			const tasks = await core.queryTasks({});
			if (!filter) return tasks;
			return tasks.filter(
				(task) =>
					(filter.pipeline_id === undefined || task.pipeline_id === filter.pipeline_id) &&
					(filter.phase === undefined || task.phase === filter.phase) &&
					(filter.parent_id === undefined || task.parent_id === filter.parent_id),
			);
		},
		get: (id) => core.getTask(id),
		async upsert(input) {
			if ("id" in input) {
				const { id, ...update } = input;
				return core.updateTaskFromInput(id, update, false);
			}
			const { task } = await core.createTaskFromInput(input, false);
			return task;
		},
	};
}
