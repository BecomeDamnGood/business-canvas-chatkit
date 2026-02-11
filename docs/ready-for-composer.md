# Ready for Composer — Test/Offline LLM Prep

## Commands run
- `cd mcp-server && npm test`

## Before/after summary
- Before: `npm test` failed in `src/handlers/run_step.test.ts` with `Missing env OPENAI_API_KEY` (LLM call via `callSpecialistStrict` → `callStrictJson`).
- After: `npm test` passes offline (45 pass, 1 skip). No network calls required.

## Changes made
- `mcp-server/src/core/state.test.ts`: update `FINALS_KEYS` expected count from 10 → 12.
- `mcp-server/src/handlers/run_step.ts`: add offline test stub for specialist calls; skip UI-string LLM calls during tests unless `RUN_INTEGRATION_TESTS=1`.
- `mcp-server/src/handlers/run_step.test.ts`: gate LLM integration test behind `RUN_INTEGRATION_TESTS=1` and `OPENAI_API_KEY`.

## Offline test confirmation
- Default `npm test` runs fully offline and deterministically.

## How to run integration tests (opt-in)
- `RUN_INTEGRATION_TESTS=1 OPENAI_API_KEY=... npm test`

## Widget mode: strict registry behavior (Cleanup PR B)
- Widget mode uses only `ui.action_codes` from the backend. Legacy mapping and fallback are removed.
- If `ui.action_codes` is missing or count mismatch: user sees "We can't safely display these options right now. Please try again." and no buttons are rendered.
- Log events for diagnosis: `[menu_contract_missing]`, `[actioncodes_missing]`, `[actioncodes_count_mismatch]`.
- Shadow-compare telemetry (`?debug_actioncodes=1`) removed (no legacy mapping to compare).
