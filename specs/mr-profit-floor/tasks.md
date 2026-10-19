# Tasks — MEAN_REVERSION Profit Floor

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone change confirmed: `src/lib/claude-agent.ts` (trailing block, sell-now path, `toExitReason`) **and** the out-of-range edits listed in O-7
- [x] O-1 answered (persistence needs `db.ts` + `types.ts`; fail-fast #2 is triggered)
- [x] O-2 answered (1-minute peak sampling needs an additive `alpaca.ts` change, or stays per-cycle)
- [x] O-3, O-4, O-8 answered (entry basis, legacy activated MR positions, exit guard for other setups)
- [x] Database migrations drafted (N/A — no schema change)

## Implementation Checklist

### Phase 1 — Pure module (no Protected Zone) — TDD: tests first
- [x] T-01: Create `src/lib/__tests__/protective-stop.test.ts` (RED): inactive below +5%; high +5.5% → stop +3%; +6% → +3%; +7% → +4%; +8.14% → +5.14%; +12% → +9%; tick rounding (down, 0.01 ≥ $1, 0.0001 < $1); never lower than `existingStop`; strictly-higher-by-a-tick `replace`; equal or sub-tick → `none`; `place` when no existing stop; `current <= stop` → `sell_now`; setup not in config unchanged; empty config unchanged; non-finite / non-positive inputs; inputs and config not mutated.
- [x] T-02: Create `src/lib/protective-stop.ts`: `PROFIT_FLOOR_CONFIG`, tick helper, `computeProtectiveStop` (GREEN).
- [x] T-03: Add to `protective-stop.ts`: `PROFIT_TARGET_PCT` (10% default, `TREND_ZLE05` 5%), `getProfitTargetPct(setup)`, `TRAILING_ACTIVATION_PCT` (values copied unchanged from `claude-agent.ts:340-348`); confirm no server imports. Tests for the profit target getter.

### Phase 2 — Exit engine (⚠️ Protected Zone — only after confirmation)
- [x] T-04: Write `mr-profit-floor-exit-rules.test.ts` (RED) with Alpaca/db mocks, modeled on `trailing-stop-exit-reason-guard.test.ts`: MR submits `stop` GTC (not stop-limit); no cancel/create when the stop is unchanged; no order moves when target / 20-day / setup exit already set `exitReason`; `highSinceEntry` still persisted then; floor works with ATR null; `sell_now` text and `closePosition`; `toExitReason` → `TRAILING_STOP` / `nextTradingDay1`; other setups still stop-limit with rounded, strictly-higher replacement; Capa A price and Capa B unchanged.
- [x] T-05: `claude-agent.ts`: replace the local `PROFIT_TARGET_PCT` with the shared import (O-7).
- [x] T-06: `claude-agent.ts`: in the trailing block, add the MR branch before the ATR guard calling `computeProtectiveStop`; reuse the existing cancel / `submitStopWithRetry` / naked-alert / persistence code for place and replace; skip broker calls when `exitReason` is set; self-heal when no `trailingStopOrderId`.
- [x] T-07: `claude-agent.ts`: `sell_now` → `exitReason = "Exit rule: profit floor $X (+Y%) breached"` (only if unset); extend `toExitReason()` with the profit-floor match placed before the other branches; keep it mapped to `TRAILING_STOP`.
- [x] T-08: `claude-agent.ts`: other setups — round `trailingStop` down to the tick, replace only when strictly higher by one tick, round the limit (O-9), apply the `exitReason` guard per O-8. Remove the dead MR keys from the local ATR/activation maps; use the shared activation table.
- [x] T-09: `claude-agent.ts`: add `profitFloor=$X` to the HOLD reasoning string for an active MR position (O-7).
- [x] T-10: Update existing tests only if the tick rounding / import move requires it (no behavior assertion changes).

### Phase 3 — Persistence (BLOCKED until O-1 is approved)
- [x] T-11: Test the persisted shape: `{ design:'R', activationPct, floorPct, ratchetPp, activatedAt, highPct, stopPrice, stopOrderId }`, refreshed on place/replace, `activatedAt` preserved, other `indicators` keys untouched, persist failure does not abort order handling.
- [x] T-12: `types.ts`: `ProtectiveStopSnapshot` + `TechnicalIndicators.protectiveStop?`.
- [x] T-13: `db.ts`: new function merging `protectiveStop` into `open_position_contexts.indicators`; `updatePositionContext` unchanged.
- [x] T-14: `claude-agent.ts`: call it when the stop is placed or replaced (after the order id is known).

### Phase 4 — Peak accuracy (only if O-2 approved; else mark N/A and report "sampling unchanged")
- [x] T-15: Test: one bars request per position per check, regular-session max high since `max(buyTimestamp, session open)`, never lowers `highSinceEntry`, falls back to the cycle price on failure.
- [x] T-16: `alpaca.ts`: additive `'1Min'` timeframe and ISO `start` in `getBars` (existing callers untouched).
- [x] T-17: `claude-agent.ts`: use the 1-minute high in PASO 1 for open positions.

### Phase 5 — API and Dashboard (not Protected Zone)
- [x] T-18: `types.ts` `PositionDisplay.profitTargetPct`; `api/positions/route.ts` fills it from `getProfitTargetPct`.
- [x] T-19: Write dashboard text tests (RED). Use `renderToStaticMarkup` from `react-dom/server` (no new dependency); if the Vitest config does not include `.tsx`, fall back to testing the label strings through exported pure helpers.
- [x] T-20: `PositionsTable.tsx`: remove the local `ACTIVATION_PCT`, import the shared config; MR → "Profit lock inactive - activates at +5%" / "Floor $X (+Y%)"; other setups keep the current trail text; profit target per setup.
- [x] T-21: `AgentReasoningLog.tsx`: per-setup target text (~384, setup parsed from `signalType=`); "Floor" label and `profitFloor=` regex (~406-416).

### Phase 6 — Verification
- [x] T-22: `npx tsc --noEmit` clean.
- [x] T-23: `npx vitest run` — full suite green.
- [x] T-24: `npm run test:coverage` / per-file coverage ≥ 80% on new code, 100% branches on `protective-stop.ts`.
- [x] T-25: `npm run build` green.
- [x] T-26: Show the full diff (`git diff`).
- [x] T-27: Final report states plainly: no live order was placed; what could not be run (live Alpaca stop behavior, the cron workflows, any SIP bars call); and what to watch on the first live day — one open sell order per position, no repeated cancel/create at the same price, `trailing_stop_order_id` set when the floor activates, no stop above the current price, `protectiveStop` stored (if O-1 approved).

## Post-Implementation

- [x] Run `/review mr-profit-floor` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged except `claude-agent.ts` within the approved edits (`config.ts` and all others untouched)
- [x] Rollback check: `PROFIT_FLOOR_CONFIG = {}` leaves MR with no active floor

## Estimated Complexity

**High** — live-capital exit logic and broker orders in the Protected Zone, a persistence path that needs a `db.ts`/`types.ts` decision, and behavior changes (tick rounding, strict replacement) that also touch the other setups' trailing. The pure module itself is Low; the risk is in the integration inside a block that currently has no tests for the order-move ordering.
