# Requirements — getTradeEvaluations() Whitelist-Drop Fix (Read Path)

## Functional Requirements

FR-01: The system shall include every key present in a `trade_evaluations` row's raw `indicators_at_buy` value in the `buyIndicators` object returned by `getTradeEvaluations()`, not only the 16 currently-whitelisted keys.

FR-02: The system shall preserve the exact current null-coalescing default for each of the 16 currently-whitelisted fields (`rsi`, `macd`, `bollingerBands`, `sma50`, `sma200`, `ema50`, `ema200`, `distanceToEma50Pct`, `currentPrice`, `volume`, `prevDayVolume`, `adx`, `atr`, `atrPercentile`, `marketRegime`, `kalman`).

FR-03: The system shall preserve the existing `kalman` field's current defaulting expression (`raw.indicators_at_buy?.kalman ?? raw.kalman ?? null`) unmodified, including its pre-existing quirk of checking `raw.indicators_at_buy` (a key that does not exist on `raw`) before falling back to `raw.kalman`.

FR-04: The system shall return the same safe-default `buyIndicators` object as today when a row's `indicators_at_buy` is absent or `null`.

FR-05: The system shall leave `stateFingerprint`'s mapping (`row.state_fingerprint ?? null`) unchanged, since it is read from a separate dedicated column, not part of the `buyIndicators` whitelist reconstruction.

FR-06: The system shall NOT modify any other field mapping in `getTradeEvaluations()`'s returned object (`id`, `symbol`, `buyTimestamp`, `sellTimestamp`, `buyPrice`, `sellPrice`, `quantity`, `pnlUSD`, `pnlPct`, `holdingDays`, `signal_type`, `claudePostMortem`, `lessonsLearned`, `outcome`).

FR-07: The system shall NOT modify `insertTradeEvaluation()`, `saveOpenPositionContext()`, or any other function in `db.ts`.

FR-08: The system shall NOT modify `evaluateClosedTrade()` or any other part of `learning.ts`.

FR-09: The system shall NOT modify `claude-agent.ts`.

## Non-Functional Requirements

NFR-01: The system shall add the `TechnicalIndicators & Record<string, unknown>` cast to the reconstructed `buyIndicators` object only if `tsc --noEmit` requires it to compile — not speculatively.

NFR-02: The fix shall be covered by tests proving: (a) extra keys beyond the 16-field whitelist survive the round trip, (b) the 16 core fields' null-coalescing defaults are unchanged, (c) the empty/absent `indicators_at_buy` fallback still produces the same safe defaults as today.

NFR-03: The existing 3 tests in `db.trade-evaluations-fingerprint.test.ts` (covering `stateFingerprint` mapping) shall continue to pass unmodified.

## Constraints

C-01: This feature modifies only `src/lib/db.ts` (plus a test file). `db.ts` is not listed in CLAUDE.md's Protected Zone (neither the core 4-file list nor the "Confirm with Amaury" File Permission Matrix table) — see design.md's Protected Zone Impact section for the precise state of this.

C-02: No backfill of historical `trade_evaluations` rows is in scope — this is a read-mapping fix only; rows already correctly carry extra data in their raw `indicators_at_buy` jsonb (per the prior write-side fix and the pre-existing `spx_*` fields), this change only stops discarding it on read.

C-03: This is explicitly the second half ("Prompt 2/2") of a two-part fix; the first half (write-side persistence in `claude-agent.ts`) is already implemented and merged — not to be re-touched here.

## Out of Scope

- Any change to `getAgentLog()` or `getAgentLogPrioritized()` (`db.ts`), which have the identical whitelist-drop pattern for `agent_log.indicators` — confirmed as a related, systemic finding in the observability inventory, but not named in this spec's Goal and therefore not addressed here.
- Promoting any currently-ad-hoc key (`spx_price`, `effectiveThreshold`, `sectorRotation`, `tp_*`, `zle05_*`) to a first-class typed field on `TechnicalIndicators` or `TradeEvaluation`.
- Any change to how the dashboard, weekly report, or `learning.ts` consumers display or use the newly-visible fields — this spec only makes the data reachable through `getTradeEvaluations()`, it does not change any caller's behavior.
- Backfilling historical rows or any DB migration.
