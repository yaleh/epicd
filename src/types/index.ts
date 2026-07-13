export type TaskStatus = string;

/**
 * Entity types in the backlog system.
 * Used for ID generation and prefix resolution.
 */
export enum EntityType {
	Task = "task",
	Document = "document",
	Decision = "decision",
}

// Engine pipeline fields
export interface DoDItem {
	text: string;
	checked: boolean;
}

export interface CapMarker {
	[key: string]: unknown;
}

// Structured Acceptance Criterion (domain-level)
export interface AcceptanceCriterion {
	index: number; // 1-based
	text: string;
	checked: boolean;
}

export interface AcceptanceCriterionInput {
	text: string;
	checked?: boolean;
}

export interface TaskComment {
	index: number;
	body: string;
	createdDate: string;
	author?: string;
}

export interface TaskCommentInput {
	body: string;
	author?: string;
	createdDate?: string;
}

export interface Task {
	id: string;
	title: string;
	status: TaskStatus;
	assignee: string[];
	reporter?: string;
	createdDate: string;
	updatedDate?: string;
	labels: string[];
	milestone?: string;
	dependencies: string[];
	references?: string[];
	documentation?: string[];
	modifiedFiles?: string[];
	readonly rawContent?: string; // Raw markdown content without frontmatter (read-only: do not modify directly)
	description?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	comments?: TaskComment[];
	finalSummary?: string;
	/** Structured acceptance criteria parsed from body (checked state + text + index) */
	acceptanceCriteriaItems?: AcceptanceCriterion[];
	/** Structured Definition of Done checklist parsed from body (checked state + text + index) */
	definitionOfDoneItems?: AcceptanceCriterion[];
	parentTaskId?: string;
	parentTaskTitle?: string;
	subtasks?: string[];
	subtaskSummaries?: Array<{ id: string; title: string }>;
	priority?: "high" | "medium" | "low";
	branch?: string;
	ordinal?: number;
	filePath?: string;
	// Metadata fields
	lastModified?: Date;
	source?: "local" | "remote" | "completed" | "local-branch";
	/** Optional per-task callback command to run on status change (overrides global config) */
	onStatusChange?: string;
	// Engine pipeline fields (four-axis model)
	pipeline_id?: string;
	phase?: string; // bare phase name within the pipeline (replaces state)
	parent_id?: string;
	/**
	 * Cross-pipeline derivation edge (BACK-603 603.2). Distinct from `parent_id`,
	 * which is a same-pipeline decomposition-tree edge (epic → its decomposed
	 * children): `provenance.spawned_from` records the id of the task in a
	 * DIFFERENT pipeline that this task was spawned from (e.g. an execution task
	 * spawned out of a finished exploration spike). Optional; absent by default.
	 */
	provenance?: { spawned_from: string };
	dod?: DoDItem[];
	cap?: CapMarker[];
	/**
	 * Append-only log of authoring/refine steps (BACK-601 A). Net-new engine
	 * field; absent by default and only written when non-empty.
	 */
	refine_log?: string[];
	/**
	 * The `pipeline_id/phase` this task entered its current pipeline from
	 * (BACK-682 schema #1). Written once, at promote/spawn time. Combined with
	 * `retreat_log`, this is the single-step-retreat guard's anchor: a retreat
	 * from `execution/adjudicating` may only target this exact phase.
	 */
	entry_phase?: string;
	/**
	 * Append-only history of retreat edges written from `execution/adjudicating`
	 * (BACK-682 schema #1). Never rewritten or truncated — a retreat's contract
	 * (`keep`/`missing`/`wrong`) is preserved even after the retreated task
	 * returns and re-reaches `adjudicating`.
	 */
	retreat_log?: RetreatEntry[];
	/**
	 * Append-only dedup history of gap fingerprints that have already triggered
	 * one retreat (BACK-682 schema #2). A fingerprint appearing a second time
	 * forces `needs-human` instead of a second retreat.
	 */
	gap_history?: string[];
}

/**
 * The three-way retreat contract (BACK-682 schema #3): what a retreat from
 * `execution/adjudicating` claims about the state of the work it is sending
 * back. `keep` are AC ids already satisfied and must not be re-touched by the
 * next implementation round; `missing` are ACs with no implementation yet;
 * `wrong` are ACs whose existing implementation must be treated as obsolete —
 * each `wrong` entry MUST name the obsolete block being retired.
 */
export interface RetreatContract {
	/** AC identifiers already satisfied — protected from being undone. */
	keep: string[];
	missing: { ac: string; description: string }[];
	wrong: { ac: string; description: string; obsoleteBlock: { file: string; lines: string; reason: string } }[];
}

/**
 * One append-only retreat edge (BACK-682 schema #1), always written from
 * `execution/adjudicating` and always targeting the task's own `entry_phase`
 * (one step, never a cross-level jump).
 */
export interface RetreatEntry {
	/** ISO8601 timestamp. */
	ts: string;
	/** Always "execution/adjudicating" — the only phase allowed to retreat. */
	from: string;
	/** Must equal task.entry_phase — the single-step-retreat guard. */
	toPhase: string;
	gapFingerprint: string;
	/** "implementation"-layer gaps never retreat — they stay in the inner loop. */
	classification: "spec" | "decomposition" | "goal";
	contract: RetreatContract;
}

export interface MilestoneBucket {
	key: string;
	label: string;
	milestone?: string;
	isNoMilestone: boolean;
	isCompleted: boolean;
	tasks: Task[];
	statusCounts: Record<string, number>;
	total: number;
	doneCount: number;
	progress: number;
}

export interface MilestoneSummary {
	milestones: string[];
	buckets: MilestoneBucket[];
}

/**
 * Check if a task is locally editable (not from a remote or other local branch)
 */
export function isLocalEditableTask(task: Task): boolean {
	return task.source === undefined || task.source === "local" || task.source === "completed";
}

/**
 * Resolve the effective role of a task (ADR-011 D-1.1).
 *
 * Priority:
 *  1. Tree-derived — compound if the task has subtasks/children, primitive otherwise.
 *  2. `kind:epic` label — the only durable pre-decompose compound signal now that the
 *     `role:` field is deleted (L3, docs/task-lifecycle-model.md §2/§4; BACK-643, BACK-664.2).
 *
 * Pass `childIds` when you have the live child list; otherwise the function falls back
 * to `task.subtasks` which is available after a normal load.
 */
export function roleOf(task: Task, childIds?: string[]): "compound" | "primitive" {
	const children = childIds ?? task.subtasks;
	if (children && children.length > 0) return "compound";
	return task.labels?.includes("kind:epic") ? "compound" : "primitive";
}

export interface TaskCreateInput {
	title: string;
	description?: string;
	status?: TaskStatus;
	priority?: "high" | "medium" | "low";
	ordinal?: number;
	milestone?: string;
	labels?: string[];
	assignee?: string[];
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	modifiedFiles?: string[];
	parentTaskId?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
	acceptanceCriteria?: AcceptanceCriterionInput[];
	definitionOfDoneAdd?: string[];
	disableDefinitionOfDoneDefaults?: boolean;
	/**
	 * Structured executable DoD gates (BACK-613): each string is a shell command
	 * the engine re-runs verbatim (ENG-8) before merging. Distinct from
	 * `definitionOfDoneAdd`, which is the human-facing prose `## Definition of Done`
	 * checklist and is NEVER executed.
	 */
	dodGates?: string[];
	rawContent?: string;
	// Engine pipeline fields — set these when creating engine-managed child tasks
	pipeline_id?: string;
	phase?: string;
	parent_id?: string;
	/** Cross-pipeline derivation edge (BACK-603 603.2); see `Task.provenance`. */
	provenance?: { spawned_from: string };
}

export interface TaskUpdateInput {
	title?: string;
	description?: string;
	status?: TaskStatus;
	priority?: "high" | "medium" | "low";
	milestone?: string | null;
	labels?: string[];
	addLabels?: string[];
	removeLabels?: string[];
	assignee?: string[];
	ordinal?: number;
	dependencies?: string[];
	addDependencies?: string[];
	removeDependencies?: string[];
	references?: string[];
	addReferences?: string[];
	removeReferences?: string[];
	documentation?: string[];
	addDocumentation?: string[];
	removeDocumentation?: string[];
	modifiedFiles?: string[];
	implementationPlan?: string;
	appendImplementationPlan?: string[];
	clearImplementationPlan?: boolean;
	implementationNotes?: string;
	appendImplementationNotes?: string[];
	clearImplementationNotes?: boolean;
	appendComments?: Array<TaskCommentInput | string>;
	finalSummary?: string;
	appendFinalSummary?: string[];
	clearFinalSummary?: boolean;
	acceptanceCriteria?: AcceptanceCriterionInput[];
	addAcceptanceCriteria?: Array<AcceptanceCriterionInput | string>;
	removeAcceptanceCriteria?: number[];
	checkAcceptanceCriteria?: number[];
	uncheckAcceptanceCriteria?: number[];
	addDefinitionOfDone?: Array<AcceptanceCriterionInput | string>;
	removeDefinitionOfDone?: number[];
	checkDefinitionOfDone?: number[];
	uncheckDefinitionOfDone?: number[];
	rawContent?: string;
	// Engine pipeline fields (BACK-610) — symmetric with TaskCreateInput so
	// engine-managed fields are settable through the update path too.
	pipeline_id?: string;
	phase?: string;
	parent_id?: string;
	/** Cross-pipeline derivation edge (BACK-603 603.2); see `Task.provenance`. */
	provenance?: { spawned_from: string };
	/**
	 * Structured executable DoD gates (BACK-613), full-replace semantics
	 * (mirrors `TaskCreateInput.dodGates`; no add/remove variants).
	 */
	dodGates?: string[];
}

export interface TaskListFilter {
	status?: string;
	assignee?: string;
	priority?: "high" | "medium" | "low";
	milestone?: string;
	parentTaskId?: string;
	labels?: string[];
}

export interface Decision {
	id: string;
	title: string;
	date: string;
	status: "proposed" | "accepted" | "rejected" | "superseded";
	context: string;
	decision: string;
	consequences: string;
	alternatives?: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export interface Milestone {
	id: string;
	title: string;
	description: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export const DOCUMENT_TYPE_VALUES = ["readme", "guide", "specification", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPE_VALUES)[number];

export interface Document {
	id: string;
	title: string;
	type: DocumentType;
	createdDate: string;
	updatedDate?: string;
	rawContent: string; // Raw markdown content without frontmatter
	tags?: string[];
	// Web UI specific fields
	name?: string;
	path?: string;
	lastModified?: string;
}

export interface DocumentCreateInput {
	title: string;
	content?: string;
	type?: Document["type"];
	path?: string;
	tags?: string[];
}

export interface DocumentUpdateInput {
	id: string;
	content: string;
	title?: string;
	type?: Document["type"];
	path?: string | null;
	tags?: string[];
}

export type SearchResultType = "task" | "document" | "decision";

export type SearchPriorityFilter = "high" | "medium" | "low";

export interface SearchMatch {
	key?: string;
	indices: Array<[number, number]>;
	value?: unknown;
}

export interface SearchFilters {
	status?: string | string[];
	priority?: SearchPriorityFilter | SearchPriorityFilter[];
	assignee?: string | string[];
	labels?: string | string[];
	modifiedFiles?: string | string[];
	pipeline_id?: string | string[];
	phase?: string | string[];
}

export interface SearchOptions {
	query?: string;
	limit?: number;
	types?: SearchResultType[];
	filters?: SearchFilters;
}

export interface TaskSearchResult {
	type: "task";
	score: number | null;
	task: Task;
	matches?: SearchMatch[];
}

export interface DocumentSearchResult {
	type: "document";
	score: number | null;
	document: Document;
	matches?: SearchMatch[];
}

export interface DecisionSearchResult {
	type: "decision";
	score: number | null;
	decision: Decision;
	matches?: SearchMatch[];
}

export type SearchResult = TaskSearchResult | DocumentSearchResult | DecisionSearchResult;

export interface Sequence {
	/** 1-based sequence index */
	index: number;
	/** Tasks that can be executed in parallel within this sequence */
	tasks: Task[];
}

/**
 * Configuration for ID prefixes used in task files.
 * Allows customization of task prefix (e.g., "JIRA-", "issue-", "bug-").
 * Note: Draft prefix is always "draft" and not configurable.
 */
export interface PrefixConfig {
	/** Prefix for task IDs (default: "task") - produces IDs like TASK-1, TASK-2 */
	task: string;
}

/**
 * A manually-triggered task action button (BACK-695). Defined in config by a project
 * maintainer; the Web UI shows a button per task that matches `whenStatus` (or always,
 * when `whenStatus` is omitted) and dispatches `POST /api/tasks/:id/actions/:id` by id only
 * — the command string itself never crosses the network.
 */
export interface TaskAction {
	/** Stable identifier referenced by the Web UI and the actions API route. */
	id: string;
	/** Button label shown in the Web UI. */
	label: string;
	/** Shell command run on the server. Supports $TASK_ID/$TASK_TITLE/$TASK_STATUS variables (see onStatusChange). */
	command: string;
	/** Optional status whitelist; button is shown on every task when omitted. */
	whenStatus?: string[];
}

export interface BacklogConfig {
	projectName: string;
	defaultAssignee?: string;
	defaultReporter?: string;
	statuses: string[];
	labels: string[];
	/** @deprecated Milestones are sourced from milestone files, not config. */
	milestones?: string[];
	definitionOfDone?: string[];
	defaultStatus?: string;
	dateFormat: string;
	maxColumnWidth?: number;
	taskResolutionStrategy?: "most_recent" | "most_progressed";
	defaultEditor?: string;
	autoOpenBrowser?: boolean;
	defaultPort?: number;
	remoteOperations?: boolean;
	autoCommit?: boolean;
	/** Disable all Git integration for filesystem-only projects. */
	filesystemOnly?: boolean;
	zeroPaddedIds?: number;
	includeDateTimeInDates?: boolean; // Whether to include time in new dates
	bypassGitHooks?: boolean;
	checkActiveBranches?: boolean; // Check task states across active branches (default: true)
	activeBranchDays?: number; // How many days a branch is considered active (default: 30)
	/** Project-relative backlog folder when config is stored at project root in backlog.config.yml. */
	backlogDirectory?: string;
	/** Global callback command to run on any task status change. Supports $TASK_ID, $OLD_STATUS, $NEW_STATUS, $TASK_TITLE variables. */
	onStatusChange?: string;
	/**
	 * Manually-triggered task action buttons shown in the Web UI (BACK-695). Each command is a
	 * fire-and-forget dispatch (e.g. `manda-dispatch submit`); it must not synchronously run a
	 * long task, since it executes on the web server process. Supports the same $TASK_ID/
	 * $TASK_TITLE/$TASK_STATUS variables as onStatusChange.
	 */
	taskActions?: TaskAction[];
	/** Shared-secret bearer token gating the web server's task API (issue-list + kanban board routes). Unset = no auth. */
	webAuthToken?: string;
	/** ID prefix configuration for tasks and drafts. Defaults to { task: "task", draft: "draft" } */
	prefixes?: PrefixConfig;
	mcp?: {
		http?: {
			host?: string;
			port?: number;
			auth?: {
				type?: "bearer" | "basic" | "none";
				token?: string;
				username?: string;
				password?: string;
			};
			cors?: {
				origin?: string | string[];
				credentials?: boolean;
			};
			enableDnsRebindingProtection?: boolean;
			allowedHosts?: string[];
			allowedOrigins?: string[];
		};
	};
}

export interface ParsedMarkdown {
	frontmatter: Record<string, unknown>;
	content: string;
}
