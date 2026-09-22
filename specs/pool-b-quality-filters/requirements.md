# Requirements — Apply Pool A's Quality Filters to Pool B (sectorSnapshots)

## Functional Requirements

FR-01: The system shall exclude any symbol in `INSTRUMENT_BLACKLIST` from `sectorSnapshots` before `sectorSnapshots` is merged into `allCandidates`.
FR-02: The system shall exclude any symbol from `sectorSnapshots` whose `changePercent` fails the existing overbought-spike check (`Math.abs(changePercent) < MAX_DAILY_CHANGE_PCT`), unless that symbol's `relativeVolume` satisfies the existing gap-volume exception (`relativeVolume >= HIGH_RELATIVE_VOLUME_THRESHOLD`) — using the same `passesChangeFilter || passesGapVolumeException` logic already applied to Pool A.
FR-03: The system shall extract the blacklist and overbought-spike filtering logic into a single shared helper function, and both Pool A and Pool B shall call that same helper rather than each maintaining its own copy of the logic.
FR-04: The system shall preserve the existing `heldSymbols` exclusion on Pool B (`sectorOnlySymbols`, added in the prior change) unchanged in content, combined with — not replaced or reordered past by — the new quality filters.
FR-05: The system shall NOT apply the past-selection-profitability sort or the `MAX_POOL_A_CANDIDATES` truncation to Pool B — that step remains exclusive to Pool A.
FR-06: Where a symbol in `sectorSnapshots` fails the blacklist filter, the overbought-spike filter, or the pre-existing `heldSymbols` filter, the system shall exclude it from `allCandidates`.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero new errors after the change.
NFR-02: The change shall be confined to `src/lib/stock-selector.ts` — no other file shall be modified.
NFR-03: The extracted shared filter helper shall be demonstrably invoked by both the Pool A filtering code path and the Pool B filtering code path — not implemented twice.

## Constraints

C-01: `src/lib/stock-selector.ts` is not in the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — no special authorization is required for this change.
C-02: The system shall not modify `src/lib/claude-agent.ts`, `src/lib/risk-manager.ts`, or `src/lib/indicators.ts`.
C-03: The system shall not modify `MAX_POOL_A_CANDIDATES` or apply the top-15 truncation to Pool B.
C-04: The system shall not modify the static `TRADING_WATCHLIST` fallback path (`claude-agent.ts:1151-1182`) — tracked as a separate, later change.
C-05: The system shall not modify the mandatory sector-coverage instruction or either "6-8 symbols" prompt instruction.
C-06: The system shall not alter the prior change's `heldSymbols` filters (on `sectorOnlySymbols` or the return statement) beyond combining them with the new quality filters in the same predicate chain — no removal, no reordering past them that changes which symbols they exclude.
C-07: The system shall not alter the values of `INSTRUMENT_BLACKLIST`, `MAX_DAILY_CHANGE_PCT`, or `HIGH_RELATIVE_VOLUME_THRESHOLD`.
C-08: The system shall not modify `src/lib/alpaca.ts` — including `getStockSnapshots()`'s hardcoded `relativeVolume: 1` / `volume: 0` fields (see `design.md` → "Known Data Constraint").

## Out of Scope

- Fixing `getStockSnapshots()`'s hardcoded `relativeVolume: 1` and `volume: 0` fields in `src/lib/alpaca.ts` — a real relative-volume computation for sector-watchlist snapshots would require a separate change to that file, which is out of scope here (C-08).
- Applying past-selection-profitability filtering or `MAX_POOL_A_CANDIDATES` truncation to Pool B (explicitly excluded by FR-05 / C-03 — sector watchlist names are curated manually, not ranked, by design).
- The static `TRADING_WATCHLIST` fallback path's complete lack of filtering (separate change, tracked elsewhere).
- Resolving what happens when a sector's Pool B candidates are all excluded by the new quality filters on a given day and the mandatory sector-coverage instruction has nothing left to point Claude at for that sector — analyzed in `design.md` as a known, accepted, low-probability edge case (parallel to the fully-held-sector case from the prior change), not resolved here since resolving it would require editing the mandatory sector-coverage instruction (C-05).
