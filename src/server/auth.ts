/**
 * Minimal shared-secret auth guard for the web server's task API (BACK-647).
 *
 * Greenfield: no auth previously existed anywhere in src/web/src/server/src/engine.
 * Deliberately kept to a single check - no sessions, no login UI, no user store.
 * Disabled by default (no config.webAuthToken set) so existing installs are unaffected;
 * once a token is configured via `backlog config set webAuthToken <token>`, requests to
 * the guarded routes must send it as `Authorization: Bearer <token>` (a bare token value
 * is also accepted for convenience).
 */

import { timingSafeEqual } from "node:crypto";

const AUTH_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

function tokensMatch(provided: string, expected: string): boolean {
	const providedBuf = Buffer.from(provided);
	const expectedBuf = Buffer.from(expected);
	if (providedBuf.length !== expectedBuf.length) {
		return false;
	}
	return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Returns a 401 Response when a token is configured and the request doesn't present it,
 * or `null` when the request may proceed (no token configured, or the token matches).
 */
export function checkBearerAuth(req: Request, expectedToken: string | undefined): Response | null {
	if (!expectedToken) {
		return null;
	}

	const header = req.headers.get(AUTH_HEADER) ?? "";
	const provided = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : header;

	if (tokensMatch(provided, expectedToken)) {
		return null;
	}

	return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}
