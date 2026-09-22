# Design — Apply Pool A's Quality Filters to Pool B (sectorSnapshots)

## Architecture Decision

Single-file change to `src/lib/stock-selector.ts`'s `selectStocksForAnalysis()`. Extract Pool A's blacklist check (`candidates.filter(c => !INSTRUMENT_BLACKLIST.has(c.symbol))`, current line 88) and overbought-spike check with gap-volume exception (current lines 90-97) into one new module-level helper, `applyPoolQualityFilters(pool: ScreenerStock[]): ScreenerStock[]`, placed above `selectStocksForAnalysis()` alongside the file's other constants. Both Pool A and the new Pool B call site invoke this same helper — no separate copy of the logic exists for either pool.

## Data Flow

1. Pool A (current lines 87-97): blacklist filter and overbought filter are today two separate inline `.filter()` calls, with the `heldSymbols` filter (line 89, pool-specific, unrelated to this change) sitting between them.
2. **This change**: Pool A's blacklist + overbought logic collapses into one call, `candidates = applyPoolQualityFilters(candidates)`. The pre-existing `heldSymbols` filter (line 89) moves to run immediately after this call instead of between the two halves of it. Filter predicates only ever remove elements and never add them, so filter order does not change the resulting set — Pool A's final candidate list after all three checks is unaffected by this reordering.
3. Pool B (current lines 99-107): `sectorOnlySymbols` (string list) is filtered for `heldSymbols` — unchanged, still pre-fetch, still on the symbol list (added in the prior change). `sectorSnapshots` is then fetched via `getStockSnapshots()`.
4. **This change**: immediately after the fetch, `sectorSnapshots = applyPoolQualityFilters(sectorSnapshots)` — the same helper used by Pool A, applied post-fetch since blacklist/overbought checks need the fetched `changePercent`/`relativeVolume` fields, which don't exist on the pre-fetch symbol strings.
5. `allCandidates = [...candidates, ...sectorSnapshots]` (line 128, unchanged) — now both pools have passed through the same blacklist + overbought-spike + held-symbol checks before merge.
6. Downstream: prompt construction, Claude call, and the return-statement filters (both from the prior change) are unchanged — they operate on whatever `allCandidates`/`sectorSnapshots` end up containing.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Extract blacklist + overbought into one shared helper; reorder Pool A's `heldSymbols` filter to run after it | Single source of truth for both filters (the CHANGE's explicit ask); minimal, order-only diff on Pool A; provably identical resulting set (filter order is commutative for pure predicates) | Diff touches Pool A's existing filter block, not just Pool B | **Chosen** — matches the instruction's explicit "factor it into a small shared helper... so the two pools can never drift out of sync again" |
| Keep Pool A's two inline `.filter()` calls exactly as-is; write a *second*, separate implementation of the same logic for Pool B | Zero diff to Pool A | Directly contradicts the instruction ("do not duplicate the filter logic as a copy-pasted block"); the two pools can drift out of sync again, which is the exact problem the CHANGE is trying to prevent | Rejected |
| Apply the new quality filters to `sectorOnlySymbols` (pre-fetch symbol list) instead of `sectorSnapshots` (post-fetch) | Would keep the held-symbol and quality filters in one filter call on strings | Blacklist/overbought checks need `changePercent` and `relativeVolume`, which only exist after `getStockSnapshots()` runs — a pre-fetch filter can't evaluate them | Rejected — quality filters must run post-fetch, held-symbol filter stays pre-fetch (unchanged from the prior change) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | New module-level function `applyPoolQualityFilters()` (blacklist + overbought/gap-volume logic, moved out of the inline Pool A filters). Pool A's lines ~88, ~90-97 collapse into one call to it, with the existing `heldSymbols` filter (line 89) reordered to run immediately after. New call to the same helper added on `sectorSnapshots` right after `getStockSnapshots()` (~line 107), before the merge into `allCandidates`. No other line changes. |

## Protected Zone Impact

None — `src/lib/stock-selector.ts` is not in `CLAUDE.md`'s Protected Zone list. No confirmation gate required.

## Database Changes

None.

## Known Data Constraint — Pool B's gap-volume exception is structurally inert (documented, not resolved here)

`getStockSnapshots()` (`src/lib/alpaca.ts:234-253`, used exclusively to build Pool B) hardcodes every returned symbol's `relativeVolume` to `1` and `volume` to `0` — it does not compute a real relative-volume figure the way Pool A's screener data does (`src/lib/alpaca.ts:222`, `avgVolume > 0 ? c.volume / avgVolume : 0`). Since `HIGH_RELATIVE_VOLUME_THRESHOLD = 1.5`, the gap-volume exception (`relativeVolume >= 1.5`) can never evaluate true for a Pool B symbol — for Pool B, `applyPoolQualityFilters()`'s overbought check always reduces to the plain `Math.abs(changePercent) < MAX_DAILY_CHANGE_PCT` test, with no gap-volume escape hatch. This is a pre-existing data-shape limitation of `getStockSnapshots()`, not something this change introduces or can fix within its `stock-selector.ts`-only scope (C-08) — noted here so the "same three filters" framing isn't read as functionally identical in practice for both pools, only structurally identical in code.

A minor, harmless side effect of sharing the helper: the `[GAP_VOL_EXCEPTION]` diagnostic `console.log` (part of the overbought check) is now reachable from the Pool B code path too. In practice it will never fire for Pool B, per the constraint above — Pool B symbols cannot satisfy `passesGapVolumeException`, so the log line requires `!passesChangeFilter && passesGapVolumeException`, which is always false when the second term is always false.

## Known Behavior Change — quality-filtered-out sector with zero Pool B candidates (documented, not resolved here)

Requested verification: for the current `DEFAULT_SECTOR_WATCHLIST` (17 symbols — 7 Big Tech, 5 Oil & Energy, 5 Mining/Gold/Rare Earth), would typical price action plausibly exclude every symbol in one sector on a given day, leaving that sector with zero Pool B candidates?

**Blacklist**: none of the 17 `DEFAULT_SECTOR_WATCHLIST` symbols currently appear in `INSTRUMENT_BLACKLIST` (checked directly against `config.ts` — the blacklist is inverse/leveraged ETFs and two flagged speculative tickers, none of which overlap). Under the current config, the blacklist filter excludes zero Pool B symbols.

**Overbought filter**: per the constraint above, this reduces to `Math.abs(changePercent) < 15` per symbol, with no exception. For an entire sector to be emptied, *every* symbol in that group would need to move >15% on the same day:
- Big Tech (7 mega-caps: AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA) and Oil & Energy (5, including the diversified ETF XLE) — a simultaneous >15% same-day move across all members of either group is not a pattern these diversify-by-construction groups exhibit, including on historical crash days.
- Mining/Gold/Rare Earth (5: MP, UUUU, NEM, FCX, GOLD) mixes smaller, more volatile names (MP, UUUU) with steadier majors (NEM, GOLD, FCX) — a same-day >15% move across all five simultaneously would require an essentially sector-wide catastrophic event hitting every name identically, which historical precedent does not show as a recurring pattern.

**Conclusion**: under the current `DEFAULT_SECTOR_WATCHLIST` composition and `MAX_DAILY_CHANGE_PCT = 15`, it is implausible for ordinary price action to empty an entire sector's Pool B candidates on a given day — each sector retains 5-7 symbols, and the filter requires a unanimous >15% move to zero one out. This is a lower-probability scenario than the prior change's fully-held-sector case (a portfolio-composition fact that recurs naturally as positions accumulate, versus a market-volatility coincidence across an entire sector at once).

If this edge case did occur, it is handled exactly the same safe way already analyzed for the fully-held-sector case: no crash, that sector contributes nothing to `sectorLines`/the prompt text, and Claude's behavior under the (unchanged) mandatory sector-coverage instruction in that situation is not deterministic from the prompt alone — it may omit the sector, which is accepted as-is. Resolving that prompt-level contradiction is out of scope (C-05), unchanged from the prior change's analysis.

## Open Questions

None requiring a decision before implementation — both the gap-volume-exception inertness and the low-probability emptied-sector scenario above are documented, accepted consequences (per the CHANGE prompt's own request for this analysis), not blocking design questions.
