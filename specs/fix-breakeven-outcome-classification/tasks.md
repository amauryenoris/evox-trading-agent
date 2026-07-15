# Tasks — Fix Breakeven Outcome Classification

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — N/A, none touched
- [X] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Verify first (read-only, no edits)
- [x] T-01: Show `learning.ts:60-75` verbatim — confirm no drift since the diagnostic.
      **Result: no drift.** Line 70-71 unchanged: `pnlPct > 0.1 ? 'profit' : pnlPct < -0.1 ? 'loss' : 'breakeven'`.
- [x] T-02: Show `db.ts:305-320` verbatim — confirm the NULL-fallback context, and check whether
      the `outcome` column carries a `NOT NULL` constraint (migration history / schema) to inform
      the Phase 2 fallback decision.
      **Result: no drift** — line 313 unchanged: `outcome: row.outcome ?? 'breakeven'`. No CREATE TABLE
      migration for `trade_evaluations` exists locally (table predates migration tracking, consistent
      with the prior session's migration-drift finding), and no `exec_sql`-style RPC is exposed via
      PostgREST to query `information_schema` directly — **could not confirm NOT NULL constraint
      status with certainty**. Live data confirms 0 NULL rows out of 62 today. Flagging this as a
      decision point for Amaury rather than guessing (see implementation report).
- [x] T-03: Show `stock-selector.ts:165-185` verbatim — confirm exactly how
      `SelectionEvaluation.outcome` flows into the `"PAST SELECTION PERFORMANCE"` prompt string,
      to confirm the fix flows through correctly without a code change there.
      **Result: confirmed.** `recordSelectionOutcome` (line 174-177) maps `evaluation.outcome`
      directly (`'profit'→'profitable'`, `'loss'→'loss'`, else `'no_trade'`) — no independent
      threshold, reads `.outcome` only. No code change needed here; it auto-corrects once
      `learning.ts:70-71` is fixed.
- [x] T-04: Confirm `types.ts`'s `outcome: 'profit' | 'loss' | 'breakeven'` needs no change —
      only the assignment logic in `learning.ts` changes.
      **Result: confirmed**, type unchanged (verified in original diagnostic, `types.ts:221`).

### Phase 2 — Source-of-truth fix
- [x] T-05: `learning.ts:70-71` — change to strict
      `pnlPct > 0 ? 'profit' : pnlPct < 0 ? 'loss' : 'breakeven'`, removing the `0.1` magic
      number entirely (no replacement threshold constant). Approved by Amaury (Protected Zone
      confirmation, since `learning.ts` is on the CLAUDE.md File Permission Matrix).
- [x] T-06: `db.ts:313` — replaced the `?? 'breakeven'` NULL fallback with: log a `console.warn`
      naming the row id, then derive the outcome from `row.pnl_pct` on the same row using the
      same strict comparison; only falls back to `'breakeven'` (with the warning already logged)
      if `pnl_pct` is also unavailable. Approved by Amaury.

### Phase 3 — Downstream verification (changes only if a real gap is found)
- [x] T-07: Confirm `report-generator.ts:180-188` and `:308-322` require no code change (read
      `.outcome` only, no independent threshold). **Confirmed** — grep for `0.1`/`breakeven` in
      the file: no matches beyond reading the field.
- [x] T-08: Confirm `performance/route.ts:20-36` and `:39-71` require no code change (same).
      **Confirmed** — no independent threshold.
- [x] T-09: Confirm `learning.ts:204` (`updatePatternLibrary`'s `isWin`) requires no code change
      (reads `evaluation.outcome` only). **Confirmed** — `isWin = evaluation.outcome === 'profit'`,
      no independent threshold.
- [x] T-10: Confirm `stock-selector.ts:174-177` requires no code change (reads
      `evaluation.outcome` only). **Confirmed** — grep for `0.1`/`breakeven` in the file: no
      matches beyond reading the field.
- [x] T-11: If any of T-07–T-10 finds an undocumented independent near-zero threshold beyond
      reading `.outcome`, fix that specific spot and note the deviation here.
      **No deviation needed** — all 4 consumers correctly inherit the fix automatically.

### Phase 4 — Testing
- [x] T-12: Add unit tests for `learning.ts`'s outcome computation: `pnlPct=0.083 → 'profit'`,
      `pnlPct=-0.071 → 'loss'`, `pnlPct=0 → 'breakeven'`, plus boundary cases immediately above
      and below 0. — `src/lib/__tests__/outcome-classification.test.ts`.
- [x] T-13: Add/extend a test verifying the Signal Type Breakdown recalculates the TREND_ZLE05
      win rate to 30.77% (not 23.08%) against the known 13-trade fixture once fed corrected
      outcome values. — same file, using real WVE/OXY/XOM values plus a representative 13-trade
      TREND_ZLE05 fixture reproducing the documented 23.08%→30.77% shift exactly.
- [x] T-14: Verify `stock-selector.ts`'s `SelectionEvaluation` mapping no longer produces
      `'no_trade'` for a genuinely-executed trade with nonzero `pnlPct`.
- [x] T-15: Run `npx tsc --noEmit` — **passed clean**.
- [x] T-16: Run `npm run build` — **passed clean** (Next.js 16.2.1, all routes compiled).
- [x] T-17: Run the full test suite — **248/248 tests passed across 23 test files** (12 new,
      236 pre-existing, zero regressions).

## Post-Implementation

- [x] Run `/review fix-breakeven-outcome-classification` to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (except `learning.ts`, explicitly approved — see review.md)

## Estimated Complexity

Low-Medium — the core fix is a single comparison-operator change plus one NULL-fallback
decision, touching 2 files. The apparent breadth (6 "consumers") is verification-only work,
since they already read the corrected field rather than needing independent code changes.
Historical data backfill (3 known-affected rows) is explicitly out of scope for this spec.
