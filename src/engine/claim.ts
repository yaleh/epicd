/**
 * STUB (BACK-686.2, Phase C / AC#7): child A (BACK-686.1) owns the real claim
 * hardening module — this file is a minimal placeholder exposing exactly the
 * interface BACK-686.2's fresh-context gate test needs: a `puller` field on a
 * claim record, and a `readClaim(taskId)` accessor. When BACK-686.1 merges its
 * real `src/engine/claim.ts`, this stub must be reconciled/replaced with it —
 * the fresh-context comparison in `src/engine/adjudicate-gate.ts` is written
 * against this interface shape, not against any particular storage mechanism,
 * so the reconciliation should only touch this file plus the merge conflict it
 * produces (not the gate's own logic).
 */

/** Minimal claim-record shape: which puller identity claimed `taskId` for implementation. */
export interface ClaimRecord {
	taskId: string;
	puller: string;
}

const stubClaims = new Map<string, ClaimRecord>();

/**
 * Read the claim record for `taskId`, or `undefined` if none is on record.
 * STUB: backed by an in-process Map, not the real persisted claim store child A
 * will implement (e.g. `.caps/<id>.claim.json` or similar) — reconcile on merge.
 */
export function readClaim(taskId: string): ClaimRecord | undefined {
	return stubClaims.get(taskId);
}

/** Test/stub-only helper until child A lands a real claim writer. Do not use outside tests. */
export function __stubSetClaim(record: ClaimRecord): void {
	stubClaims.set(record.taskId, record);
}

/** Test/stub-only helper to reset state between tests. */
export function __stubClearClaims(): void {
	stubClaims.clear();
}
