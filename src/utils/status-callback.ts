import { spawn } from "bun";

export interface StatusCallbackOptions {
	command: string;
	taskId: string;
	oldStatus: string;
	newStatus: string;
	taskTitle: string;
	cwd: string;
}

export interface StatusCallbackResult {
	success: boolean;
	output?: string;
	error?: string;
	exitCode?: number;
}

/**
 * Runs a shell command with variables injected as environment variables, capturing
 * stdout/stderr. Shared by the onStatusChange callback and the BACK-695 task-action
 * executor - both are "config-defined command + task variables" spawns that only differ
 * in which variables they inject.
 */
async function runCallbackCommand(command: string, cwd: string, env: Record<string, string | undefined>) {
	if (!command || command.trim().length === 0) {
		return { success: false, error: "Empty command" } satisfies StatusCallbackResult;
	}

	try {
		const proc = spawn({
			cmd: ["sh", "-c", command],
			cwd,
			env: { ...process.env, ...env },
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

		const exitCode = await proc.exited;
		const success = exitCode === 0;

		const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

		return {
			success,
			output: output || undefined,
			exitCode,
			...(stderr.trim() && !success && { error: stderr.trim() }),
		} satisfies StatusCallbackResult;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		} satisfies StatusCallbackResult;
	}
}

/**
 * Executes a status change callback command with variable injection.
 * Variables are passed as environment variables to the shell command.
 *
 * @param options - The callback options including command and task details
 * @returns The result of the callback execution
 */
export async function executeStatusCallback(options: StatusCallbackOptions): Promise<StatusCallbackResult> {
	const { command, taskId, oldStatus, newStatus, taskTitle, cwd } = options;

	return runCallbackCommand(command, cwd, {
		TASK_ID: taskId,
		OLD_STATUS: oldStatus,
		NEW_STATUS: newStatus,
		TASK_TITLE: taskTitle,
	});
}

export interface TaskActionCommandOptions {
	command: string;
	taskId: string;
	taskTitle: string;
	taskStatus: string;
	cwd: string;
}

/**
 * Executes a BACK-695 task-action command with $TASK_ID/$TASK_TITLE/$TASK_STATUS injected as
 * environment variables - the same variable-injection pattern as executeStatusCallback, applied
 * to a manually-triggered (rather than status-change-triggered) command.
 */
export async function executeTaskActionCommand(options: TaskActionCommandOptions): Promise<StatusCallbackResult> {
	const { command, taskId, taskTitle, taskStatus, cwd } = options;

	return runCallbackCommand(command, cwd, {
		TASK_ID: taskId,
		TASK_TITLE: taskTitle,
		TASK_STATUS: taskStatus,
	});
}
