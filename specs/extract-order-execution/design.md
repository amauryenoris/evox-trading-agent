# Design — CHANGE split-6: extract the IOC order-execution helpers from claude-agent.ts (pure move, no behaviour change)

## Architecture Decision

Move 6 of the `claude-agent.ts` split. The IOC BUY helpers form one self-contained unit: the error-label constants, the bounded polling that resolves an order's final state, the fill-attempt bookkeeping and the remainder-retry loop. Their only outside inputs are four functions of `./alpaca`, `MAX_SPREAD_BPS` of `./config` and two types of `./types`. They do not use `./db`, `process.env`, `Date` or `./protective-orders`. They move together to `src/lib/order-execution.ts` with no import from `claude-agent.ts`. The two call sites in `runAgentCycle` (normal mode and ranking mode) stay in `claude-agent.ts` because they mutate cycle state. `STOP_SUBMIT_FAILED` moves with the constants because it shares their banner; it is only a label and no helper uses it, and moving it avoids editing `protective-orders.ts` again.

## What moves (HEAD `3ee8cfa`)

| Item | Lines | Becomes |
|------|-------|---------|
| Banner "IOC FILL — error label constants" | `:535-537` | moves with the code |
| `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED`, `IOC_LATE_FILL` | `:539-541` | already `export` |
| Comment + `IOC_REMAINDER_RETRY_MAX`, `IOC_RETRY_MAX_DRIFT_BPS`, `IOC_RETRY_MIN_REMAINDER_USD` | `:543-546` | already `export` |
| Comment + `resolveIocFinalState` | `:548-589` | already `export` |
| `buildFillAttempt` | `:591-603` | private |
| `weightedAvgFillPrice` | `:605-609` | private |
| Comment + `executeIocWithRemainderRetry` | `:611-677` | already `export` |
| Blank line before `runAgentCycle` | `:678` | deleted, not copied (see Q-2) |

Delete range in `claude-agent.ts`: `:535-678`. `runAgentCycle` starts at `:679`.

## Dependency audit

| Name | Use in the moved code | Use left in `claude-agent.ts` | Result |
|------|----------------------|-------------------------------|--------|
| `submitLimitOrder` | `:628`, `:652` | none | removed from `claude-agent.ts` |
| `getOrder` | `:567`, `:588` | none | removed |
| `cancelOrder` | `:584` | none | removed |
| `getQuote` | `:637` | `:1754`, `:2018` | stays in both |
| `MAX_SPREAD_BPS` | `:642` | `:1770`, `:1771` | stays in both |
| `AlpacaOrder` (type) | several | none | removed |
| `FillAttempt` (type) | several | `:1741` | stays in both |
| `executeIocWithRemainderRetry`, `IOC_NOT_FILLED`, `STOP_SUBMIT_FAILED` | — | `:1828`, `:1833`, `:1853`, `:2020`, `:2025`, `:2046` | imported |
| `resolveIocFinalState`, `IOC_LATE_FILL` | — | none (tests only) | imported and re-exported |
| `IOC_REMAINDER_RETRY_MAX`, `IOC_RETRY_MAX_DRIFT_BPS`, `IOC_RETRY_MIN_REMAINDER_USD` | in the loop | none | not imported, not re-exported |

`tsc` and ESLint are the final judge of which imports become unused; any other name found is listed in the report.

## Edits to claude-agent.ts (and only these)

1. Delete `:535-678`.
2. Add `import { executeIocWithRemainderRetry, resolveIocFinalState, IOC_NOT_FILLED, STOP_SUBMIT_FAILED, IOC_LATE_FILL } from './order-execution'` after the `./protective-orders` import (`:29`).
3. Extend `export { submitStopWithRetry }` (`:80`) to `export { submitStopWithRetry, resolveIocFinalState, IOC_NOT_FILLED, STOP_SUBMIT_FAILED, IOC_LATE_FILL }`.
4. Remove `submitLimitOrder`, `getOrder`, `cancelOrder` and `AlpacaOrder` from the imports, if `tsc`/ESLint confirm they are unused.

An EOL-aware script writes CRLF.

## Observation (to be filled at implementation, before any expected value)

A disposable script runs the current `executeIocWithRemainderRetry` and `resolveIocFinalState` with a mocked `./alpaca` and fake timers. Reading the code gives the expected shape, but the values are recorded from the run:

| Case | Code reference | To record |
|------|----------------|-----------|
| a. Fill without `filled_avg_price` | `:597-599` | price used (read: the limit price) and the exact `console.warn` text |
| b. `a.avgFillPrice ?? 0` | `:607` | reachable only with a 0-share attempt after a partial one; the resulting average |
| c. Retry fills 0 shares | `:658-660` | log text, `attempts.length`, that the loop stops |
| d. Retry throws | `:663-664` | `console.error` text, that fills already obtained are kept and the loop stops |
| e. `resolveIocFinalState` normal path | `:554-589` | same output as `ioc-fill-verification.test.ts` expects |

Observed values (2026-11-13, HEAD `3ee8cfa`, fake timers, `getOrder` returning the registered order, `getQuote` returning `{ask: 50, spreadBps: 20, fresh: true}` unless noted; symbol `AAA`, requested 100, limit 50, first spread 20 bps):

| Case | Observed |
|------|----------|
| a. Partial 60/100, `filled_avg_price` null, `getQuote` null | Attempt `avgFillPrice` = 50 (the limit price). `console.warn`: `[IOC_RETRY] AAA order o1 filled 60 but has no filled_avg_price — using limit price $50 instead`. Then `[IOC_RETRY] AAA stopping remainder retries — gate check failed (remainder=40)`. Result: `totalFilledQty` 60, `avgFillPrice` 50, 1 attempt; `submitLimitOrder` 1 call; `getOrder` 1 call (polled once because the sync status was `canceled`, not `filled`) |
| b. Partial 60 @ 50, then retry order with 0 filled and null price | `?? 0` is reachable. Second attempt `{qtyFilled: 0, avgFillPrice: null, status: 'canceled', qtyRequested: 40, limitPrice: 50}`. Result: `totalFilledQty` 60, `avgFillPrice` 50 |
| c. Same run | Logs in order: `[ORDER] AAA limit IOC BUY @ $50 id: o1 status: canceled filled: 60/100 spread: 20bps`, `[ORDER] AAA limit IOC BUY retry @ $50 id: o2 status: canceled filled: 0/40 spread: 20bps`, `[IOC_RETRY] AAA stopping remainder retries — retry filled 0 shares`, `[IOC_REMAINDER_RETRY] AAA: requested 100, attempts 2, filled 60`. `submitLimitOrder` called twice (`['AAA',100,'buy',50]`, `['AAA',40,'buy',50]`); `getQuote` once; loop stops |
| d. Partial 60 @ 50, then retry `submitLimitOrder` rejects `Error('retry boom')` | `console.error('[IOC_RETRY] AAA retry attempt failed — keeping fills already obtained:', Error('retry boom'))`; then `[IOC_REMAINDER_RETRY] AAA: requested 100, attempts 1, filled 60`. Result: `totalFilledQty` 60, `avgFillPrice` 50, 1 attempt; no further retry |
| Happy path | Full fill 100 @ 49.95: 1 attempt, `avgFillPrice` 49.95, `getQuote` 0 calls, `getOrder` 0 calls; logs `[ORDER] AAA limit IOC BUY @ $50 id: o1 status: filled filled: 100/100 spread: 20bps` and `[IOC_REMAINDER_RETRY] AAA: requested 100, attempts 1, filled 100` |
| e1. `resolveIocFinalState`, sync `filled` with 10 | Returns the sync order; `getOrder` 0 calls |
| e2. `resolveIocFinalState`, sync `new` with 0, refetch `filled` 5 | Log `[ORDER] AAA IOC_LATE_FILL: sync=0 final=5`; returns the refetched order; `getOrder` 1 call |

e1 and e2 match what `ioc-fill-verification.test.ts` expects (`:128`, `:141`).

## Tests (new)

`src/lib/__tests__/order-execution.test.ts` (LF), written before the module (RED). `vi.hoisted` mocks of `../alpaca` and `../config` (`MAX_SPREAD_BPS` = 100); fake timers where `setTimeout` runs (the 1500 ms polling), restored in `afterEach`. Cases: a, b, c, d above and one happy path of `executeIocWithRemainderRetry`. Existing coverage stays untouched: goldens (a)(b)(k)(l)(m)(ae)(af-1)(af-2)(ag)(aa)(ab)(ac) pin the call sites, `fillAttempts` and the texts; `ioc-fill-verification.test.ts` covers `resolveIocFinalState` and the constants through the re-export; `ioc-remainder-retry.test.ts` (a replica) is not edited.

## Registration (authorized)

| File | EOL | Edit |
|------|-----|------|
| `.github/workflows/pr-review.yml` | LF | `"src/lib/order-execution.ts"` after `"src/lib/protective-orders.ts"`, same indent |
| `vitest.config.ts` | LF | `'src/lib/order-execution.ts'` appended to `coverage.include` |
| `CLAUDE.md` | CRLF | File Structure row and "Confirm with Amaury" row after the `protective-orders.ts` rows; reason "Places live BUY orders, polls and force-cancels them, and retries partial fills — an error can leave an unprotected or orphaned position" |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One module for constants and helpers | Contiguous block, one banner, no cycle | None significant | Chosen |
| Keep `STOP_SUBMIT_FAILED` in `claude-agent.ts` | Zero move | Splits the label block; needs another move later | Rejected |
| Put `STOP_SUBMIT_FAILED` in `protective-orders.ts` | Near `submitStopWithRetry` | Edits a registered module; splits the block | Rejected |
| Re-export the three retry constants | API compatibility | Nobody imports them; extra surface | Rejected |
| Also move the call sites | Bigger reduction | Mutates cycle state; not a pure move | Rejected |
| Replace the replica test with the real import | Real coverage | Edits an existing test; out of scope | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/order-execution.ts` | CREATE | Moved code; LF |
| `src/lib/claude-agent.ts` | MODIFY | One block deletion, import changes, extended re-export; CRLF; Protected Zone, authorized |
| `src/lib/__tests__/order-execution.test.ts` | CREATE | Direct tests (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | One line |
| `vitest.config.ts` | MODIFY | One entry |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `specs/extract-order-execution/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `config.ts`, `alpaca.ts`, `types.ts`, `protective-orders.ts`, the existing IOC tests, `specs/docs-5-selector-criteria/tasks.md`.

## Risks

- This code places live BUY orders and force-cancels them; a wrong move can leave an unprotected or orphaned position. Mitigation: byte copy, byte comparison against HEAD, the goldens that pin the call sites, and direct tests for the four uncovered branches.
- The four uncovered branches (`:597-599`, `:607`, `:658-660`, `:663-664`) are not pinned by any golden or real test today; the byte comparison and the new tests are the only guard.
- `claude-agent.ts` is CRLF (2162 lines). Mitigation: EOL-aware script and CR-count check.
- Module mocking: the harness mocks `alpaca` and `config` by path (`mocks.ts:10`, `:86-89`); the new module imports the same specifiers, so the mocks keep applying. Verified by the characterization runs.
- Retry timing: `resolveIocFinalState` waits with `setTimeout`; the harness `pump` and the existing tests advance fake timers, and the move does not change that.
- `export { … }` needs the names imported in the same file; both statements are edited together.
- Documents citing old line numbers: listed at the end, not fixed.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-03, FR-22 to FR-28). The request states the Amaury/Jorge authorization for this change only; it also authorizes the `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` edits. No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (re-export form):** extend the existing `export { submitStopWithRetry }` into one statement, rather than adding a second `export { … }` line. The request says "next to"; both are equivalent at runtime. Default: one extended statement. Confirm.
- **Q-2 (trailing blank line):** the request says to copy `:535-678` including the trailing blank line and also that the file ends with exactly one newline. Copying the blank line would leave a blank line before EOF. Default: copy `:535-677` and delete `:535-678` from `claude-agent.ts`; the byte comparison covers `:535-677`. Confirm.
- **Q-3 (import order):** place the `./order-execution` import after `./protective-orders` (`:29`). Confirm.
- **Q-4 (YAML check):** if no YAML parser is available locally, use `js-yaml` (a transitive dependency, used in split-4 and split-5) or report as not verified.
