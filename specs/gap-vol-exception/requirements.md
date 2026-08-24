# Requirements — Gap+Volume Exception for Pool A Filter

## Functional Requirements

FR-01: The system shall compute a `relativeVolume` value for each candidate returned by `getMarketMovers()`, equal to that candidate's `volume` divided by the average `volume` across the same candidate batch.

FR-02: The system shall set `relativeVolume` to `0` for all candidates when the candidate batch is empty or the batch average volume is `0`.

FR-03: Where a Pool A candidate's `|changePercent|` is below `MAX_DAILY_CHANGE_PCT` (15), the system shall include that candidate regardless of its `relativeVolume`.

FR-04: Where a Pool A candidate's `|changePercent|` is at or above `MAX_DAILY_CHANGE_PCT` and its `relativeVolume` is at or above `HIGH_RELATIVE_VOLUME_THRESHOLD` (1.5), the system shall include that candidate in Pool A.

FR-05: Where a Pool A candidate's `|changePercent|` is at or above `MAX_DAILY_CHANGE_PCT` and its `relativeVolume` is below `HIGH_RELATIVE_VOLUME_THRESHOLD`, the system shall exclude that candidate from Pool A, as it does today.

FR-06: When a candidate is included in Pool A specifically via the gap+volume exception (FR-04), the system shall emit a `[GAP_VOL_EXCEPTION]` log line containing that candidate's symbol, `changePercent`, and `relativeVolume`.

FR-07: The system shall not emit a `[GAP_VOL_EXCEPTION]` log line for any candidate excluded by FR-05, or for any candidate included via FR-03.

FR-08: When constructing Pool A's prompt lines for Claude, the system shall append a ` [GAP+VOL]` tag to the line for any candidate whose `|changePercent|` is at or above `MAX_DAILY_CHANGE_PCT`.

## Non-Functional Requirements

NFR-01: This feature shall not add any new Alpaca API calls — `relativeVolume` is computed only from data already fetched within the existing `getMarketMovers()` request.

NFR-02: The `HIGH_RELATIVE_VOLUME_THRESHOLD` value shall be a named constant (not a magic number) local to `stock-selector.ts`, consistent with the existing `MAX_DAILY_CHANGE_PCT` pattern.

## Constraints

C-01: This feature must not modify the Protected Zone (`src/lib/config.ts`, `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, `src/lib/indicators.ts`, `src/lib/news-intelligence.ts`, `src/lib/watchlist-monitor.ts`, `src/lib/learning.ts`) — this fix touches only `src/lib/alpaca.ts`, `src/lib/types.ts`, and `src/lib/stock-selector.ts`.

C-02: `MAX_DAILY_CHANGE_PCT`'s value (15) must not change — only a new OR-exception is added alongside it.

C-03: `changePercent`'s computation or meaning must not change.

C-04: Pool A pipeline Steps 1, 2, 4, 5 (blacklist, held-position exclusion, profitability sort, truncation to 15) must remain untouched.

C-05: No gate, signal-detection, or trade-execution logic may be affected — this change only affects which candidates reach Pool A's text for Claude's selection step.

C-06: No existing test file's assertions may be modified.

C-07: `npx tsc --noEmit` and `npm run build` must both pass after the change.

## Out of Scope

- True relative volume computed against each symbol's own historical average (would require ~30 additional `getBars()` calls per cycle — explicitly rejected in favor of the batch-average approximation).
- Persisting `[GAP_VOL_EXCEPTION]` events to a database table — console logging only, matching the project's existing `[SECTOR_ROTATION]` / `[BRIEFING]` observability pattern.
- Recalibrating `HIGH_RELATIVE_VOLUME_THRESHOLD` (1.5) or `MAX_DAILY_CHANGE_PCT` (15) — both are starting values; the logging added here is what enables future recalibration, not this spec.
- Any change to `getStockSnapshots()`'s exclusion logic or the sector-watchlist pool ("Pool B").
