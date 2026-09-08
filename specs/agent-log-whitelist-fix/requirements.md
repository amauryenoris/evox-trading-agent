# Requirements — Fix getAgentLog()/getAgentLogPrioritized() Whitelist Bug

## Functional Requirements

FR-01: The system shall include every key present in an `agent_log` row's raw `indicators` value in the `indicators` object returned by `getAgentLog()`, not only the 16 currently-whitelisted keys.

FR-02: The system shall include every key present in an `agent_log` row's raw `indicators` value in the `indicators` object returned by `getAgentLogPrioritized()`, not only the 16 currently-whitelisted keys.

FR-03: The system shall preserve the exact current null-coalescing default for each of the 16 currently-whitelisted fields (`rsi`, `macd`, `bollingerBands`, `sma50`, `sma200`, `ema50`, `ema200`, `distanceToEma50Pct`, `currentPrice`, `volume`, `prevDayVolume`, `adx`, `atr`, `atrPercentile`, `marketRegime`, `kalman`) in both functions.

FR-04: The system shall return the same safe-default `indicators` object as today, in both functions, when a row's `indicators` is absent or `null`.

FR-05: The system shall NOT modify any other field mapping in `getAgentLog()`'s returned object (`id`, `timestamp`, `symbol`, `decision`, `portfolioSnapshot`, `orderExecuted`, `orderId`, `error`).

FR-06: The system shall NOT modify any other field mapping in `getAgentLogPrioritized()`'s returned object, or its sells/non-sells fetch-and-merge/sort logic.

FR-07: The system shall NOT modify `getTradeEvaluations()` or any other function in `db.ts`.

## Non-Functional Requirements

NFR-01: The fix shall apply the identical "spread raw first, then override with the 16 explicit keys" pattern already shipped in `getTradeEvaluations()` (`db.ts:294-315`), independently in both functions — no shared helper is introduced.

NFR-02: The change shall add a cast to either function's spread expression only if `tsc --noEmit` demonstrates it is required — not speculatively, consistent with how the `getTradeEvaluations()` fix was scoped.

NFR-03: The fix shall be covered by tests proving, for each function: (a) extra keys beyond the 16-field whitelist survive the round trip, (b) the 16 core fields' null-coalescing defaults are unchanged, (c) the empty/absent `indicators` fallback still produces the same safe defaults as today.

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — none of these files are touched by this CHANGE.

C-02: This feature shall modify only `src/lib/db.ts` (plus test file(s)). No other source file may be changed.

C-03: This feature shall not reorder, rename, or change the default expression of any of the 16 pre-existing keys in either function — only add a `...raw` spread before them.

C-04: This feature shall not add a shared helper function between `getAgentLog()` and `getAgentLogPrioritized()` — each is fixed independently, matching their current independent implementations.

C-05: This feature shall not modify `AgentLogEntry`'s type definition, `report-generator.ts`, `risk-manager.ts`, or any dashboard component.

## Out of Scope

- `getTradeEvaluations()` — already fixed, not touched here.
- The pre-existing `raw.indicators_at_buy?.kalman` quirk in `getTradeEvaluations()` — unrelated function, out of scope regardless.
- Promoting any ad-hoc key (`spx_price`, `effectiveThreshold`, `self_flagged_disqualifying_risk`, `state_fingerprint`, `tp_*`, `zle05_*`) to a first-class typed field on `TechnicalIndicators`/`AgentLogEntry`.
- Any change to how the dashboard, weekly report, or risk-manager consumers display or use the newly-visible fields — this spec only makes the data reachable through these two functions, it does not change any caller's behavior.
- Backfilling historical `agent_log` rows or any DB migration.
