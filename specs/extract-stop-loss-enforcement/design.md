# Design — CHANGE split-8: extract enforceStopLosses (Capa B) from claude-agent.ts (pure move, no behaviour change)

## Architecture Decision

Move 8 of the `claude-agent.ts` split. `enforceStopLosses` is the manual stop-loss safety net (Capa B): at the start of each cycle it cross-checks every open position context against the current Alpaca price and closes any position at or below `buyPrice * (1 - STOP_LOSS_PCT)`, then persists a same-day-style `STOP_LOSS` cooldown. It takes its inputs as arguments (`positions`, `nextTradingDay3`), keeps no module state, uses no local helper of `claude-agent.ts` and has a single call site. It moves to `src/lib/stop-loss-enforcement.ts` with three runtime imports (`./alpaca`, `./db`, `./db-cooldowns`) and one type import (`./types`), all with the specifiers `claude-agent.ts` already uses, so the harness mocks keep applying. Capa A (the Alpaca GTC stop order) is not part of this block.

## What moves (HEAD `9bac6d1`, code identical to `f25c193`)

| Item | Lines | Becomes |
|------|-------|---------|
| Banner "STOP LOSS ENFORCEMENT (Capa B — manual safety check each cycle)" | `:447-449` | moves with the code |
| Blank line between banner and function | `:450` | moves with the code |
| `enforceStopLosses(positions, nextTradingDay3)` | `:451-486` | `export` |
| Blank line after the function | `:487` | deleted, not copied |

Delete range in `claude-agent.ts`: `:447-487`. Stays: `checkOvertradingLimit` (`:442-445`) with its banner (`:438-440`), and `COOLDOWN_UNKNOWN_EXIT_REASON` (`:488-490`). After the delete, `COOLDOWN_UNKNOWN_EXIT_REASON` starts at `:447`. The call site is `:644` and stays (it shifts by the lines removed, plus one for the new import).

## Dependency audit

| Name | Use in the moved code | Use left in `claude-agent.ts` | Result |
|------|----------------------|-------------------------------|--------|
| `closePosition` (`./alpaca`) | `:473` | `:389`, `:1034` | import stays; new module imports it |
| `getAllOpenPositionContexts` (`./db`) | `:454` | `:725`, `:1610` | import stays; new module imports it |
| `upsertSymbolCooldown` (`./db-cooldowns`) | `:475` | `:747`, `:840`, `:862` | import stays; new module imports it |
| `AlpacaPosition` (`./types`) | parameter type | many | import stays; new module gets `import type` |
| `console.*`, `parseFloat`, `process.env`, `Date` | runtime globals | many | none to import |
| `./agent-log`, `./exit-cooldown`, `./protective-orders`, `cancelOrder` | not used | — | not imported |

No import becomes unused in `claude-agent.ts` (checked at STEP 0; confirmed by `tsc` and ESLint at implementation). No importer outside `claude-agent.ts` exists, so no re-export is added. No import cycle: the new module imports only low-level modules that do not import `claude-agent.ts`.

## Edits to claude-agent.ts (and only these)

1. Delete `:447-487`.
2. Add `import { enforceStopLosses } from './stop-loss-enforcement'` after the `./claude-call` import (`:28`), so it lands at `:29`, before `./agent-log`.

An EOL-aware script writes CRLF.

## Observation (to be filled at implementation, before any expected value)

Run the current code first. Use `runAgentCycle` through the harness where it can provoke the case (the harness has `contextReadFailures`, a way to fail `closePosition`, and the cooldown mocks); where it cannot (for example the cooldown mock throwing, `nextTradingDay3 === null` if `getNextTradingDay` cannot be made to fail, or `STOP_LOSS_PCT` unset), run a disposable copy of the current function text and say so in this table. Reading the code gives the expected shape; the values are recorded from the run, not from the reading.

| Case | Code reference | To record | Read from the code (to be confirmed by the run) |
|------|----------------|-----------|---------------|
| a. Boundary | `:468` | price equal to `buyPrice * (1 - STOP_LOSS_PCT)` (same expression); price one cent above | fires on equal (`<=`); does not fire one cent above |
| b. `nextTradingDay3 === null` | `:472` | closes, `upsertSymbolCooldown` not called, exact console output | one `warn`, no `[COOLDOWN_PERSIST]` log |
| c. Cooldown throws after close | `:473-482` | exact `console.error` text, `closePosition` call count | `Failed to close <SYMBOL>:` with the error; `closePosition` called once |
| d. `STOP_LOSS_PCT` undefined | `:452` | fallback 0.05 with a price just under and just over the stop | fires under, does not fire over |
| e. `[COOLDOWN_PERSIST]` text | `:475-480` | exact line with a cooldown date | `[COOLDOWN_PERSIST] symbol=<S> reason=STOP_LOSS until=<ISO> source=enforceStopLosses` |

Observed values (2026-11-19, HEAD `9bac6d1`, code identical to `f25c193`). Cases a and d through `runAgentCycle` with the harness (a held position with `buyPrice` 100, `STOP_LOSS_PCT` 0.05 from the harness env; for d the variable deleted after `world.reset`); cases b, c and e through a disposable copy of the current function text (`:451-486`) with the three modules mocked, because the harness cannot make `getNextTradingDay` return null or make the cooldown mock throw (Q-2); case e was also seen through the harness. Both disposable files were deleted.

| Case | Observed |
|------|----------|
| a. Boundary | The stop expression `100 * (1 - 0.05)` is exactly `95`. Price `"95"` (equal): fires. 1 `closePosition`, one cooldown `STOP_LOSS` until `2026-11-09T00:00:00.000Z`, warn `[enforceStopLosses] Stop triggered: HLD @ $95.00 <= stop $95.00`. Price `"95.01"` (one cent above): no `closePosition`, no cooldown, no warn, log or error from the function |
| b. `nextTradingDay3 === null` (copy), price 94 | 1 `closePosition('HLD')`, no `upsertSymbolCooldown`; console: exactly one warn `[enforceStopLosses] Stop triggered: HLD @ $94.00 <= stop $95.00`; no log, no error |
| c. Cooldown throws after the close (copy) | 1 `closePosition`, 1 `upsertSymbolCooldown('HLD', 'STOP_LOSS', 2026-11-09T00:00:00.000Z)` that throws; console: the same warn, no `[COOLDOWN_PERSIST]` log, one error: `[enforceStopLosses] Failed to close HLD:` followed by the Error object (message `cooldown boom`) |
| d. `STOP_LOSS_PCT` unset (harness) | Price `"94.99"`: fires (warn `... @ $94.99 <= stop $95.00`, 1 close, cooldown written). Price `"95.01"`: does not fire. Price `"95"`: fires. So the fallback gives the same 5% stop |
| e. `[COOLDOWN_PERSIST]` text | `[COOLDOWN_PERSIST] symbol=HLD reason=STOP_LOSS until=2026-11-09T00:00:00.000Z source=enforceStopLosses`, a single `console.log` argument (the string is built from four concatenated literals), printed after the cooldown call |
| Extra. `positions` array | Unchanged after the call (JSON-identical) |

The harness cannot tell the fallback from an explicit `0.05`; the new unit test distinguishes them by stubbing `STOP_LOSS_PCT` to another value in a sibling case.

## Tests (new)

`src/lib/__tests__/stop-loss-enforcement.test.ts` (LF), written before the module (RED). `vi.hoisted` + `vi.mock` for `../alpaca`, `../db` and `../db-cooldowns`; `vi.stubEnv` and `vi.unstubAllEnvs` for `STOP_LOSS_PCT`; `console.warn`, `console.error` and `console.log` spied; everything restored in `afterEach`. Cases: a to e, fired stop with cooldown (order of the two calls), `closePosition` failing, position missing in Alpaca, not fired, first context read failing, `positions` not mutated. Existing coverage stays untouched: goldens (z3), (an-1) and (an-2) pin the main Capa B paths through `runAgentCycle`; STEP 0 measured 20/20 statements and 6/8 branches for the block from any existing test (gaps: the `?? '0.05'` fallback and `nextTradingDay3 === null`).

## Registration (authorized)

| File | EOL | Edit |
|------|-----|------|
| `.github/workflows/pr-review.yml` | LF | `"src/lib/stop-loss-enforcement.ts"` after `"src/lib/claude-call.ts"` (`:88`), same indent; add the comma to the previous entry if needed |
| `vitest.config.ts` | LF | `'src/lib/stop-loss-enforcement.ts'` appended to `coverage.include` (`:19`) |
| `CLAUDE.md` | CRLF | File Structure row after `:92` and "Confirm with Amaury" row after `:234`; reason "Closes positions and writes the stop-loss cooldown when price falls through the -5% stop — an error can leave a losing position open or re-enterable" |

## Order of calls

`enforceStopLosses` runs in `runAgentCycle` at `:644`: after the daily briefing (`:556`) and the dynamic selection (`:582`), after the market-closed early return (`:614-617`, which only returns when the market is closed and there are no positions) and after the `cooldownDates` calculation (`:628-641`); before the macro news (`:647`), `enforceExitRules` (`:726`), the ghost-close handler (`:768`) and the per-symbol loop. The move changes none of that order.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `stop-loss-enforcement.ts` with only `enforceStopLosses` | Matches the content; the name states what it does; mocks keep applying | One small module | Chosen |
| Merge into `protective-orders.ts` | Fewer files | Capa B closes positions and writes cooldowns; `protective-orders.ts` replaces stop orders; mixes two responsibilities and enlarges a Protected Zone file | Rejected |
| Leave in `claude-agent.ts` | No edit to the Protected Zone file | The file stays 36 lines longer; no direct tests | Rejected (owner asked for the move) |
| Re-export from `claude-agent.ts` | Safety for importers | There are none | Rejected |
| Fix the single `catch` label or the null-date branch while moving | Better logs | Not a pure move; changes a text or behaviour | Rejected (listed as observations) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stop-loss-enforcement.ts` | CREATE | Moved code; LF |
| `src/lib/claude-agent.ts` | MODIFY | One block deletion and one import line; CRLF; Protected Zone, authorized |
| `src/lib/__tests__/stop-loss-enforcement.test.ts` | CREATE | Direct tests (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | One line |
| `vitest.config.ts` | MODIFY | One entry |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `specs/extract-stop-loss-enforcement/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, every other production file, existing tests, `SDD.md`, `specs/docs-5-selector-criteria/tasks.md`.

## Risks

- A live-capital path: Capa B closes losing positions. A text or order change would alter what is logged or persisted. Mitigation: byte comparison, three goldens that pin it, and new direct tests asserting the order of `closePosition` and `upsertSymbolCooldown`.
- Mock paths: the new module must import with the same specifiers (`./alpaca`, `./db`, `./db-cooldowns`) or the harness mocks would not apply. Mitigation: FR-13 and the unchanged goldens.
- The test mocks must reset between cases so the call-count assertions are not polluted (`vi.clearAllMocks` or equivalent in `beforeEach`).
- `claude-agent.ts` is CRLF (1986 lines). Mitigation: EOL-aware script and CR-count check.
- The boundary `<=` and the cooldown-throw path are not pinned today; the observation and the new tests are the only guard for them.
- Documents citing the symbol: listed, not fixed.

## Pending observations (to be listed in `review.md`, not fixed)

- Exit-only mode (`run-cycle.ts`) does not run Capa B.
- The single `catch` labels a cooldown failure as "Failed to close", even though the position was closed.
- `nextTradingDay3 === null` closes the position with no cooldown and no log.
- The `'0.05'` literal is duplicated in five `STOP_LOSS_PCT` reads in `claude-agent.ts` (`:129`, `:452`, `:1628`, `:1672`, `:1865` at this HEAD).
- `positions` is not refreshed after Capa B, so later steps still treat a just-closed position as open (pinned by (z3)).
- That Alpaca cancels the GTC stop when `closePosition` is called with `cancel_orders=true` was read from the URL in `alpaca.ts:169-173`, not verified against Alpaca.

## Documents that mention the symbol (to be listed in `review.md`)

`SDD.md:145` (prose, no line numbers); and specs found by the search at implementation, among them `characterization-harness-0d-1`, `0d-2`, `fix-cooldown-stop-loss-ghost-close`, `fix-cooldown-ghost-close-overwrite`, `sma5-reclaim-cooldown`, `extract-exit-cooldown-helpers`, `orphaned-position-reconciliation`.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-05, FR-18 to FR-23). The request records the explicit Amaury/Jorge authorization for this change only; it also authorizes the `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` edits. No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (trailing blank line):** the request says to copy `:447-486` and to delete `:447-487`, as in split-6 and split-7. Default: copy `:447-486`, delete `:447-487`; the module ends with one newline. Confirm.
- **Q-2 (cases without a harness hook):** if the harness cannot provoke cases b (null date), c (cooldown throwing) or d (unset env), observe them through a disposable copy of the current function text, delete it afterwards, and record that in `review.md`. Default: yes.
- **Q-3 (import position):** place the new import right after `./claude-call` (`:28`). Confirm.
- **Q-4 (YAML check):** if no YAML parser is available locally, use `js-yaml` (used in the previous splits) or report as not verified.
- **Q-5 (HEAD):** HEAD is `9bac6d1`, not `f25c193`; the only commit in between is docs-only (`specs/remove-keepalive-workflow`). Default: re-measure and continue; the code baseline is unchanged. Confirm.
