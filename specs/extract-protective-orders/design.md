# Design — CHANGE split-5: extract the protective-order / profit-floor helpers and the two stop-retry helpers (pure move, no behaviour change)

## Architecture Decision

Move 5 of the `claude-agent.ts` split. The protective-order helpers (cancel the registered stop, submit a replacement, apply the MEAN_REVERSION profit floor) and the two stop-submit retry helpers form one cohesive unit: `replaceProtectiveOrder` calls both retry helpers, and `applyProfitFloor` calls `replaceProtectiveOrder`. Their only outside inputs are `./alpaca`, `./db` and `./protective-stop` (already separate modules), so they move together to `src/lib/protective-orders.ts` with no import from `claude-agent.ts`. The callers (`enforceExitRules`, the two BUY paths of `runAgentCycle`) stay in `claude-agent.ts`.

## What moves (HEAD `dc3c544`)

| Item | Lines | Becomes |
|------|-------|---------|
| "PROTECTIVE ORDER HELPERS" banner | `:441-444` | moves with the code |
| `ProtectiveOrderParams`, `ReplaceOrderParams`, `ReplaceOutcome` | `:446-461` | `export` |
| `logNakedStopAlert`, `cancelRegisteredStop` | `:463-485` | private |
| `replaceProtectiveOrder` | `:487-520` | `export` |
| `ProfitFloorParams`, `ProfitFloorOutcome` | `:522-531` | `export` |
| `logContextPersistError`, `persistProtectiveStopSnapshot` | `:533-555` | private |
| `resolveEntryPrice` | `:557-560` | `export` |
| `handleFloorSellNow` | `:562-574` | private |
| `applyProfitFloor` | `:576-618` | `export` |
| Retry header comment + `submitStopWithRetry` + `submitStopLimitWithRetry` | `:729-782` | already `export` |

Stay: `STOP_SUBMIT_FAILED` and `IOC_*` (`:719-727`), `resolveIocFinalState` (`:788`), `executeIocWithRemainderRetry` (`:851`). Exact boundaries are re-read at implementation.

## Dependency audit (STEP 0)

| Name | Use in the moved code | Use left in `claude-agent.ts` | Result |
|------|----------------------|-------------------------------|--------|
| `cancelOrder` | `cancelRegisteredStop` | `:818` (`resolveIocFinalState`) | import stays in both |
| `submitStopOrder`, `submitStopLimitOrder` | retry helpers | none | removed from `claude-agent.ts` |
| `updatePositionProtectiveStop` | `persistProtectiveStopSnapshot` | none | removed |
| `computeProtectiveStop`, `buildProtectiveStopSnapshot` | `applyProfitFloor`, snapshot | none | removed |
| `updatePositionContext` | several | `:297`, `:351` | stays in both |
| `insertAgentLogEntry`, `randomUUID` | `logNakedStopAlert` | many | stay in both |
| `getProfitFloorSettings`, `roundDownToTick`, `isHigherByTick` | none | `:265`, `:321`, `:331` | stay |
| `submitStopWithRetry` | — | `:137`, `:2084`, `:2277` | imported + re-exported |
| `applyProfitFloor`, `replaceProtectiveOrder`, `resolveEntryPrice` | — | `:282`, `:336`, `:272` | imported |
| `submitStopLimitWithRetry` | — | none | not imported, not re-exported |

`tsc`/ESLint are the final judge of which imports become unused; any other name found is listed in the report.

## Edits to claude-agent.ts (and only these)

1. Delete the banner block `:441-618` and its trailing blank line.
2. Delete the retry header comment and both retry functions (`:729-782`) and the trailing blank line.
3. Add `import { applyProfitFloor, replaceProtectiveOrder, resolveEntryPrice, submitStopWithRetry } from './protective-orders'` after the `./signal-rotation` import.
4. Add `export { submitStopWithRetry }` (one line, right after the import block).
5. Remove the five unused import names.

An EOL-aware script writes CRLF.

## Tests (new)

`src/lib/__tests__/protective-orders.test.ts` (LF), written before the module (RED), after a throwaway script records the current behaviour. `vi.hoisted` mocks for `../alpaca` and `../db`; `../protective-stop` stays real. Cases: `submitStopLimitWithRetry` (first-attempt success; one failure then success with 3000 ms via fake timers; double failure with `failureReason` and warn/error texts) and `replaceProtectiveOrder` (`ctx.quantity` 0 → `skipped`; cancel-then-submit order). Existing coverage: goldens (u)(v)(w1)(w2)(x1)(x2)(ai)(ak) pin the texts and call order; `ioc-fill-verification.test.ts` covers `submitStopWithRetry` through the re-export; `mr-profit-floor-exit-rules.test.ts` covers the floor; `orphaned-position-reconciliation.test.ts` runs the retry through `enforceExitRules`.

## Registration (authorized)

| File | EOL | Edit |
|------|-----|------|
| `.github/workflows/pr-review.yml` | LF | `"src/lib/protective-orders.ts"` after `"src/lib/macro-bars-staleness.ts"` (`:85`), same indent |
| `vitest.config.ts` | LF | `'src/lib/protective-orders.ts'` appended to `coverage.include` (`:19`) |
| `CLAUDE.md` | CRLF | File Structure row after `signal-rotation.ts` (`:89`); "Confirm with Amaury" row after `signal-rotation.ts` (`:228`) |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One module for helpers and retry helpers | `replaceProtectiveOrder` needs both; no cycle | Module of about 230 lines | Chosen |
| Separate `stop-retry.ts` | Finer split | Extra file and registration | Rejected |
| Re-export both retry helpers | Symmetric | `submitStopLimitWithRetry` has no outside user | Rejected |
| Move IOC constants too | One home for stop code | Not authorized; `STOP_SUBMIT_FAILED` is exported API | Rejected |
| Unify the two retry helpers | Removes duplication | Not a pure move | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/protective-orders.ts` | CREATE | Moved code; LF |
| `src/lib/claude-agent.ts` | MODIFY | Two block deletions, import changes, one re-export; CRLF; Protected Zone, authorized |
| `src/lib/__tests__/protective-orders.test.ts` | CREATE | Direct tests (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | One line |
| `vitest.config.ts` | MODIFY | One entry |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `specs/extract-protective-orders/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `config.ts`, `protective-stop.ts`, the three existing tests, `specs/docs-5-selector-criteria/tasks.md`.

## Risks

- This code places and cancels live stop orders; a wrong move can leave a position unprotected. Mitigation: byte copy, byte comparison against HEAD, and the eight goldens that pin texts and order.
- `claude-agent.ts` is CRLF (2396 lines). Mitigation: EOL-aware script and CR-count check.
- Module mocking: tests mock `../alpaca` and `../db`; the new module imports the same specifiers, so the mocks keep applying. Verified by the full suite and the characterization run.
- `export { submitStopWithRetry }` needs the name imported in the same file; both lines are added.
- Documents citing moved lines: many `specs/**` reviews mention these helpers; the search for line citations is repeated at the end and listed, not fixed.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-17 to FR-25). The request states the owner authorization for this change only; it also authorizes the `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` edits. No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (authorization name):** the request names "Jorge"; the project owner is Amaury. Same treatment as split-4: treated as the owner's authorization. Confirm.
- **Q-2 (re-export form):** `export { submitStopWithRetry }` next to the import, rather than `export { ... } from './protective-orders'` (which would not bring the name into local scope for `:137`, `:2084`, `:2277`). Confirm.
- **Q-3 (test mocks):** `../protective-stop` stays real in the new test (pure module); only `../alpaca` and `../db` are mocked. Confirm.
- **Q-4 (YAML check):** if no YAML parser is available locally, use a Node parser or report as not verified.
