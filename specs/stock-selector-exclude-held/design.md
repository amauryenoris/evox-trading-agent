# Design — Exclude Held Symbols from Pool B and selectStocksForAnalysis()'s Return Value

## Architecture Decision

Single-file change to `src/lib/stock-selector.ts`'s `selectStocksForAnalysis()`. `heldSymbols` (`Set<string>`, already computed at line 86 from `positions`) is already used to filter Pool A (line 90); this change extends its use to the two remaining points in the same function where a held symbol can currently leak through: Pool B's construction (`sectorOnlySymbols`, ~line 107) and the function's final return filter (~line 217). Both additions are `&&`-combined with the existing filter predicate at each site — additive, not restructured.

## Data Flow

1. `heldSymbols` computed once, line 86 (unchanged).
2. Pool A: blacklist → held (unchanged, line 90) → overbought-spike → sort → truncate to top 15.
3. Pool B: `sectorOnlySymbols` currently excludes only symbols already in Pool A (`!screenerSymbolSet.has(s)`) — **this change adds `&& !heldSymbols.has(s)`**, so a held symbol is excluded from Pool B regardless of whether it's also in Pool A.
4. `allCandidates = [...candidates, ...sectorSnapshots]` — now structurally cannot contain a held symbol from either pool.
5. Prompt built from `allCandidates`; Claude selects 6-8 symbols from what it's shown.
6. `parsed.selected` validated against `allSymbolSet` (pool membership, unchanged) — **this change adds `&& !heldSymbols.has(s)`** to the same filter expression, so even if Claude's raw JSON response names a held symbol (it structurally can't have seen one in the data, but nothing prevents it from naming one anyway per the mandatory sector-coverage instruction's literal ticker list — see "Known Behavior Change" below), it's stripped at the boundary before returning to the caller.
7. `claude-agent.ts`'s main loop (unchanged, out of scope) — the `openPositionSymbols.has(symbol)` skip at line 1559-1561 now fires far less often, since held symbols are structurally excluded upstream instead of being offered and then dropped.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Filter `sectorOnlySymbols` with a separate `.filter()` call instead of extending the existing predicate | Slightly more explicit as a "two-step" filter | The existing line already reads as one filter predicate (`!screenerSymbolSet.has(s)`); adding a second `.filter()` call changes the code's shape more than necessary for an additive change | Rejected — combine with `&&` in the same predicate, matching the instruction to "add ... alongside it, not instead of it" |
| Remove system-prompt line 59 entirely vs. rewrite it to something else | Removal is the smallest diff and the line has no remaining purpose once held symbols are structurally never offered | A rewritten line (e.g. "Held symbols are never offered — exits are handled separately") adds words to explain an absence that's now simply true by construction, not worth stating | **Chosen: remove line 59 outright** — the CHANGE prompt's own reasoning ("held symbols will no longer be offered to Claude at all for selection") supports outright removal over a replacement |
| Also patch the mandatory sector-coverage instruction to handle a fully-held sector gracefully | Would resolve the "zero valid candidates for a sector" edge case cleanly | Explicitly out of scope (C-06) — the CHANGE prompt asks this to be described, not fixed | Rejected for this change — documented below as a known, accepted behavior change |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | Line ~107: `sectorOnlySymbols` filter gains `&& !heldSymbols.has(s)`. Line ~217: return filter gains `&& !heldSymbols.has(s)`. Line 59: system-prompt bullet removed. No other line changes. |

## Protected Zone Impact

None — `src/lib/stock-selector.ts` is not in `CLAUDE.md`'s Protected Zone list. No confirmation gate required.

## Database Changes

None.

## Known Behavior Change — fully-held sector with zero valid candidates (documented, not resolved here)

**Previously impossible, now possible**: if every symbol in one of the three `DEFAULT_SECTOR_WATCHLIST` sector groups (Big Tech / Oil & Energy / Mining-Gold-Rare-Earth) is currently an open position, that sector will now have **zero valid candidates** in either Pool A (already excluded held symbols before this change) or Pool B (excluded by this change) — `allCandidates` will contain nothing from that sector, and neither `screenerLines` nor `sectorLines` will list anything from it in the prompt text shown to Claude.

The mandatory sector-coverage instruction (lines 53-56, unchanged by this fix) still literally reads: *"MANDATORY: include at least 1 stock from each of these sectors in your final selection"* and lists that sector's actual ticker symbols by name (e.g. "Mining / Gold / Rare Earth (MP, UUUU, NEM, FCX, GOLD)") — the instruction's wording does not currently account for "this sector has no offered candidates." **The prompt has no explicit fallback for this contradiction**, so what Claude actually does is not deterministic from the prompt text alone. Two plausible outcomes, both already handled safely by existing/extended code:
- Claude omits that sector from `selected` (violates the letter of "MANDATORY" but is the only internally-consistent option given no data was shown for it) — the response is accepted as-is; `selected` may end up short of full three-sector coverage that cycle.
- Claude names one of that sector's tickers anyway (since the instruction spells them out literally, independent of what was in the data pools) — that symbol is **not** in `allSymbolSet` (it was never added to either pool) **and** is in `heldSymbols`, so it is filtered out by both the pre-existing pool-membership check and this change's new held-symbol check at the return statement (line ~217) — it will not reach the caller either way.

In both outcomes, no held symbol reaches `claude-agent.ts`'s watchlist via this path, and no crash/exception occurs — the practical effect is simply that `selectStocksForAnalysis()` may return fewer than 6-8 fresh symbols, or miss covering a fully-held sector, exactly during the cycles when that sector is fully held (i.e., precisely the situation the reported bug was about — the system now fails toward "offer fewer, but all fresh" rather than "offer 6-8 nominally, several silently stale"). Resolving the underlying prompt contradiction (e.g. an explicit "if a sector has no available candidates, skip it and note why in reasoning" instruction) would require editing the mandatory sector-coverage block, which is explicitly out of scope for this change (C-06).

## Open Questions

None requiring a decision before implementation — the fully-held-sector scenario above is a known, accepted, and safely-bounded consequence (documented per the CHANGE prompt's own request), not a blocking design question.
