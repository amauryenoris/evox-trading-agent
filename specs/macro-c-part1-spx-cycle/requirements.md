# Requirements — Macro-C Part 1: SPX Snapshot at Cycle Start

## Functional Requirements

FR-01: The system shall fetch SPY daily bars once per `runAgentCycle()` invocation using `getBars('SPY', '1Day', 260)`, in parallel with `getAccount()`, `getPositions()`, and `getClock()`.

FR-02: The system shall compute `spx_price` as the closing price of the bar at index `bars.length - 2` (the last confirmed close, excluding the current partial/intraday bar).

FR-03: The system shall compute `spx_sma50` as the simple moving average of the 50 closes ending at (and including) the reference bar index, using only bars available at that index.

FR-04: The system shall compute `spx_sma200` as the simple moving average of the 200 closes ending at (and including) the reference bar index, using only bars available at that index.

FR-05: The system shall classify `spx_regime` as `'BULL'` when `spx_price > spx_sma200`, as `'CAUTION'` when `spx_price > spx_sma50` (and `spx_price <= spx_sma200`), and as `'BEAR'` otherwise.

FR-06: The system shall set all four SPX fields to `null` when the SPY bars array contains fewer than 2 bars.

FR-07: The system shall set `spx_sma50` and `spx_sma200` and `spx_regime` to `null` when insufficient history exists to compute either SMA at the reference index, while still setting `spx_price`.

FR-08: The system shall log `[MACRO_SPX] price=N sma50=N sma200=N regime=X` at cycle start when SPX data is available.

FR-09: The system shall log `[MACRO_SPX] unavailable` at cycle start when SPX data is not available.

FR-10: The system shall continue the trade cycle normally when the SPY fetch fails — it shall never throw or exit due to SPY unavailability.

FR-11: The system shall enrich `indicatorsAtBuy` with `spx_price`, `spx_sma50`, `spx_sma200`, and `spx_regime` immediately before calling `saveOpenPositionContext()` in Path 1 (single-stock BUY execution), for all signal types.

FR-12: The system shall enrich `bestIndicatorsAtBuy` with `spx_price`, `spx_sma50`, `spx_sma200`, and `spx_regime` immediately before calling `saveOpenPositionContext()` in Path 2 (ranked-best BUY execution), for all signal types.

FR-13: The system shall persist the four SPX fields inside the `indicators` JSON column of `open_position_contexts` as part of the existing `saveOpenPositionContext()` upsert — no schema change required.

## Non-Functional Requirements

NFR-01: The SPY fetch shall run in parallel with existing cycle-start calls — it shall not add sequential latency to the cycle.

NFR-02: The `tsc --noEmit` check shall pass with zero errors after this change.

NFR-03: The `npm run build` check shall pass after this change.

NFR-04: The regime classification logic shall be identical to the Macro-B backfill script: `BULL / CAUTION / BEAR` — no alternate label set.

## Constraints

C-01: Only `src/lib/claude-agent.ts` may be modified. No other file in `src/` shall be touched in this part.

C-02: This feature must not modify `tp_population_bucket` or `tp_zscore` enrichment blocks.

C-03: This feature must not modify `getBars()` in `alpaca.ts`.

C-04: This feature must not modify any exit rules or `enforceExitRules()`.

C-05: ⚠️ `src/lib/claude-agent.ts` is in the Protected Zone — requires explicit confirmation from Amaury before implementation.

C-06: `types.ts`, `learning.ts`, and `db.ts` are out of scope for this part (handled in Macro-C Parts 2–4).

## Out of Scope

- Writing SPX fields as dedicated columns in `trade_evaluations` (Macro-C Part 2 — db.ts).
- Adding SPX fields to the `TradeEvaluation` type (Macro-C Part 3 — types.ts).
- Reading SPX fields in `evaluateClosedTrade()` (Macro-C Part 4 — learning.ts).
- Any UI/dashboard changes to display `spx_regime`.
- Using SPX regime as a trading gate or signal condition (future spec).
