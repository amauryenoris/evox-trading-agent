# Design — Fix candidatesOffered's Pre-Truncation Capture Bug

## Architecture Decision

This is a single-function, single-file reordering fix confined to `selectStocksForAnalysis()` in `src/lib/stock-selector.ts`. No new file, no new abstraction, no schema change — the existing `[...candidates, ...sectorSnapshots]` expression that builds `allCandidates` (currently `stock-selector.ts:88`) moves to immediately after Step 5's truncation (currently `stock-selector.ts:105`), so it captures the same `candidates` variable at a later, correct point in its lifecycle instead of an earlier, stale one. Every downstream consumer of `allCandidates` within the function (the persisted `candidatesOffered` field, and the final `allSymbolSet` validation) is unchanged in code — only the data now flowing through it is correct.

## Data Flow

1. Steps 1-3 filter `candidates` down (blacklist, held positions, gap-vol overbought filter) — **unchanged**.
2. Sector watchlist symbols are computed and deduplicated against the (still pre-sort, pre-truncate) `candidates`, then `sectorSnapshots` is fetched — **unchanged**, this dedup step correctly operates on the full post-filter set regardless of Pool A's later truncation, since Pool B's job is "don't duplicate a symbol already in the screener pool" at any size.
3. **MOVED:** `allCandidates` construction — previously captured here (pre-sort, pre-truncate), now deferred.
4. `selectionEvals` fetched, Step 4 sorts `candidates` in place — **unchanged**.
5. Step 5 truncates `candidates` to `MAX_POOL_A_CANDIDATES` (≤15) — **unchanged**.
6. **NEW POSITION:** `const allCandidates: ScreenerStock[] = [...candidates, ...sectorSnapshots]` now executes here, immediately after truncation — capturing the same final `candidates` that `screenerLines` (step 7) will render into the prompt.
7. `screenerLines`/`sectorLines`/prompt construction — **unchanged**, already used post-truncation `candidates`.
8. Claude call, response parsing — **unchanged**.
9. `candidatesOffered: allCandidates` persisted via `insertSelectionDecision()` — same field, same expression, now correct data.
10. `allSymbolSet` built from `allCandidates` for final `selected` validation — same code, now correctly excludes any symbol Claude might reference that was truncated out and never actually rendered.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Move `allCandidates` construction to after Step 5 (this spec) | Minimal diff — one block relocated, zero logic changes; directly fixes the root cause (wrong capture timing) | None identified | **Chosen** |
| Keep `allCandidates` where it is, but slice it again before use (`allCandidates.slice(...)`) | Also fixes the symptom | Introduces a second, redundant truncation constant/call site that must be kept in sync with `MAX_POOL_A_CANDIDATES`'s Step 5 usage — duplicates logic instead of just reordering it | Rejected |
| Keep two variables — `allCandidatesOffered` (pre-truncation, for persistence) and a separate `renderedCandidates` (post-truncation, for the prompt) | Preserves historical over-inclusive semantics if that were ever desired | Contradicts the confirmed goal (accurate historical record of what Claude actually saw); adds a second variable with no current consumer | Rejected |
| Leave as-is, document the discrepancy | Zero code risk | Leaves a confirmed, steady-state 27-53% over-count in production data indefinitely, with no offsetting benefit | Rejected — this is the bug being fixed |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | Relocate the `allCandidates` construction (1 line) from before Step 4/5 to immediately after Step 5's truncation. No other line changes. |
| `src/lib/__tests__/stock-selector.test.ts` | MODIFY (additive) | New test(s) confirming `allCandidates`/`candidatesOffered` is capped to the post-truncation count, and confirming a selected-but-truncated-out symbol is now correctly filtered from the return value. |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, or `learning.ts`. Confined entirely to `stock-selector.ts`.

## Database Changes

None. The `selection_history.candidates_offered` jsonb column's shape is unchanged — only the length/content of the array written into it going forward is corrected. No migration required (confirmed live: it's an untyped jsonb column with no DB-level shape constraint).

## Open Questions

None. The diagnostic already confirmed: the exact capture-point bug, its live-production magnitude (27-53% over-count across 5 sampled rows), and that `candidatesOffered`'s only downstream reader (`recordSelectionOutcome()` via `getRecentSelections()`) never inspects its content — only `.selectedSymbols` — so this fix has no known blast radius requiring a decision here.
