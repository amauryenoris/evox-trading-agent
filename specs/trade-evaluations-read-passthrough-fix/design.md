# Design — getTradeEvaluations() Whitelist-Drop Fix (Read Path)

## Architecture Decision

This is a single-expression change inside `getTradeEvaluations()`'s row-mapping function in `src/lib/db.ts` — no new architecture. The function already reconstructs `buyIndicators` from `row.indicators_at_buy`; this change adds a `...raw` spread as the first key in that reconstruction so any key already present in the raw jsonb (whether from today's 16-field whitelist, the recently-added `effectiveThreshold`/`newsAdjustment`/`sectorRotation`/`sectorRotationContext`, the pre-existing but previously-invisible `spx_*`/`tp_*`/`zle05_*` fields, or anything written in the future) survives into the returned object, while the 16 explicit keys below the spread continue to apply their exact current defaulting logic on top.

## Data Flow

1. `getTradeEvaluations()` fetches `trade_evaluations` rows via `.select('*')` (`db.ts:272-276`) — unchanged.
2. For each row, `buyIndicators` is reconstructed via an IIFE (`db.ts:293-313`). Today: `const raw = row.indicators_at_buy ?? {}`, then a fresh object literal listing exactly 16 explicit keys, discarding everything else in `raw`.
3. **Fixed**: the same IIFE instead returns `{ ...raw, rsi: raw.rsi ?? null, macd: raw.macd ?? null, ... [all 16 fields, unchanged], kalman: raw.indicators_at_buy?.kalman ?? raw.kalman ?? null }`. Because object spread applies left-to-right with later keys overriding earlier ones, `...raw` contributes every key from the raw jsonb first, and the 16 explicit keys immediately after it override those same 16 keys with their exact current null-coalescing defaults — byte-identical behavior for those 16, and passthrough for everything else.
4. No other function changes. `insertTradeEvaluation()` (write) was already a full passthrough; `evaluateClosedTrade()` (`learning.ts:174`) was already a full passthrough; this was confirmed the only lossy hop in the entire write→read path.
5. Every consumer of `getTradeEvaluations()` (dashboard trade history, weekly report generation, `learning.ts`'s `buildLearningContext()` pattern matching) now receives the full `buyIndicators` object, including whatever the buy-time snapshot fix (Prompt 1/2) already started writing.

## STEP 0 — Verified Facts

**Current lines 270-330 of `db.ts`** (verbatim, confirmed no drift since the diagnostic):
```ts
270	export async function getTradeEvaluations(limit = 200, startDate?: string): Promise<TradeEvaluation[]> {
271	  const db = getClient()
272	  let query = db
273	    .from('trade_evaluations')
274	    .select('*')
275	    .order('sell_timestamp', { ascending: false })
276	    .limit(limit)
277	  if (startDate) {
278	    query = query.gte('sell_timestamp', `${startDate}T00:00:00Z`)
279	  }
280	  const { data, error } = await query
281	  if (error) throw new Error(`Failed to fetch trade evaluations: ${error.message}`)
282	  return (data ?? []).map((row) => ({
283	    id: row.id,
284	    symbol: row.symbol,
285	    buyTimestamp: row.buy_timestamp ?? '',
286	    sellTimestamp: row.sell_timestamp ?? '',
287	    buyPrice: row.entry_price ?? 0,
288	    sellPrice: row.exit_price ?? 0,
289	    quantity: row.quantity ?? 0,
290	    pnlUSD: row.pnl_usd ?? 0,
291	    pnlPct: row.pnl_pct ?? 0,
292	    holdingDays: Math.round((row.holding_period_hours ?? 0) / 24),
293	    buyIndicators: (() => {
294	      const raw = row.indicators_at_buy ?? {}
295	      return {
296	        rsi: raw.rsi ?? null,
297	        macd: raw.macd ?? null,
298	        bollingerBands: raw.bollingerBands ?? null,
299	        sma50: raw.sma50 ?? null,
300	        sma200: raw.sma200 ?? null,
301	        ema50: raw.ema50 ?? null,
302	        ema200: raw.ema200 ?? null,
303	        distanceToEma50Pct: raw.distanceToEma50Pct ?? null,
304	        currentPrice: raw.currentPrice ?? 0,
305	        volume: raw.volume ?? 0,
306	        prevDayVolume: raw.prevDayVolume ?? 0,
307	        adx: raw.adx ?? null,
308	        atr: raw.atr ?? null,
309	        atrPercentile: raw.atrPercentile ?? null,
310	        marketRegime: raw.marketRegime ?? null,
311	        kalman: raw.indicators_at_buy?.kalman ?? raw.kalman ?? null,
312	      }
313	    })(),
314	    signal_type: (row.signal_type as 'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' | 'TREND_ZLE05' | null) ?? null,
315	    stateFingerprint: row.state_fingerprint ?? null,
316	    claudePostMortem: row.buy_reasoning ?? '',
317	    lessonsLearned: row.lessons ?? [],
318	    outcome: (() => { ... })(),
319-324 (unchanged)
325	  }))
326	}
```
Line 311's `raw.indicators_at_buy?.kalman` is confirmed to be a pre-existing quirk (`raw` has no `indicators_at_buy` property — this expression is always `undefined`, so the line effectively always falls through to `raw.kalman ?? null`). Per the originating request, this is preserved exactly, not "fixed" — out of scope.

**Cast necessity (STEP 0 item 2) — confirmed NOT needed.** `getClient()` (`db.ts:13-18`) calls `createClient(url, key)` from `@supabase/supabase-js` with no `Database` generic type parameter, and its own return type annotation is the library's default, untyped `SupabaseClient`. Consequently `db.from('trade_evaluations').select('*')` resolves to `data: any[] | null`, making `row` — and therefore `row.indicators_at_buy` and `raw` — implicitly typed `any` throughout the existing function (confirmed by the complete absence of any type annotation on `row` or `raw` anywhere in the current code, and the fact that `row.id`, `row.buy_timestamp`, etc. already compile today with no casts). Spreading an `any`-typed value into an object literal does not trigger excess-property checks and does not require a cast to satisfy the function's `Promise<TradeEvaluation[]>` return annotation — the same way the existing 16-key object literal already satisfies that return type today without any cast. **Per the originating instruction to add the cast only if confirmed necessary, this design does not include it.** `npx tsc --noEmit` (a required verification step) will be the final, authoritative confirmation at implementation time; if it unexpectedly fails, the fallback is exactly the cast pattern already specified in the originating request and already proven in `claude-agent.ts`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `{...raw, ...16 explicit override keys}` (as specified) | Minimal diff; explicit keys retain byte-identical defaulting; every current/future extra key survives | None significant | **Chosen** |
| Return `raw` directly, typed as `TechnicalIndicators & Record<string, unknown>`, without the 16 explicit override keys | Even smaller diff | Loses the safe `?? null`/`?? 0` defaults on the 16 core fields for rows with missing keys (e.g. very old rows, or rows where `indicators_at_buy` was saved with a partial shape) — would change behavior for those rows, violating FR-02 | Rejected |
| Add the `TechnicalIndicators & Record<string, unknown>` cast unconditionally | Matches the originating request's example verbatim, zero risk of a surprise compile error | Speculative — STEP 0's own analysis shows it's very likely unnecessary given `row`'s inferred `any` type; the originating instruction explicitly says not to add it speculatively | Rejected per instruction, pending final `tsc --noEmit` confirmation at implementation time |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db.ts` | MODIFY | `getTradeEvaluations()`'s `buyIndicators` IIFE (`293-313`): add `...raw` as the first key in the returned object literal; all 16 existing explicit keys and their defaulting logic unchanged, unreordered |
| `src/lib/__tests__/db.trade-evaluations-fingerprint.test.ts` | UNCHANGED | Must continue passing as-is — verifies this change doesn't affect `stateFingerprint` |
| `src/lib/__tests__/trade-evaluations-buy-indicators-passthrough.test.ts` (or similarly named) | CREATE | New tests per NFR-02 |

## Protected Zone Impact

`src/lib/db.ts` does not appear in either of CLAUDE.md's two Protected Zone lists: not in the core 4-file list (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`), and not in the separate "Confirm with Amaury before touching" File Permission Matrix table (which lists `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `.env`/`.env.local`, `vercel.json`, DB migrations — `db.ts` itself is absent from both). Stating this plainly rather than assuming either a gate or a free pass: per CLAUDE.md's literal, written rules, no explicit Amaury confirmation gate applies to `db.ts`. Given `db.ts` is the central Supabase data-access layer for the whole app, this change is still being routed through the same `/spec → /implement → /review` workflow as everything else in this session for consistency and auditability, but this is not a CLAUDE.md-mandated Protected Zone confirmation.

## Database Changes

None. No schema change, no migration, no new column — `indicators_at_buy` is already an untyped `jsonb` column that already contains the extra keys this fix makes visible.

## Open Questions

None blocking. The one item STEP 0 was asked to resolve (cast necessity) has been resolved above with a specific, falsifiable prediction (no cast needed) that `tsc --noEmit` will confirm or refute during implementation — not a design decision requiring Amaury's input.
