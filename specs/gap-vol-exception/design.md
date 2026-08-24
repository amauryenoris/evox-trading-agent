# Design — Gap+Volume Exception for Pool A Filter

## Architecture Decision

This feature lives entirely in the stock-selection layer, upstream of Claude's analysis and every execution gate. `getMarketMovers()` (`src/lib/alpaca.ts:194-218`) already fetches one batch snapshot per cycle for the market screener's top movers; it gains one derived field (`relativeVolume`) computed purely from data already in that batch — no new endpoint, no new call. `selectStocksForAnalysis()`'s Pool A pipeline (`src/lib/stock-selector.ts`) gains one additional OR-condition inside its existing Step 3 filter, plus a one-line prompt tag. `ScreenerStock` (`src/lib/types.ts:254-259`) gains the new field so the value flows through the type system from fetch to filter to prompt construction.

## Data Flow

1. `getMarketMovers()` fetches the screener top-actives list, then the batch snapshot for those symbols (unchanged).
2. It maps each symbol to `{ symbol, price, changePercent, volume }` and filters out `price <= 0` (unchanged, becomes an intermediate `rawCandidates` array).
3. **NEW:** it computes `avgVolume` across `rawCandidates` and maps each candidate to include `relativeVolume = avgVolume > 0 ? volume / avgVolume : 0`.
4. `selectStocksForAnalysis()` receives these `ScreenerStock[]` as `candidates` and runs the Pool A pre-filter:
   - Step 1 (blacklist), Step 2 (held positions) — unchanged.
   - **Step 3 (overbought spikes) — MODIFIED:** a candidate passes if `|changePercent| < 15` OR `relativeVolume >= 1.5`. The second branch logs `[GAP_VOL_EXCEPTION]` when it is the reason a candidate survives.
   - Step 4 (profitability sort), Step 5 (truncate to 15) — unchanged.
5. Pool A prompt-line construction appends ` [GAP+VOL]` to any surviving candidate whose `|changePercent| >= 15` (i.e., candidates that only got here via the Step 3 exception).
6. Claude receives the tagged Pool A text and selects symbols as it does today — no change to its selection logic or output schema.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| True relative volume vs. each symbol's own historical average | Textbook-correct signal | Requires up to 30 extra `getBars()` calls/cycle — added API load and latency | Rejected |
| Batch-average relative volume (this batch's own candidates) | Zero new API calls, uses data already fetched | Baseline is itself pre-selected for high volume, so the bar is relative to an elevated baseline, not the broader market | Chosen (confirmed by Amaury) |
| Raise `MAX_DAILY_CHANGE_PCT` itself instead of adding an exception | Simpler — one constant change | Loosens the gap filter for ALL large moves, not just ones with volume confirmation; loses the original Kalman-protection intent | Rejected |
| Add a new separate filter pass for the exception (outside the Step 3 callback) | Slightly more separated logic | Would double-iterate candidates and require a second pass to detect "would have been excluded" state just to log it | Rejected — kept inside the Step 3 callback so the log only fires on true positives |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `relativeVolume: number` to `ScreenerStock` (lines 254-259) |
| `src/lib/alpaca.ts` | MODIFY | `getMarketMovers()` (lines 194-218): compute batch `avgVolume` and map `relativeVolume` onto each candidate |
| `src/lib/stock-selector.ts` | MODIFY | Add `HIGH_RELATIVE_VOLUME_THRESHOLD` const (after line 19); modify Step 3 filter (line 67) to OR in the exception + log; tag `[GAP+VOL]` in prompt-line construction (lines 113-117) |
| `src/lib/__tests__/stock-selector.test.ts` | MODIFY (additive) | New test cases for the filter's 3 outcomes + empty-batch edge case; existing 2 tests untouched |
| `src/lib/__tests__/alpaca.test.ts` (new file, if none exists) | CREATE | Tests for `relativeVolume` computation correctness in `getMarketMovers()` |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`. It only changes which candidates reach Pool A's prompt text; no gate, signal-detection, or execution logic is affected.

## Database Changes

None — `[GAP_VOL_EXCEPTION]` is console-logged only, per the confirmed decision to defer persistence until the exception's real-world firing rate is observed.

## Open Questions

- **`getStockSnapshots()` type conflict (blocks C-07):** `getStockSnapshots()` (`src/lib/alpaca.ts:225-244`) also returns `ScreenerStock[]` and constructs literals as `{ symbol, price, changePercent, volume: 0 }` (line 238) — no `relativeVolume`. Once `relativeVolume` becomes a required field on `ScreenerStock`, this construction fails to type-check, which breaks `npx tsc --noEmit` / `npm run build` (both required by C-07/VERIFY). The spec's "DO NOT CHANGE" list explicitly excludes `getStockSnapshots()` from modification, but leaving it unchanged means the build cannot pass. This is a direct conflict between two of the spec's own constraints and needs Amaury's call before implementation:
  - (a) Add `relativeVolume: 1` (neutral/no-signal default) to `getStockSnapshots()`'s returned object — a one-line addition, not a change to its fetch/filter logic, sector-watchlist candidates were never part of the exception path anyway since they bypass Pool A's Step 3 filter entirely.
  - (b) Make `relativeVolume` optional (`relativeVolume?: number`) on `ScreenerStock` instead of required, and default to `0` wherever it's read in `stock-selector.ts`.
  - (c) Something else Amaury prefers.
  Recommendation: (a) — it satisfies "no logic change to `getStockSnapshots()`" in spirit (the function's fetch/mapping logic is unchanged, one required field gets a constant default) while keeping `relativeVolume` a non-optional, always-meaningful number everywhere else in the codebase.

  **DECIDED (Amaury): Option (a).** `getStockSnapshots()` returns `relativeVolume: 1` as a constant default in its returned literal. `relativeVolume` stays a required `number` on `ScreenerStock`.
