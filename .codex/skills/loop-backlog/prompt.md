# loop-backlog skill (soak-period fallback)

This skill is retained as the **soak-period fallback** for the epicd self-driving engine (ADR-010).
It arms the legacy autonomous backlog worker: one persistent Monitor running scan-loop.js.
Each stdout line it emits is a self-contained dispatch instruction the worker follows verbatim.

## Usage
Invoke once per session to start the loop. Stop by running: `touch backlog/.loop-stop`

## Status
- Kept present as a fallback while the real engine (BACK-600 E0) completes its soak period.
- The new engine (src/engine/) takes over primary dispatch; this skill remains as emergency rollback.
- Do NOT delete until M1 milestone is declared and soak period ends.

## Cross-mechanism safety
The legacy loop's `.merge-lock` and the new engine's merge lock use the same filesystem path
(`<backlogDir>/.merge-lock`) for mutual exclusion. See ADR-010 INV-11 (PRESERVED) and
`src/test/engine-safety-cross-mechanism-lock.test.ts`.
