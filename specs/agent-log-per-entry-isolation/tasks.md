# Tasks — Per-entry error isolation in appendAgentLogEntries()

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, no Protected Zone files touched
- [x] Database migrations drafted — N/A, no DB changes

## Implementation Checklist

### Phase 1 — Data Layer (src/lib/agent-log.ts)
- [x] T-01: Replace `appendAgentLogEntries()` (lines 8–12) with the per-entry isolated version: `try/catch` around each `insertAgentLogEntry(entry)` call, `succeeded`/`failed` counters, `[AGENT_LOG_INSERT_FAILED]` log per failure (symbol, action, reasoning-if-SELL, cause), `[AGENT_LOG_BATCH_PARTIAL]` summary log only when `failed > 0`.
- [x] T-02: Confirm `insertAgentLogEntry()` in `db.ts` is left untouched (still throws on error).

### Phase 2 — Testing
- [x] T-03: Create `src/lib/__tests__/agent-log.test.ts` following the `ioc-fill-verification.test.ts` pattern — `vi.hoisted` mock of `insertAgentLogEntry` from `../db`, calling the real `appendAgentLogEntries`.
- [x] T-04: Test — all entries succeed: every entry attempted, no `[AGENT_LOG_BATCH_PARTIAL]` log, function resolves.
- [x] T-05: Test — one entry (not the last) throws: subsequent entries are still attempted (assert `insertAgentLogEntry` called once per entry, in order).
- [x] T-06: Test — one or more entries fail: `appendAgentLogEntries()` still resolves (does not reject).
- [x] T-07: Test — failure log content includes the failing entry's symbol, decision action, and the underlying error message.
- [x] T-08: Test — `[AGENT_LOG_BATCH_PARTIAL]` fires exactly once per call when `failed > 0`, with correct succeeded/failed/total counts.
- [x] T-09: Run `npx tsc --noEmit` — must pass.
- [x] T-10: Run `npm run build` — must pass.
- [x] T-11: Run the full existing test suite (or at minimum every file under `src/lib/__tests__/`) and confirm no regressions — report which files were run.
- [x] T-12: Report the final line count of `agent-log.ts`.

## Post-Implementation

- [x] Run `/review` against this spec to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (git diff shows only `agent-log.ts` and the new test file)

## Estimated Complexity

Low — a ~15-line change to one non-Protected-Zone file, fully specified down to the exact code in the originating FIX/PROMPT, plus one new test file following an established mocking pattern already used elsewhere in the repo.
