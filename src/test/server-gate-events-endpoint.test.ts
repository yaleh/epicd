/**
 * BACK-605.10 — read-only `/api/gate-events` REST endpoint.
 *
 * The endpoint must be a thin forwarder onto the same `runGateLogQuery`
 * (src/engine/gate-log.ts) used by `engine gate-log` and the `inbox`
 * operation skill (BACK-605.9) — this test only exercises the HTTP surface
 * and its filters, not a re-implemented query.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { appendGateEvent, type GateEvent } from "../core/gate-event-store.ts";
import { DEFAULT_GATE_LOG_RELATIVE_PATH } from "../engine/gate-log.ts";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let server: BacklogServer | null = null;
let serverPort = 0;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`http://127.0.0.1:${serverPort}${path}`, init);
	if (!response.ok) {
		throw new Error(`${response.status}: ${await response.text()}`);
	}
	return response.json();
}

function makeEvent(overrides: Partial<GateEvent> = {}): GateEvent {
	return {
		id: "evt-1",
		item_id: "BACK-605.10",
		pipeline_id: "pipeline-a",
		gate: "gate-1",
		actor: "actor-a",
		verdict: "pass",
		timestamp: "2026-07-05T00:00:00.000Z",
		payload: { note: "hello" },
		...overrides,
	};
}

describe("BacklogServer /api/gate-events", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-gate-events");
		const filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server Gate Events",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});

		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort();
		expect(port).not.toBeNull();
		serverPort = port ?? 0;

		await retry(async () => {
			await fetchJson<unknown[]>("/api/gate-events");
		});
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("returns an empty list when no gate-event log exists yet", async () => {
		const events = await fetchJson<GateEvent[]>("/api/gate-events");
		expect(events).toEqual([]);
	});

	it("returns appended events and applies pipeline/gate/actor/since filters", async () => {
		const path = `${TEST_DIR}/${DEFAULT_GATE_LOG_RELATIVE_PATH}`;
		appendGateEvent(path, makeEvent({ id: "a", pipeline_id: "pipeline-a", gate: "gate-1", actor: "actor-a" }));
		appendGateEvent(
			path,
			makeEvent({
				id: "b",
				pipeline_id: "pipeline-b",
				gate: "gate-2",
				actor: "actor-b",
				timestamp: "2026-07-06T00:00:00.000Z",
			}),
		);

		const all = await fetchJson<GateEvent[]>("/api/gate-events");
		expect(all.map((e) => e.id).sort()).toEqual(["a", "b"]);

		const byPipeline = await fetchJson<GateEvent[]>("/api/gate-events?pipelineId=pipeline-a");
		expect(byPipeline.map((e) => e.id)).toEqual(["a"]);

		const byGate = await fetchJson<GateEvent[]>("/api/gate-events?gate=gate-2");
		expect(byGate.map((e) => e.id)).toEqual(["b"]);

		const byActor = await fetchJson<GateEvent[]>("/api/gate-events?actor=actor-b");
		expect(byActor.map((e) => e.id)).toEqual(["b"]);

		const bySince = await fetchJson<GateEvent[]>("/api/gate-events?since=2026-07-06T00:00:00.000Z");
		expect(bySince.map((e) => e.id)).toEqual(["b"]);
	});
});
