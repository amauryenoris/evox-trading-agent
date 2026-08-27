# Design — VIXY 1-Day % Change into Market Daily Briefing

## Architecture Decision

This feature adds one new small, self-contained computation to `market-daily-briefing.ts` (a 1-day % change helper, analogous in spirit to `sector-rotation.ts`'s `relativeReturnPct()` but intentionally a separate, simpler function rather than a shared/parameterized one) and threads its result through the existing 3-parameter briefing pipeline (`synthesizeDailyBriefingNarrative()` → `generateDailyBriefing()` → `buildBriefingRecord()`), each gaining one new parameter. The only Protected Zone touch is in `claude-agent.ts`, confined to two points: one new entry in the already-existing `Promise.all` (fetching VIXY bars, with the same `.catch(() => [])` defensive pattern already used for SPY/GDX/XLE/XLK), and one new argument passed into the existing `generateDailyBriefing(...)` call. No new file, no new external provider, no schema change (the `vix_proxy_change` column has existed since Fase 2).

## Data Flow

1. `claude-agent.ts`'s existing `Promise.all` (lines 998-1018) gains one more entry: `getBars('VIXY', '1Day', 400).catch((err) => { console.error('[BRIEFING] VIXY fetch failed:', err); return [] })`, destructured as `vixyBars`.
2. Immediately after `sectorRotation`/`sectorRotationContext` are computed, `computeVixyChangePct(vixyBars)` (new, in `market-daily-briefing.ts`) produces a `number | null`.
3. `generateDailyBriefing(spxSnapshot, sectorRotation, macroSentiment, vixyChangePct)` — the existing call, now with one more argument.
4. Inside `generateDailyBriefing()`: the new `vixyChangePct` parameter flows to `synthesizeDailyBriefingNarrative(...)` (which renders it into the Claude prompt via a new `formatVixyChangeContext()` formatter) and to `buildBriefingRecord(...)` (which persists it as `vix_proxy_change`, replacing the hardcoded `null`).
5. `upsertMarketDailyBriefing(...)` — unchanged call, now sometimes carrying a real `vix_proxy_change` value.

**Live-verified during spec-writing** (not assumed): a direct call to Alpaca's `/v2/stocks/VIXY/bars` endpoint (same `sip` feed, same credentials this project already uses) returned 9 real daily bars with valid close prices for the most recent trading days. VIXY is confirmed tradable/fetchable exactly like the other 4 symbols — the diagnostic's "critical unknown" is resolved. The `.catch(() => [])` graceful-degradation path (FR-09) remains in the design regardless, matching the existing defensive pattern for SPY/GDX/XLE/XLK, but there is now positive evidence it won't be needed in the common case.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New, separate 1-day-change function in `market-daily-briefing.ts` (this spec) | Zero risk to `sector-rotation.ts`; small, self-contained, easy to delete/replace later when FMP VIX data arrives | Slight duplication of the anti-lookahead indexing idea (not the code — the math differs: 1-day vs 20-day) | **Chosen** (confirmed by Amaury — lower risk than modifying `sector-rotation.ts`) |
| Parameterize `sector-rotation.ts`'s `relativeReturnPct()` with a `lookbackDays` argument and export it | Reuses one function for both 20-day and 1-day cases | Touches a file that's been stable and untouched since Fase 2 for a change that doesn't need it; widens that function's exported surface for a one-off caller | Rejected |
| 20-day VIXY relative strength (matching sector rotation's window) | Consistent methodology across all rotation-style metrics | Doesn't match the "market fear, right now" framing Amaury wants — a fear gauge is naturally a today-vs-yesterday question, not a trailing-month one | Rejected — confirmed by Amaury |
| Present VIXY as a literal VIX-equivalent level (no caveat) | Simpler prompt text | Misleading — VIXY tracks VIX futures with contango decay, not the spot index; would misinform Claude's narrative synthesis and, transitively, the dashboard-facing briefing text | Rejected — this is a directional-only proxy and must say so every time it renders |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/market-daily-briefing.ts` | MODIFY | New `computeVixyChangePct()` function; new `formatVixyChangeContext()` formatter; `vixyChangePct: number \| null` added as a new parameter to `synthesizeDailyBriefingNarrative()`, `generateDailyBriefing()`, and `buildBriefingRecord()`; `buildBriefingRecord()`'s return object's `vix_proxy_change` changes from hardcoded `null` to the passed-through value |
| `src/lib/claude-agent.ts` (Protected Zone — authorized) | MODIFY | New `getBars('VIXY', ...)` entry in the existing `Promise.all`; new `computeVixyChangePct(vixyBars)` call; `generateDailyBriefing(...)` call gains the new 4th argument; `computeVixyChangePct` added to the existing import from `./market-daily-briefing` |
| `src/lib/__tests__/market-daily-briefing.test.ts` | MODIFY (mixed — one deliberate update, rest additive) | `buildBriefingRecord` test's expected object updated to a real `vix_proxy_change` value (deliberate, per C-06); new tests added for `computeVixyChangePct()` and `formatVixyChangeContext()`; all other describe blocks untouched |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is touched — explicitly authorized by Amaury for this specific change**, confined to exactly two points: (1) one new entry in the existing `Promise.all` fetch list, (2) one new argument on the existing `generateDailyBriefing(...)` call, plus the corresponding import addition. No signal-detection, gate, position-sizing, or trade-execution logic anywhere else in the file is touched.

## Database Changes

None — `market_daily_briefings.vix_proxy_change` already exists (reserved since Fase 2's `create_market_daily_briefings` migration). This change only populates it with real data going forward instead of a hardcoded `null`.

## Open Questions

None remaining. The diagnostic's one open question — VIXY's actual fetchability via this project's Alpaca `sip` feed — was live-verified during this spec-writing session (see Data Flow above): 9 real daily bars returned successfully.
