import { describe, expect, it } from "bun:test";
import { checkBearerAuth } from "./auth.ts";

const makeRequest = (headers: Record<string, string> = {}): Request =>
	new Request("http://localhost/api/tasks", { headers });

describe("checkBearerAuth", () => {
	it("allows any request when no token is configured", () => {
		expect(checkBearerAuth(makeRequest(), undefined)).toBeNull();
		expect(checkBearerAuth(makeRequest({ authorization: "Bearer wrong" }), undefined)).toBeNull();
	});

	it("rejects requests missing the Authorization header when a token is configured", async () => {
		const result = checkBearerAuth(makeRequest(), "secret-token");
		expect(result).not.toBeNull();
		expect(result?.status).toBe(401);
		const body = (await result?.json()) as { error?: string };
		expect(body.error).toBe("Unauthorized");
	});

	it("rejects requests with a mismatched token", () => {
		const result = checkBearerAuth(makeRequest({ authorization: "Bearer nope" }), "secret-token");
		expect(result?.status).toBe(401);
	});

	it("allows requests with the correct 'Bearer <token>' Authorization header", () => {
		expect(checkBearerAuth(makeRequest({ authorization: "Bearer secret-token" }), "secret-token")).toBeNull();
	});

	it("also accepts a bare token value without the Bearer prefix", () => {
		expect(checkBearerAuth(makeRequest({ authorization: "secret-token" }), "secret-token")).toBeNull();
	});
});
