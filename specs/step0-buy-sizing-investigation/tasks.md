# Tasks — STEP 0: BUY Sizing and Portfolio Limits Investigation (read-only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A — read-only; Protected Zone files are only read)
- [x] Database migrations drafted (N/A — none)
- [x] O-1 to O-5 answered (report location, DB access method, workflow logs, simulation model, trade population)

## Implementation Checklist

### Phase 1 — Setup and data extraction
- [x] T-01: Confirm `.tmp/` is gitignored and that no tracked file will change (`git status` clean before and after).
- [x] T-02: Write `.tmp/step0-trades.ts`: load env without printing it, SELECT closed trades (`trade_evaluations`), the matching `agent_log` BUY rows and `open_position_contexts`; build one table with equity source per row.
- [x] T-03: Resolve the effective `RISK_PCT`, `STOP_LOSS_PCT`, `MAX_POSITION_SIZE`, `MAX_POSITIONS` from `.github/workflows/*.yml` and code defaults; say what could not be seen.

### Phase 2 — Code analysis (tasks 1–3 of the brief)
- [x] T-04: Factor table with file:line for the quantity formula (FR-01…FR-08), including whether 3DAY and EMA_RECLAIM share the MR path and how the ranking path differs.
- [x] T-05: ATR percentile explanation (window, ranking population, definition, where sizing uses it) and the CRWV 0.12 vs 9.8% explanation with a recomputation from `daily_bars` (FR-09…FR-12).
- [x] T-06: Portfolio-limit findings: limits with values and compared quantities, `SECTOR_MAP`/`OTHER` behavior, whether the total-risk gate can bind, and the SOFI/FCX/UUUU/CRWV/MP explanation (FR-13…FR-17).

### Phase 3 — Reconstructions and stops (tasks 4–5)
- [x] T-07: Reconstruct MP ×2, SOFI, FCX, UUUU, CRWV ×2, INTC ×2, NVDA, TSLA, EWZ, NKE; compare formula / requested / filled; flag differences and the effect of IOC partial fills and retries (FR-18…FR-22).
- [x] T-08: Document the initial stop, trailing and Capa-B rules (FR-23, FR-24).
- [x] T-09: `.tmp/step0-stops.ts`: Alpaca GET order history for INTC 2026-10-13 and UUUU 2026-10-15; stop type/prices/status/fills, previous-close-to-open gap, classification of each loss (FR-25…FR-28).
- [x] T-10: Report the stop type and prices currently on the open positions (GET only) (FR-29).

### Phase 4 — Aggregates (tasks 6–8)
- [x] T-11: Sizing table by setup, z, ATR percentile, absolute ATR%, confidence and regime; size-vs-pnl correlation per setup; share of dollar pnl from positions above 7% of equity; small-n caveats (FR-30…FR-36).
- [x] T-12: Dollar-risk table for closed trades and the current book (FR-37, FR-38).
- [x] T-13: Gap-risk tables from `daily_bars` and the closed-trade loss-versus-stop analysis, including the 09:30–10:00 ET count (FR-39…FR-42).

### Phase 5 — Simulation and opening window (tasks 9–10)
- [x] T-14: `.tmp/step0-sim.ts`: schemes (a)–(e), per-setup totals, drawdown, worst loss, cap share, assumptions and caveats (FR-43…FR-47).
- [x] T-15: `.tmp/step0-open-window.ts`: 1-minute bars for the opening-window losses; differences at 09:35, 09:45, 10:00 and close; cases where waiting was worse; designs that need a Protected Zone file (FR-48…FR-52).

### Phase 6 — Draft CHANGE and report (task 11)
- [x] T-16: Draft two to three options with trade-offs, Protected Zone files touched, percentile-vs-absolute-ATR answer, tests, rollback, effect on open positions, recommendation (FR-53…FR-57).
- [x] T-17: Mark each hypothesis confirmed / refuted / inconclusive; label findings confirmed / plausible / unknown; list brief figures that do not reproduce and items "not checked" with reasons (FR-58…FR-61).
- [x] T-18: Assemble the report in the agreed location (O-1) with the deliverable sections in the order the brief lists them.

### Phase 7 — Verification
- [x] T-19: `git status` shows no tracked file modified; no secret printed in any output; all Alpaca calls were GET and all database statements were SELECT.

## Post-Implementation

- [x] Run /review step0-buy-sizing-investigation to verify the report matches the spec
- [x] Confirm Protected Zone files unchanged

## Estimated Complexity

**Medium–High** — no code changes, but eleven analyses over several data sources (code, Supabase, Alpaca orders and 1-minute bars), a simulation with stated assumptions, and a small-sample caveat on every number. The effort is data volume and care about what each figure can and cannot show.
