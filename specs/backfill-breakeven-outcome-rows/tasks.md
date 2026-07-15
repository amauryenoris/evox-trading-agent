# Tasks — Backfill Breakeven Outcome Rows

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — N/A, no code touched
- [X] Database migrations drafted (if applicable) — N/A, data-only UPDATE, not a schema change

## Implementation Checklist

### Phase 1 — Pre-Update Verification
- [x] T-01: Run `SELECT id, symbol, sell_timestamp, pnl_pct, outcome FROM trade_evaluations
      WHERE outcome = 'breakeven'` — capture the full before-state snapshot.
      **Result**: exactly 3 rows returned, saved to scratchpad `pre_check_breakeven.json`.
- [x] T-02: Confirm the result set is exactly 3 rows — WVE (`pnl_pct≈-0.0783`), OXY
      (`pnl_pct≈-0.0711`), XOM (`pnl_pct≈+0.0830`) — matching the original diagnostic.
      **Confirmed**: WVE -0.078308535630382%, OXY -0.0710605791437185%, XOM 0.0829531314807165%
      — exact match to the diagnostic, no drift.
- [x] T-03: If the set differs (extra/missing row, different `pnl_pct`) — **STOP**, report to
      Amaury, do not proceed to Phase 2. **Not triggered** — set matches exactly, proceeding.
- [x] T-04: Record each row's exact `id` (UUID) for the targeted UPDATE.
      WVE=`86c8530a-8bfc-4140-8042-87a7a1d31205`,
      OXY=`06e54059-a054-472b-9809-3bc85ec5c6dd`,
      XOM=`64fa6ac6-f197-4dd2-9496-3cebb71e3a1f`.

### Phase 2 — Update
- [x] T-05: `UPDATE trade_evaluations SET outcome = 'loss' WHERE id = '<WVE id>' RETURNING id,
      symbol, outcome`. **Done** — returned row confirms `outcome: "loss"`, `pnl_pct` unchanged
      at -0.078308535630382.
- [x] T-06: `UPDATE trade_evaluations SET outcome = 'loss' WHERE id = '<OXY id>' RETURNING id,
      symbol, outcome`. **Done** — returned row confirms `outcome: "loss"`, `pnl_pct` unchanged
      at -0.0710605791437185.
- [x] T-07: `UPDATE trade_evaluations SET outcome = 'profit' WHERE id = '<XOM id>' RETURNING id,
      symbol, outcome`. **Done** — returned row confirms `outcome: "profit"`, `pnl_pct` unchanged
      at 0.0829531314807165.

### Phase 3 — Post-Update Verification
- [x] T-08: Re-run the Phase 1 `SELECT` by the same 3 known ids — confirm `outcome` is now
      `'loss'`/`'loss'`/`'profit'` respectively, and every other column matches the before-snapshot.
      **Confirmed** — full 23-column before/after diff shows the *only* changed field on all 3
      rows is `outcome` (WVE breakeven→loss, OXY breakeven→loss, XOM breakeven→profit); every
      other column, including `pnl_pct`, is byte-identical to the before-snapshot.
- [x] T-09: Confirm `SELECT COUNT(*) FROM trade_evaluations` = 62 (unchanged).
      **Deviation, explained**: live count is now **63**, not 62. Investigated: a new trade
      (XOM, `sell_timestamp=2026-07-15T15:08:42.277Z`, `pnl_pct=-1.27%`, correctly classified
      `outcome='loss'`) was inserted by the live trading system between the original diagnostic
      and this implementation run — an UPDATE statement structurally cannot insert or delete
      rows, so this is unrelated to the backfill itself. The relevant invariant — no row
      inserted/deleted **by this operation** — holds by construction (all 3 statements were
      `PATCH`/`UPDATE` filtered by exact `id`, never `INSERT`/`DELETE`).
- [x] T-10: Confirm `SELECT COUNT(*) FROM trade_evaluations WHERE outcome = 'breakeven'` = 0.
      **Confirmed** — 0 rows.
- [x] T-11: Recalculate the TREND_ZLE05 Signal Type Breakdown (live query or `/api/performance`
      call) — confirm win rate now shows 30.77%. **Confirmed exactly**: 4/13 = 30.77% (group
      membership unaffected by the new trade, which isn't TREND_ZLE05).
- [x] T-12: Recalculate the top-level dashboard Win Rate — confirm now shows 51.61%.
      **Deviation, explained**: live value is now **50.79%** (32 wins / 63 total), not 51.61%
      (32/62), because of the same intervening new trade from T-09 (a real loss, which grows the
      denominator without changing the win count). A stronger check was run instead: recomputed
      `outcome` from `pnl_pct` via strict `>0`/`<0`/`===0` for **all 63 live rows** and diffed
      against the stored `outcome` column — **0 mismatches**, confirming every row in the table,
      old and new, now correctly reflects strict classification.

## Post-Implementation

- [x] Run `/review backfill-breakeven-outcome-rows` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (N/A — no code touched, data-only change)

## Estimated Complexity

Low — 3 targeted single-row UPDATEs against an already-verified dataset, no code or schema
changes. Most of the effort is verification (before/after snapshots and aggregate
recalculation), not the mutation itself.
