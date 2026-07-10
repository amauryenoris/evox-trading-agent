# Requirements — Normalize sell_timestamp Precision

## Functional Requirements

FR-01: The system shall produce a fixed 3-digit-millisecond, `Z`-suffixed ISO-8601 string whenever it computes a `sellTimestamp` value in `runAgentCycle()`, regardless of whether the source is Alpaca's `filled_at` or the app's own `toISOString()` fallback.

FR-02: The system shall persist the normalized `sellTimestamp` to `trade_evaluations.sell_timestamp` for every closed-trade evaluation.

FR-03: The system shall persist the normalized `sellTimestamp` to `agent_log.timestamp` for every ghost-close log entry.

FR-04: Where `getLatestSellOrder()` filters candidate sell orders by `filled_at > afterTimestamp`, the system shall compare normalized representations of both values rather than the raw strings.

FR-05: Where `getLatestSellOrder()` sorts candidate sell orders to select the most recent fill, the system shall sort using normalized representations of `filled_at` rather than the raw strings.

FR-06: The system shall return `AlpacaOrder` objects from `getLatestSellOrder()` with their original, unmodified `filled_at` value — normalization shall apply only to the internal comparison logic, not to the returned data.

FR-07: The system shall expose the normalization logic as a single reusable, exported function rather than duplicating the logic at each call site.

FR-08: The system shall leave every existing row in `trade_evaluations` and `agent_log` unmodified by this change — normalization applies only to values computed after the change is deployed.

## Non-Functional Requirements

NFR-01: The normalization function shall be pure (no side effects, no I/O) and independently unit-testable.
NFR-02: The normalization function shall handle any RFC-3339 timestamp string Alpaca may return (3 to 9 fractional digits, with or without trailing-zero trimming) without throwing.
NFR-03: The fix shall not introduce a new dependency — it relies solely on the built-in `Date` object.

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone) — requires explicit confirmation from Amaury before implementation proceeds, per `specs/README.md`.
C-02: This feature must not alter `AlpacaOrder`'s type shape (`filled_at` remains `string | null`).
C-03: This feature must not perform or trigger a historical backfill of `trade_evaluations` or `agent_log`.
C-04: This feature must not change any gate, signal-detection, or exit-rule logic in `claude-agent.ts` beyond the single `sellTimestamp` line.
C-05: This feature must not modify `db.ts`, `learning.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, or `watchlist-monitor.ts` — they already pass through the value unchanged.

## Out of Scope

- Backfilling historical `sell_timestamp` / `agent_log.timestamp` precision inconsistencies.
- Normalizing `buy_timestamp` (already consistently app-generated).
- Any change to `open_position_contexts` or `position_health_snapshots` timestamp columns.
- Adding a database constraint or trigger to enforce format at the schema level.
