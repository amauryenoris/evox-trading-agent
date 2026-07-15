# Design — Fix Breakeven Outcome Classification

## Architecture Decision

This is a single-source-of-truth fix. The only place `outcome` is *computed* is
`src/lib/learning.ts`'s `evaluateClosedTrade()` (line 70-71); everywhere else in the codebase
(`report-generator.ts`, `performance/route.ts`, `learning.ts:204`'s `updatePatternLibrary`,
`stock-selector.ts`'s `recordSelectionOutcome`) *reads* `TradeEvaluation.outcome` as an opaque
already-classified value and does not re-derive it from `pnl_pct`. Correcting the comparison at
`learning.ts:70-71` therefore propagates to every downstream consumer without touching them,
**provided** none of them turns out to have its own independent near-zero threshold hiding
somewhere — which is why Phase 1 of `tasks.md` is a verification pass, not an assumption.

The one secondary write path is `src/lib/db.ts:313`, a read-time fallback
(`row.outcome ?? 'breakeven'`) for a NULL `outcome` column. This is a second, independent place
that can produce a `'breakeven'` label and must be corrected in the same pass, even though no
NULL rows exist today (confirmed live: `outcome IS NULL` count = 0 across all 62 rows).

## Data Flow

1. A position closes → `evaluateClosedTrade(closedCtx, sellPrice, sellTimestamp)` computes
   `pnlPct` (already a percentage number, e.g. `0.083` for +0.083%) and derives `outcome` via the
   corrected strict comparison.
2. `insertTradeEvaluation(evaluation)` (`db.ts:228-252`) persists `evaluation.outcome` verbatim
   to `trade_evaluations.outcome`.
3. `getTradeEvaluations()` (`db.ts:266-315`) reads the row back; the NULL-fallback branch at
   line 313 is corrected so it can no longer silently mislabel a trade.
4. Every consumer (weekly PDF report, dashboard `/api/performance`, pattern library, stock
   selector) reads `TradeEvaluation.outcome` unchanged — no code changes needed in those files,
   pending the Phase 1 verification.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep the 0.1% buffer but promote it to a named, documented constant | Preserves "near-zero" as an intentional smoothing zone | Doesn't fix the actual problem — real small wins/losses still vanish from win/loss stats | Rejected |
| Switch to strict `pnlPct > 0` / `< 0`, `'breakeven'` reserved for exact `0` | Matches the confirmed intent; removes the magic number entirely; in practice `'breakeven'` becomes vanishingly rare (float equality to exactly 0) | `'breakeven'` becomes an almost-dead branch | **Chosen** |
| Remove `'breakeven'` as a category, collapse to a 2-value type | Simplest possible long-term model | Explicitly out of scope — type must stay 3-value per constraint | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `src/lib/learning.ts` | MODIFY | Line 70-71: strict `pnlPct > 0 ? 'profit' : pnlPct < 0 ? 'loss' : 'breakeven'`, removing the `0.1` magic number. |
| `src/lib/db.ts` | MODIFY | Line 313: replace the `?? 'breakeven'` NULL fallback with a non-silent alternative — exact approach (log-and-surface vs. derive from `pnl_pct` on the same row) is a Phase 1 decision, documented in `tasks.md`, not guessed here. |
| `src/lib/report-generator.ts` | NONE (pending verification) | Reads `.outcome` only at lines 180-188 and 308-322 — no independent threshold found in the original diagnostic. |
| `src/app/api/performance/route.ts` | NONE (pending verification) | Reads `.outcome` only at lines 20-36 and 39-71 — same. |
| `src/lib/stock-selector.ts` | NONE (pending verification) | `recordSelectionOutcome` (line 174-177) maps `evaluation.outcome` directly — no independent threshold. |
| `src/lib/types.ts` | NONE | 3-value `outcome` type preserved unchanged (constraint FR-06). |
| `src/components/dashboard/TradeHistoryTable.tsx` | NONE | P&L% color already computed from `pnlPct` directly (line 44-45); the Outcome badge (line 63-69) auto-corrects once the source field is fixed. |
| `src/lib/__tests__/*` | CREATE/MODIFY | New boundary tests for `learning.ts`'s outcome computation, plus a Signal Type Breakdown recalculation test against the known 13-trade TREND_ZLE05 sample. |

## Protected Zone Impact

None — `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `watchlist-monitor.ts`, and
`news-intelligence.ts` are not touched by this fix.

## Database Changes

None. Only application-level classification logic changes; the `outcome` column's type/schema
is untouched. Correcting the 3 known-affected historical rows is explicitly deferred to a
separate follow-up (not this spec).

## Open Questions

- Exact remediation for `db.ts:313`'s NULL fallback: log-and-throw, derive from `pnl_pct` on the
  same row (if present), or another safe default — needs a quick check during Phase 1 of
  whether the `outcome` column has a `NOT NULL` DB constraint (which would make this branch
  currently unreachable in practice) before deciding the least-surprising behavior. Documented
  as the first implementation task rather than guessed here.
