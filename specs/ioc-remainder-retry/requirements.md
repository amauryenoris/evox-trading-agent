# Requirements — Bounded Remainder Retry for Partial IOC BUY Fills

## Background

STEP 0 (2026-09-30, prior session) confirmed: BUYs are limit IOC at `quote.ask` (immediate path `claude-agent.ts:2185-2187`, ranking path `:2370-2371`), resolved to a terminal Alpaca status by `resolveIocFinalState()` (`:1050-1085`). A `canceled` status with `filled_qty > 0` is already treated as a partial fill today. All downstream code already reads the *actual* filled quantity correctly: `decision.quantity = filledQty` (`:2202`/`:2387`), `submitStopWithRetry(symbol, filledQty, ...)` (`:2209`/`:2394`), `saveOpenPositionContext({ quantity: filledQty, ... })` (`:2256-2266`/`:2460-2470`). `saveOpenPositionContext` upserts by `symbol` alone (`db.ts:177`, `onConflict: 'symbol'`) and nothing in the codebase adjusts a stored position's `quantity` afterward (`updatePositionContext`, `db.ts:210-225`, has no `quantity` field) — so a top-up **after** persistence would silently overwrite the row rather than merge into it. This is why the retry must complete before `decision.quantity`, the stop order, and the position context are written, so every downstream consumer only ever sees one final, aggregated fill per BUY.

Observed: 3 of 5 BUYs since `requestedQty` shipped (2026-09-28, commit `c4cf2d3`) were partial (MP 26/122, INTC 12/46, META 3/4). `.claude/skills/alpaca-patterns.md:41-44` documents "do not retry immediately" specifically for a **zero** fill — this feature never retries a zero fill, consistent with that guidance. The GOOGL incident (2026-08-28, commits `02e311d`/`58c9a8a`) established that every order attempt must be run through `resolveIocFinalState()` — retries in this feature follow that same rule, no exceptions.

`requestedQty` (commit `c4cf2d3`) already established the pattern this feature's `fillAttempts` field follows: a hoisted `let requestedQty: number | undefined` (`:2093`), set at sizing time (`:2171`), conditionally spread into `indicatorsWithLearning` (`:2294-2304`, used for `agent_log.indicators`) and directly assigned onto `indicatorsAtBuy`/`bestIndicatorsAtBuy` (used for `open_position_contexts.indicators`) — added purely for observability, changing no other persisted value.

**Investigated before writing this spec, per the CHANGE's own FAIL FAST conditions:**

1. *Do the two BUY paths differ in a way that prevents one shared helper?* No. Both already call `submitLimitOrder(symbol, qty, 'buy', price)` → `resolveIocFinalState(syncOrder)` with equivalent shapes; a single helper parameterized by `(symbol, requestedQty, firstLimitPrice)` fits both call sites without behavior change.
2. *Can `fillAttempts` reach the ranking winner's entry without mutating a shared object?* Yes, safely. `best.entry.indicators` is already `indicatorsWithLearning` — a fresh object built via `{ ...indicators, ... }` at queue time (`:2294`), not a reference into the shared `indicatorsCache: Map<string, TechnicalIndicators>` (`:1231`) that the CHANGE explicitly warned about. Attaching `fillAttempts` via `best.entry.indicators = { ...best.entry.indicators, fillAttempts }` at the point `best.decision.quantity = filledQty` is set is a fresh spread, not a mutation of any cached/shared object.
3. *Is the `buyPrice` derivation ambiguous?* **Yes — genuine FAIL FAST trigger.** `buyPrice` (`saveOpenPositionContext`'s argument, both call sites `:2259`/`:2463`) is currently `indicators.currentPrice` — a technical-indicator snapshot value computed from bars *before* the order is even submitted. It has **no relationship at all** to the order's actual fill data (`filled_avg_price`, `limit_price`, or anything else) — there is no existing "derive entry price from fill" semantics to mirror. **Resolved by user decision (2026-09-30, via AskUserQuestion): `buyPrice` stays exactly `indicators.currentPrice`, unchanged.** The new `avgFillPrice`/`fillAttempts` are purely additive observability fields inside the indicators JSONB — mirroring exactly how `requestedQty` was added alongside `filledQty` without altering any other persisted value. This is the safer reading given `saveOpenPositionContext` itself is explicitly forbidden from being touched, and `buyPrice` feeds P&L/exit-evaluation code with unknown downstream readers outside this feature's scope.

---

## Functional Requirements

FR-01: The system shall submit the initial BUY order using the identical limit price, quantity, and call sequence (`submitLimitOrder` → `resolveIocFinalState`) as today's behavior, for "attempt 1" of any BUY.

FR-02: The system shall attempt a remainder retry only when the running total filled quantity is greater than 0 and less than the originally requested quantity.

FR-03: The system shall never attempt a retry when the running total filled quantity is 0.

FR-04: The system shall not submit more than `IOC_REMAINDER_RETRY_MAX` (2) remainder retry orders for a single BUY.

FR-05: Where `IOC_REMAINDER_RETRY_MAX` is set to 0, the system shall produce identical behavior to today's flow — exactly one order attempt, `fillAttempts` containing exactly one entry.

FR-06: Before each retry, the system shall fetch a fresh quote for the symbol and proceed only if the quote exists, is fresh, and its spread does not exceed `MAX_SPREAD_BPS`.

FR-07: Before each retry, the system shall proceed only if the fresh ask price does not exceed attempt 1's limit price by more than `IOC_RETRY_MAX_DRIFT_BPS` (20bps), comparing always against attempt 1's price, never against the previous retry's price.

FR-08: Before each retry, the system shall compute the remaining unfilled quantity (requested − total filled so far) and proceed only if that remainder's notional value (remainder × fresh ask) is at least `IOC_RETRY_MIN_REMAINDER_USD` ($300).

FR-09: The system shall stop retrying and keep whatever has already filled when any of FR-06, FR-07, or FR-08's conditions fail, without treating this as an error.

FR-10: Where a retry is attempted, the system shall submit it via `submitLimitOrder(symbol, remainder, 'buy', freshAsk)` followed by `resolveIocFinalState()`, identically to how attempt 1 is resolved.

FR-11: The system shall never let the aggregated total filled quantity exceed the originally requested quantity.

FR-12: Where a retry attempt throws, the system shall catch the error, log it, and preserve all fills already obtained from prior attempts.

FR-13: The system shall compute an aggregate `avgFillPrice` as the fill-quantity-weighted average of each attempt's fill price, using that attempt's `filled_avg_price` when present; where an order has `qtyFilled > 0` but lacks `filled_avg_price`, the system shall use that order's own limit price for the weighting and log that this fallback occurred; where an order's `qtyFilled` is 0, its price does not affect the weighted average (zero weight).

FR-14: The system shall record one `attempts[]` entry per order actually submitted, in submission order, each shaped as `{ orderId, qtyRequested, qtyFilled, limitPrice, avgFillPrice: number | null, status }`, where `status` is that order's final Alpaca status after `resolveIocFinalState()`.

FR-15: The system shall use one shared helper function, placed next to `resolveIocFinalState()`, for both the immediate-execution BUY path and the ranking-queue BUY path.

FR-16: Where a BUY executes (in either path), the system shall set `decision.quantity` to the aggregated total filled quantity.

FR-17: Where a BUY executes (in either path), the system shall set `agent_log.order_id` to attempt 1's order id (unchanged from today).

FR-18: Where at least one order was submitted for a BUY (including a single full fill on attempt 1), the system shall persist the `attempts[]` array as `fillAttempts` inside the indicators JSONB, in both `agent_log.indicators` and `open_position_contexts.indicators`.

FR-19: The system shall not add a separate `orderIds` field — each attempt's order id lives inside its own `fillAttempts` entry, and the attempt count is the array's length.

FR-20: In the immediate-execution path, the system shall follow the existing `requestedQty` hoisting pattern (`claude-agent.ts:2093`/`:2171`/`:2294-2304`) for threading `fillAttempts` into `indicatorsWithLearning` and `indicatorsAtBuy`.

FR-21: In the ranking-queue path, the system shall attach `fillAttempts` to `best.entry.indicators` and `bestIndicatorsAtBuy` at the point `best.decision.quantity` is set, by constructing a new object (`{ ...best.entry.indicators, fillAttempts }`), never by mutating the existing object in place.

FR-22: The system shall not mutate any `TechnicalIndicators` object referenced by the shared `indicatorsCache` Map.

FR-23: The system shall not change `buyPrice`'s value or derivation at either `saveOpenPositionContext` call site — it remains `indicators.currentPrice` / `best.indicators.currentPrice`, unchanged.

FR-24: The system shall keep all existing per-attempt `[ORDER]` log lines and add one summary log line per BUY in the form `IOC_REMAINDER_RETRY: requested X, attempts N, filled Y`.

FR-25: The system shall submit exactly one stop order per BUY, sized at the aggregated total filled quantity, via the existing `submitStopWithRetry()` call — unchanged internals, called once, after all retry attempts (if any) have completed.

FR-26: The system shall add an optional `fillAttempts` field to `TechnicalIndicators` (`types.ts`), typed `Array<{ orderId: string; qtyRequested: number; qtyFilled: number; limitPrice: number; avgFillPrice: number | null; status: string }>`.

---

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero errors after the change.

NFR-02: The full existing test suite shall pass with no regressions, plus new tests for the retry helper's logic.

NFR-03: The change shall not alter the sizing formula, liquidity gate, spread gate, trading-hours gate, or portfolio-risk gate.

NFR-04: The change shall not alter `resolveIocFinalState()`'s internal polling/forced-cancel logic — it is reused as-is, once per order attempt (including retries).

NFR-05: The change shall not alter the order type or time-in-force (`limit` / `ioc`) for any order, including retries.

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. **⚠️ Requires Amaury's explicit confirmation before implementation**, separate from spec approval, per `CLAUDE.md`'s File Permission Matrix and `specs/README.md`'s Protected Zone rule.

C-02: No change to `submitStopWithRetry`, `saveOpenPositionContext`, `updatePositionContext`, `db.ts`, `alpaca.ts`, or `resolveIocFinalState`'s internals.

C-03: No retry on a zero fill, ever.

C-04: No resting/day-time-in-force orders — every order (attempt 1 and every retry) is `limit` + `ioc`.

C-05: No price buffer on attempt 1 — its limit price is `quote.ask` exactly, as today.

C-06: No BUY-related write (stop order, position context, agent_log) happens before the retry sequence for that BUY has fully concluded.

C-07: `risk-manager.ts`, `indicators.ts`, `config.ts`, and `learning.ts` shall not be touched.

C-08: No database migration — `fillAttempts` rides inside the existing `indicators` JSONB column, exactly as `requestedQty` did.

C-09: The quote used for attempt 1 is not re-fetched by this feature — it remains whatever each BUY path already fetches today (out of scope, a separate topic per STEP 0's own findings).

C-10: `requestedQty`'s existing behavior (value, hoisting, persistence) is not changed by this feature.

C-11: `buyPrice` is not changed by this feature (resolved per Background — user decision 2026-09-30).

---

## Out of Scope

- Re-fetching or buffering the quote used for attempt 1
- Any change to `requestedQty`'s existing behavior
- Changing `buyPrice`'s derivation
- A `scores[]`/response-schema change of any kind (this feature has no Claude-facing schema at all — it's purely execution-path)
- Stop/trailing-stop logic, `submitStopWithRetry`, `saveOpenPositionContext`, `updatePositionContext`, `db.ts`, `alpaca.ts`, `resolveIocFinalState` internals
- `risk-manager.ts`, `indicators.ts`, `config.ts`, `learning.ts`
- Any database migration
- Determining or verifying whether the production account is paper or live (STEP 0 already covered this; not reopened here)
