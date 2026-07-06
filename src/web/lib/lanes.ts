import { executionPipeline } from "../../engine/pipeline";
import type { Milestone, Task } from "../../types";
import { getMilestoneLabel, milestoneKey, normalizeMilestoneName } from "../utils/milestones";

export type LaneMode = "none" | "milestone" | "pipeline";

export interface LaneDefinition {
	key: string;
	label: string;
	milestone?: string;
	pipelineId?: string;
	/** True for the fallback/ungrouped lane (no milestone, or no pipeline_id). */
	isNoMilestone?: boolean;
}

export const DEFAULT_LANE_KEY = "lane:none";
export const NO_MILESTONE_LABEL = "No milestone";
export const NO_PIPELINE_LABEL = "No pipeline";

export const laneKeyFromMilestone = (milestone?: string | null): string => {
	const key = milestoneKey(milestone);
	return key.length > 0 ? `lane:milestone:${key}` : "lane:milestone:__none";
};

export const laneKeyFromPipeline = (pipelineId?: string | null): string => {
	const trimmed = (pipelineId ?? "").trim();
	return trimmed.length > 0 ? `lane:pipeline:${trimmed}` : "lane:pipeline:__none";
};

function buildMilestoneAliasMap(
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): Map<string, string> {
	const aliasMap = new Map<string, string>();
	const collectIdAliasKeys = (value: string): string[] => {
		const normalized = normalizeMilestoneName(value);
		const idKey = milestoneKey(normalized);
		if (!idKey) return [];
		const keys = new Set<string>([idKey]);
		if (/^\d+$/.test(normalized)) {
			const numericAlias = String(Number.parseInt(normalized, 10));
			keys.add(numericAlias);
			keys.add(`m-${numericAlias}`);
			return Array.from(keys);
		}
		const idMatch = normalized.match(/^m-(\d+)$/i);
		if (idMatch?.[1]) {
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			keys.add(`m-${numericAlias}`);
			keys.add(numericAlias);
		}
		return Array.from(keys);
	};
	const reservedIdKeys = new Set<string>();
	for (const milestone of [...milestoneEntities, ...archivedMilestones]) {
		for (const key of collectIdAliasKeys(milestone.id)) {
			reservedIdKeys.add(key);
		}
	}
	const setAlias = (aliasKey: string, normalizedId: string, allowOverwrite: boolean): void => {
		const existing = aliasMap.get(aliasKey);
		if (!existing) {
			aliasMap.set(aliasKey, normalizedId);
			return;
		}
		if (!allowOverwrite) {
			return;
		}
		const existingKey = existing.toLowerCase();
		const nextKey = normalizedId.toLowerCase();
		const preferredRawId = /^\d+$/.test(aliasKey) ? `m-${aliasKey}` : /^m-\d+$/.test(aliasKey) ? aliasKey : null;
		if (preferredRawId) {
			const existingIsPreferred = existingKey === preferredRawId;
			const nextIsPreferred = nextKey === preferredRawId;
			if (existingIsPreferred && !nextIsPreferred) {
				return;
			}
			if (nextIsPreferred && !existingIsPreferred) {
				aliasMap.set(aliasKey, normalizedId);
			}
			return;
		}
		aliasMap.set(aliasKey, normalizedId);
	};
	const addIdAliases = (normalizedId: string, allowOverwrite = true) => {
		const idKey = milestoneKey(normalizedId);
		if (idKey) {
			setAlias(idKey, normalizedId, allowOverwrite);
		}
		const idMatch = normalizedId.match(/^m-(\d+)$/i);
		if (!idMatch?.[1]) {
			return;
		}
		const numericAlias = String(Number.parseInt(idMatch[1], 10));
		const canonicalId = `m-${numericAlias}`;
		setAlias(canonicalId, normalizedId, allowOverwrite);
		setAlias(numericAlias, normalizedId, allowOverwrite);
	};
	const titleCounts = new Map<string, number>();
	for (const milestone of milestoneEntities) {
		const titleKey = milestoneKey(milestone.title);
		if (!titleKey) continue;
		titleCounts.set(titleKey, (titleCounts.get(titleKey) ?? 0) + 1);
	}
	const activeTitleKeys = new Set(titleCounts.keys());
	for (const milestone of milestoneEntities) {
		const normalizedId = normalizeMilestoneName(milestone.id);
		const normalizedTitle = normalizeMilestoneName(milestone.title);
		if (!normalizedId) continue;
		addIdAliases(normalizedId);
		const titleKey = milestoneKey(normalizedTitle);
		if (titleKey && !reservedIdKeys.has(titleKey) && titleCounts.get(titleKey) === 1) {
			if (!aliasMap.has(titleKey)) {
				aliasMap.set(titleKey, normalizedId);
			}
		}
	}

	const archivedTitleCounts = new Map<string, number>();
	for (const milestone of archivedMilestones) {
		const titleKey = milestoneKey(milestone.title);
		if (!titleKey || activeTitleKeys.has(titleKey)) continue;
		archivedTitleCounts.set(titleKey, (archivedTitleCounts.get(titleKey) ?? 0) + 1);
	}
	for (const milestone of archivedMilestones) {
		const normalizedId = normalizeMilestoneName(milestone.id);
		const normalizedTitle = normalizeMilestoneName(milestone.title);
		if (!normalizedId) continue;
		addIdAliases(normalizedId, false);
		const titleKey = milestoneKey(normalizedTitle);
		if (!titleKey || activeTitleKeys.has(titleKey) || reservedIdKeys.has(titleKey)) continue;
		if (archivedTitleCounts.get(titleKey) === 1) {
			if (!aliasMap.has(titleKey)) {
				aliasMap.set(titleKey, normalizedId);
			}
		}
	}
	return aliasMap;
}

function canonicalizeMilestone(value: string | null | undefined, aliasMap: Map<string, string>): string {
	const normalized = normalizeMilestoneName(value ?? "");
	if (!normalized) return "";
	const normalizedKey = milestoneKey(normalized);
	const direct = aliasMap.get(normalizedKey);
	if (direct) {
		return direct;
	}
	const idMatch = normalized.match(/^m-(\d+)$/i);
	if (idMatch?.[1]) {
		const numericAlias = String(Number.parseInt(idMatch[1], 10));
		return aliasMap.get(`m-${numericAlias}`) ?? aliasMap.get(numericAlias) ?? normalized;
	}
	if (/^\d+$/.test(normalized)) {
		const numericAlias = String(Number.parseInt(normalized, 10));
		return aliasMap.get(`m-${numericAlias}`) ?? aliasMap.get(numericAlias) ?? normalized;
	}
	return normalized;
}

export function buildLanes(
	mode: LaneMode,
	tasks: Task[],
	configMilestones: string[],
	milestoneEntities: Milestone[] = [],
	options?: { archivedMilestoneIds?: string[]; archivedMilestones?: Milestone[] },
): LaneDefinition[] {
	if (mode === "pipeline") {
		return buildPipelineLanes(tasks);
	}

	if (mode !== "milestone") {
		return [
			{
				key: DEFAULT_LANE_KEY,
				label: "All tasks",
				isNoMilestone: true,
			},
		];
	}

	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const aliasMap = buildMilestoneAliasMap(milestoneEntities, options?.archivedMilestones ?? []);
	const milestonesByKey = new Map<string, string>();
	const addMilestone = (value: string) => {
		const normalized = canonicalizeMilestone(value, aliasMap);
		if (!normalized) return;
		const key = milestoneKey(normalized);
		if (!key) return;
		if (archivedKeys.has(key)) return;
		if (milestonesByKey.has(key)) return;
		milestonesByKey.set(key, normalized);
	};

	configMilestones.forEach(addMilestone);
	tasks.forEach((task) => {
		addMilestone(task.milestone ?? "");
	});

	const laneMilestones = Array.from(milestonesByKey.values());

	return [
		{
			key: laneKeyFromMilestone(undefined),
			label: NO_MILESTONE_LABEL,
			milestone: undefined,
			isNoMilestone: true,
		},
		...laneMilestones.map((milestone) => ({
			key: laneKeyFromMilestone(milestone),
			label: getMilestoneLabel(milestone, milestoneEntities),
			milestone,
			isNoMilestone: false,
		})),
	];
}

function buildPipelineLanes(tasks: Task[]): LaneDefinition[] {
	const pipelineIds = new Map<string, string>();
	for (const task of tasks) {
		const trimmed = (task.pipeline_id ?? "").trim();
		if (trimmed && !pipelineIds.has(trimmed)) {
			pipelineIds.set(trimmed, trimmed);
		}
	}
	const sortedIds = Array.from(pipelineIds.values()).sort((a, b) => a.localeCompare(b));

	return [
		{
			key: laneKeyFromPipeline(undefined),
			label: NO_PIPELINE_LABEL,
			isNoMilestone: true,
		},
		...sortedIds.map((pipelineId) => ({
			key: laneKeyFromPipeline(pipelineId),
			label: pipelineId,
			pipelineId,
			isNoMilestone: false,
		})),
	];
}

const PRIORITY_RANK: Record<string, number> = {
	high: 3,
	medium: 2,
	low: 1,
};

function sortTasksByPriority(tasks: Task[]): Task[] {
	return tasks.slice().sort((a, b) => {
		const rankA = PRIORITY_RANK[(a.priority ?? "").toLowerCase()] ?? 0;
		const rankB = PRIORITY_RANK[(b.priority ?? "").toLowerCase()] ?? 0;
		if (rankA !== rankB) return rankB - rankA;
		return a.id.localeCompare(b.id, undefined, { sensitivity: "base", numeric: true });
	});
}

/**
 * Independent has-children indicator (BACK-664 child 1 / BACK-665 AC#3):
 * whether a task has any children, derived purely from tree position
 * (`parentTaskId`), never concatenated into the status display string.
 *
 * A web-local reimplementation of `utils/task-subtasks.ts`'s `hasChildren` —
 * that module imports `utils/task-path.ts`, which imports `core/backlog.ts`
 * (Core), so importing it from a browser bundle drags in Bun/Node-only
 * modules and breaks the web build. Task IDs served by the API are already
 * canonical, so a case-insensitive string comparison is sufficient here.
 */
export function hasChildren(task: Task, tasks: Task[]): boolean {
	const id = task.id.trim().toLowerCase();
	return tasks.some((candidate) => (candidate.parentTaskId ?? "").trim().toLowerCase() === id);
}

export const NO_PHASE_KEY = "__none";
export const NO_PHASE_LABEL = "No phase";

export interface PhaseGroup {
	phase: string;
	label: string;
	tasks: Task[];
}

/**
 * Groups tasks (typically the contents of a single pipeline lane) into
 * phase-ordered columns, sorted by priority within each phase. Tasks with
 * no `phase` set fall into a single trailing "No phase" group instead of
 * being dropped or causing an error.
 */
export function groupTasksByPhase(tasks: Task[]): PhaseGroup[] {
	const groups = new Map<string, Task[]>();
	for (const task of tasks) {
		const phase = (task.phase ?? "").trim();
		const key = phase.length > 0 ? phase : NO_PHASE_KEY;
		const bucket = groups.get(key) ?? [];
		bucket.push(task);
		groups.set(key, bucket);
	}

	const orderedPhases = Array.from(groups.keys())
		.filter((key) => key !== NO_PHASE_KEY)
		.sort((a, b) => a.localeCompare(b));

	const result: PhaseGroup[] = orderedPhases.map((phase) => ({
		phase,
		label: phase,
		tasks: sortTasksByPriority(groups.get(phase) ?? []),
	}));

	const noPhaseTasks = groups.get(NO_PHASE_KEY);
	if (noPhaseTasks && noPhaseTasks.length > 0) {
		result.push({ phase: NO_PHASE_KEY, label: NO_PHASE_LABEL, tasks: sortTasksByPriority(noPhaseTasks) });
	}

	return result;
}

// BACK-647 604.4: kanban Board column derivation, reusing the same NO_PHASE
// fallback used above for TaskList's phase grouping so a task missing a phase
// (no pipeline_id, or a legacy status-only task) never silently disappears.
const PIPELINE_PHASE_ORDER: string[] = executionPipeline.states.map((state) => state.name);
export const PIPELINE_TERMINAL_PHASE = PIPELINE_PHASE_ORDER[PIPELINE_PHASE_ORDER.length - 1] ?? NO_PHASE_KEY;

/** Column-bucket key for a task: its `phase` when set, else the shared `NO_PHASE_KEY` fallback. */
export function phaseKeyOf(task: Task): string {
	const phase = (task.phase ?? "").trim();
	return phase.length > 0 ? phase : NO_PHASE_KEY;
}

/** Human label for a phase-bucket key produced by `phaseKeyOf`/`buildPhaseColumns`. */
export function phaseColumnLabel(phaseKey: string): string {
	if (phaseKey === NO_PHASE_KEY) return NO_PHASE_LABEL;
	return phaseKey
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * The Board's kanban columns: always the execution pipeline's phase set, in
 * pipeline order (its source of truth per AC#4 - see `engine/pipeline.ts`),
 * plus any other phase actually present on a task (sorted after, for other
 * pipelines e.g. authoring/exploration), plus a trailing `NO_PHASE_KEY`
 * column when at least one task has no phase (no pipeline_id, or a legacy
 * status-only task) so it still renders instead of being dropped.
 */
export function buildPhaseColumns(tasks: Task[]): string[] {
	const baseline = new Set(PIPELINE_PHASE_ORDER);
	const extra = new Set<string>();
	let hasNoPhase = false;
	for (const task of tasks) {
		const phase = (task.phase ?? "").trim();
		if (!phase) {
			hasNoPhase = true;
			continue;
		}
		if (!baseline.has(phase)) {
			extra.add(phase);
		}
	}
	const columns = [...PIPELINE_PHASE_ORDER, ...Array.from(extra).sort((a, b) => a.localeCompare(b))];
	if (hasNoPhase) {
		columns.push(NO_PHASE_KEY);
	}
	return columns;
}

export function sortTasksForStatus(tasks: Task[], status: string): Task[] {
	const isDoneStatus = status.toLowerCase().includes("done") || status.toLowerCase().includes("complete");

	return tasks.slice().sort((a, b) => {
		// Tasks with ordinal come before tasks without
		if (a.ordinal !== undefined && b.ordinal === undefined) {
			return -1;
		}
		if (a.ordinal === undefined && b.ordinal !== undefined) {
			return 1;
		}

		// Both have ordinals - sort by ordinal value
		if (a.ordinal !== undefined && b.ordinal !== undefined && a.ordinal !== b.ordinal) {
			return a.ordinal - b.ordinal;
		}

		if (isDoneStatus) {
			const aDate = a.updatedDate || a.createdDate;
			const bDate = b.updatedDate || b.createdDate;
			return bDate.localeCompare(aDate);
		}

		return a.createdDate.localeCompare(b.createdDate);
	});
}

function normalizeMilestoneValue(value: string | null): string | undefined {
	if (value === null) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function buildGlobalOrderedTaskIdsForMilestoneLaneReorder(params: {
	tasks: Task[];
	taskId: string;
	targetStatus: string;
	targetMilestone: string | null;
	laneOrderedTaskIds: string[];
}): string[] {
	const targetMilestoneValue = normalizeMilestoneValue(params.targetMilestone);
	const taskId = String(params.taskId || "").trim();
	const targetStatus = String(params.targetStatus || "").trim();

	if (!taskId || !targetStatus) {
		return params.laneOrderedTaskIds;
	}

	const nextTasks = params.tasks.map((task) => {
		if (task.id !== taskId) return task;
		return {
			...task,
			status: targetStatus,
			milestone: targetMilestoneValue,
		};
	});

	const statusTasks = nextTasks.filter((task) => (task.status ?? "") === targetStatus);
	const templateIds = sortTasksForStatus(statusTasks, targetStatus).map((task) => task.id);

	if (templateIds.length === 0) {
		return params.laneOrderedTaskIds;
	}

	const targetMilestoneKey = milestoneKey(targetMilestoneValue);
	const laneTaskIds = new Set(
		statusTasks.filter((task) => milestoneKey(task.milestone) === targetMilestoneKey).map((task) => task.id),
	);

	const laneOrder: string[] = [];
	const laneSeen = new Set<string>();
	for (const id of params.laneOrderedTaskIds) {
		if (!laneTaskIds.has(id)) continue;
		if (laneSeen.has(id)) continue;
		laneSeen.add(id);
		laneOrder.push(id);
	}

	for (const id of templateIds) {
		if (!laneTaskIds.has(id)) continue;
		if (laneSeen.has(id)) continue;
		laneSeen.add(id);
		laneOrder.push(id);
	}

	const merged: string[] = [];
	let laneIndex = 0;
	for (const id of templateIds) {
		if (laneTaskIds.has(id)) {
			const nextLaneId = laneOrder[laneIndex];
			if (nextLaneId) {
				merged.push(nextLaneId);
				laneIndex += 1;
			} else {
				merged.push(id);
			}
			continue;
		}
		merged.push(id);
	}

	if (!laneTaskIds.has(taskId) || !merged.includes(taskId)) {
		return templateIds;
	}

	if (merged.length !== templateIds.length) {
		return templateIds;
	}

	const mergedSet = new Set(merged);
	if (mergedSet.size !== merged.length) {
		return templateIds;
	}

	for (const id of templateIds) {
		if (!mergedSet.has(id)) {
			return templateIds;
		}
	}

	return merged;
}

export function groupTasksByLaneAndStatus(
	mode: LaneMode,
	lanes: LaneDefinition[],
	statuses: string[],
	tasks: Task[],
	options?: { archivedMilestoneIds?: string[]; milestoneEntities?: Milestone[]; archivedMilestones?: Milestone[] },
	/** Column-bucket key extractor. Defaults to `task.status`; pass a different extractor
	 *  (e.g. phase-derived, see `phaseKeyOf`) to bucket by another field without duplicating
	 *  the lane/milestone-canonicalization logic below. */
	keyOf: (task: Task) => string = (task) => task.status ?? "",
): Map<string, Map<string, Task[]>> {
	const result = new Map<string, Map<string, Task[]>>();
	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const aliasMap = buildMilestoneAliasMap(options?.milestoneEntities ?? [], options?.archivedMilestones ?? []);
	const normalizedTasks = tasks.map((task) => {
		const canonicalMilestone = canonicalizeMilestone(task.milestone, aliasMap);
		const key = milestoneKey(canonicalMilestone);
		if (!key || (archivedKeys.size > 0 && archivedKeys.has(key))) {
			if (task.milestone === undefined) {
				return task;
			}
			return { ...task, milestone: undefined };
		}
		if (task.milestone === canonicalMilestone) {
			return task;
		}
		return { ...task, milestone: canonicalMilestone };
	});

	const ensureStatusMap = (laneKey: string): Map<string, Task[]> => {
		const existing = result.get(laneKey);
		if (existing) return existing;
		const statusMap = new Map<string, Task[]>();
		for (const status of statuses) {
			statusMap.set(status, []);
		}
		result.set(laneKey, statusMap);
		return statusMap;
	};

	for (const lane of lanes) {
		ensureStatusMap(lane.key);
	}

	for (const task of normalizedTasks) {
		const statusKey = keyOf(task);
		const laneKey =
			mode === "milestone"
				? laneKeyFromMilestone(task.milestone)
				: mode === "pipeline"
					? laneKeyFromPipeline(task.pipeline_id)
					: DEFAULT_LANE_KEY;
		const statusMap = ensureStatusMap(laneKey);

		let bucket = statusMap.get(statusKey);
		if (!bucket) {
			bucket = [];
			statusMap.set(statusKey, bucket);
		}
		bucket.push(task);
	}

	for (const [, statusMap] of result) {
		for (const [status, list] of statusMap) {
			statusMap.set(status, sortTasksForStatus(list, status));
		}
	}

	return result;
}
