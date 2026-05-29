# Requirements — Pool A Pre-Filter

## Context

Currently `selectStocksForAnalysis()` sends up to 30 raw screener candidates to Claude. Claude selects 6–8 symbols but Pool B (sector watchlist) mandates at least 1 per sector (3 slots). This leaves only 3 effective Pool A slots. Overbought screener stocks (e.g. SMCI z=+4.3, PLTR z=+3.4) waste those slots while better candidates like NEM go unanalyzed.

---

## Functional Requirements

FR-01: The system shall remove instruments present in `INSTRUMENT_BLACKLIST` from Pool A candidates before passing them to Claude.

FR-02: The system shall remove symbols with an open position from Pool A candidates before passing them to Claude.

FR-03: The system shall remove Pool A candidates whose absolute daily change percent is greater than or equal to 15 from the pool before passing them to Claude.

FR-04: The system shall sort the remaining Pool A candidates so that symbols with a prior profitable selection outcome (`outcome === 'profitable'`) or a positive net P&L (`pnlPct > 0`) appear before symbols with no recorded outcome or a loss outcome. Both conditions count as "good history" because a trade can close profitable by price but be recorded as `'loss'` due to outcome labeling lag.

FR-05: The system shall truncate the sorted Pool A candidate list to a maximum of 15 symbols before passing it to Claude.

FR-06: The system shall apply the five pre-filter steps in this fixed order: blacklist removal → open position removal → overbought removal → history-based sort → truncation.

FR-07: The system shall continue to pass all Pool B (sector watchlist) symbols to Claude unchanged, regardless of pre-filter results on Pool A.

FR-08: The system shall continue to request 6–8 symbol selections from Claude after pre-filtering, with no change to the prompt or response schema.

---

## Non-Functional Requirements

NFR-01: The pre-filter must not introduce additional external API calls — it must use data already fetched within `selectStocksForAnalysis()`.

NFR-02: The pre-filter must complete synchronously (no `await`) for Steps 1–3; Step 4 uses the `selectionEvals` already fetched via the existing `getSelectionEvaluations(50)` call.

---

## Constraints

C-01: This feature must not modify the prompt sent to Claude, the number of symbols requested, or the JSON response schema.

C-02: This feature must not modify Pool B (sector watchlist) logic, `getStockSnapshots()`, or any downstream trading logic.

C-03: This feature does not touch any Protected Zone file (`config.ts` is imported read-only; `claude-agent.ts`, `risk-manager.ts`, `indicators.ts` are untouched).

---

## Out of Scope

- Filtering based on Kalman z-score (z-scores are not available at selection time — indicators are computed after selection)
- Filtering based on market regime or news sentiment (both run after selection)
- Changes to how Pool B symbols are fetched or displayed
- Changes to `recordSelectionOutcome()` or the learning loop
- Filtering Pool B symbols with the same rules
