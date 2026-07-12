import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Bun defect: passing the literal boolean `development: false` to Bun.serve
 * (as opposed to omitting the key or passing `true`) silently allows a second
 * process/call to bind the same port with no EADDRINUSE. `reusePort: false`
 * restores the expected single-bind behavior. src/server/index.ts computes
 * `development: process.env.NODE_ENV === "development"`, which evaluates to
 * the literal `false` in normal CLI usage -- hitting this defect.
 */
describe("Bun.serve dual-bind defect (development: false)", () => {
	let serverA: ReturnType<typeof Bun.serve> | null = null;
	let serverB: ReturnType<typeof Bun.serve> | null = null;

	afterEach(() => {
		serverA?.stop(true);
		serverB?.stop(true);
		serverA = null;
		serverB = null;
	});

	it("rejects a second bind on the same port when reusePort: false is set alongside development: false", () => {
		serverA = Bun.serve({ port: 0, development: false, reusePort: false, fetch: () => new Response("ok") });
		const port = serverA.port;

		expect(() => {
			serverB = Bun.serve({ port, development: false, reusePort: false, fetch: () => new Response("ok") });
		}).toThrow();
	});

	it("documents the defect: without reusePort: false, development: false alone allows a second bind", () => {
		serverA = Bun.serve({ port: 0, development: false, fetch: () => new Response("ok") });
		const port = serverA.port;

		serverB = Bun.serve({ port, development: false, fetch: () => new Response("ok") });
		expect(serverB.port).toBe(port);
	});

	it("src/server/index.ts sets reusePort: false in its Bun.serve options", () => {
		const source = readFileSync(new URL("../server/index.ts", import.meta.url), "utf-8");
		expect(source).toMatch(/reusePort:\s*false/);
	});
});
