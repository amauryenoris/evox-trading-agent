# Requirements — Exclude heldSymbols from the Static TRADING_WATCHLIST Fallback Path

## Functional Requirements

FR-01: The system shall exclude any symbol currently held as an open position from the static `watchlist` fallback list, when the dynamic selection path (`selectStocksForAnalysis()`) fails or returns insufficient candidates and `runAgentCycle()` falls back to `TRADING_WATCHLIST`.
FR-02: The system shall derive the held-symbol membership test used by this exclusion from the same `Set` already used by the main loop's `openPositionSymbols.has(symbol)` skip check — not a separately computed set or a separate O(n) scan.
FR-03: The system shall NOT apply `INSTRUMENT_BLACKLIST` filtering to the fallback watchlist at the point of construction — blacklist filtering remains exclusively the responsibility of the existing check further downstream in the main loop.
FR-04: The system shall NOT apply any quality filter (change-percent, relative-volume, or otherwise) to the fallback watchlist — the static list carries no such per-symbol market data to filter on.
FR-05: The system shall leave the fallback path's `TRADING_WATCHLIST` env var name and its 9-symbol default list unchanged.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero new errors after the change.
NFR-02: The change shall be confined to `src/lib/claude-agent.ts` — no other file shall be modified.
NFR-03: The diff shall consist of exactly two edits — relocating the existing `openPositionSymbols` declaration earlier in the same function, and appending one filter step to the fallback watchlist's existing `.split/.map/.filter` chain — with no unrelated lines modified.

## Constraints

C-01: `src/lib/claude-agent.ts` **is** in the Protected Zone (`CLAUDE.md`). Implementation shall not begin until Amaury has given fresh, explicit, in-conversation confirmation to touch this specific file — spec approval alone does not constitute that confirmation.
C-02: The system shall not modify `src/lib/stock-selector.ts`, `src/lib/risk-manager.ts`, or `src/lib/indicators.ts`.
C-03: The system shall not change the try/catch/`SelectionStepError` error-handling logic, or how failures are logged via `insertSelectionFailure()`.
C-04: The system shall not modify the auto-entry injection block (`watchlist.push(sym)`, ~line 1273).
C-05: The system shall not add a top-up/refill mechanism to replace held symbols excluded from the fallback list with additional fresh ones.
C-06: The system shall not modify the `INSTRUMENT_BLACKLIST` check (~line 1554), the `closedThisCycle`/cooldown logic, or any other main-loop skip condition.

## Out of Scope

- Adding a mechanism to top up the fallback watchlist to a fixed count after held symbols are excluded (explicitly rejected — same reasoning as the prior change to `stock-selector.ts`: exclude only, do not refill).
- Adding blacklist or quality (change-percent/relative-volume) filtering to the fallback path — the blacklist check already exists downstream (~line 1554), and the static list has no market data to quality-filter on.
- Any change to `selectStocksForAnalysis()` or `src/lib/stock-selector.ts` — this fallback path was always designed to bypass that function entirely, and continues to do so after this change.
- Improving the fallback path's overall reliability or reducing how often it fires — out of scope; this spec only addresses what happens to held symbols on the (already rare) occasions it does fire.
