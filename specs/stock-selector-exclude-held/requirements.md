# Requirements — Exclude Held Symbols from Pool B and selectStocksForAnalysis()'s Return Value

## Functional Requirements

FR-01: The system shall exclude any symbol in `heldSymbols` from `sectorOnlySymbols` (the set used to build Pool B / `sectorSnapshots`), in addition to the existing exclusion of symbols already present in Pool A.
FR-02: The system shall exclude any symbol in `heldSymbols` from the final `string[]` returned by `selectStocksForAnalysis()`, in addition to the existing `allSymbolSet` pool-membership check.
FR-03: The system shall remove the system-prompt line stating "Stocks currently held should only be included if you may want to evaluate them for exit," since held symbols are no longer offered to Claude for selection at all.
FR-04: The system shall leave the mandatory sector-coverage instruction (the three-sector `MANDATORY: include at least 1 stock from each of these sectors` block) unchanged.
FR-05: The system shall leave the "select 6-8 symbols" instructions (both occurrences — the system prompt and the user-prompt closing line) unchanged.
FR-06: The system shall leave the existing `allSymbolSet` pool-membership check in place at the return statement — the held-symbol exclusion is additive, not a replacement.
FR-07: The system shall leave Pool A's existing blacklist, held-symbol, and overbought-spike filters (lines 89-98) unchanged.
FR-08: The system shall leave `MAX_POOL_A_CANDIDATES`, the sort-by-past-profitability logic, and the truncation to Pool A's top-15 unchanged.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero new errors after the change.
NFR-02: The change shall be confined to `src/lib/stock-selector.ts` — no other file shall be modified.

## Constraints

C-01: `src/lib/stock-selector.ts` is not in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — no special authorization is required for this change.
C-02: The system shall not modify `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, or `src/lib/indicators.ts`.
C-03: The system shall not modify `MAX_POOL_A_CANDIDATES`, Pool A's blacklist/overbought/relative-volume filters, or the sort-by-past-profitability logic.
C-04: The system shall not modify the static `TRADING_WATCHLIST` fallback path (`claude-agent.ts:1151-1182`) — tracked as a separate, later change.
C-05: The system shall not add quality filters (blacklist/overbought/relative-volume) to Pool B — tracked as a separate, later change.
C-06: The system shall not modify the mandatory sector-coverage instruction or either "6-8 symbols" instruction.

## Out of Scope

- Adding quality filters to Pool B (separate change).
- Fixing the static `TRADING_WATCHLIST` fallback path's complete lack of filtering (separate change).
- Resolving what happens when a sector becomes fully held (all of that sector's `DEFAULT_SECTOR_WATCHLIST` symbols are open positions) and the mandatory sector-coverage instruction has zero valid candidates left to point Claude at for that sector — this is a genuine behavior change introduced by this fix (previously impossible, since held symbols were still offered), explicitly analyzed in `design.md` but not resolved here, since resolving it would require touching the mandatory sector-coverage instruction, which is out of scope (C-06).
- Any change to `claude-agent.ts`'s downstream `openPositionSymbols.has(symbol)` skip (`claude-agent.ts:1559-1561`) or its lack of a top-up mechanism — this fix reduces how often that skip fires by preventing held symbols from being offered in the first place, but does not touch the skip logic itself.
