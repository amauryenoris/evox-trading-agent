# Requirements — Fix Breakeven Outcome Classification

## Context

Confirmed via a prior read-only diagnostic (this session): `src/lib/learning.ts:70-71` classifies
a closed trade's `outcome` using `pnlPct > 0.1 ? 'profit' : pnlPct < -0.1 ? 'loss' : 'breakeven'`
— a 0.1 percentage-point buffer, not a strict zero comparison. This mislabels small genuine
wins/losses as `'breakeven'`. Live impact confirmed: 3 of 62 trades in `trade_evaluations`
(WVE -0.078%, OXY -0.071%, XOM +0.083%) carry `outcome='breakeven'` despite being real,
nonzero-P&L closed trades. This field is computed once at trade-close and persisted — never
recomputed on read — and is read as the source of truth by 6 downstream consumers (weekly PDF
top-level stats, weekly PDF Signal Type Breakdown, dashboard top-level stats, dashboard Signal
Type Breakdown, `pattern_library` win tracking, and `stock-selector.ts`'s
`SelectionEvaluation.outcome` mapping — the last of which feeds Claude's own
"PAST SELECTION PERFORMANCE" learning context).

## Functional Requirements

FR-01: The system shall classify a closed trade's outcome as `'profit'` when `pnl_pct` is
strictly greater than 0.
FR-02: The system shall classify a closed trade's outcome as `'loss'` when `pnl_pct` is strictly
less than 0.
FR-03: The system shall classify a closed trade's outcome as `'breakeven'` when `pnl_pct` is
exactly 0.
FR-04: The system shall persist the corrected outcome value to `trade_evaluations.outcome` at
trade-close time, as it does today.
FR-05: Where the `outcome` column is NULL on read, the system shall not silently default to
`'breakeven'`.
FR-06: The system shall preserve the existing 3-value `outcome` type
(`'profit' | 'loss' | 'breakeven'`) in `types.ts` without modification.
FR-07: The system shall ensure every downstream consumer of `TradeEvaluation.outcome`
(`report-generator.ts` top-level stats, `report-generator.ts` Signal Type Breakdown,
`performance/route.ts` top-level stats, `performance/route.ts` Signal Type Breakdown,
`learning.ts`'s pattern-library win tracking, `stock-selector.ts`'s `SelectionEvaluation`
mapping) reflects the corrected classification without requiring changes to those consumers
themselves, given they already read `.outcome` as their source of truth.
FR-08: The system shall verify boundary behavior at `pnl_pct` exactly 0, immediately above 0,
and immediately below 0 via automated tests.

## Non-Functional Requirements

NFR-01: The fix shall not alter the `TradeEvaluation.outcome` type signature.
NFR-02: The fix shall not introduce a new named threshold constant — the corrected logic
requires no non-zero threshold value.
NFR-03: The fix shall not modify any historical row in `trade_evaluations` — data backfill for
the 3 known-affected rows is a separate follow-up, not part of this spec.

## Constraints

C-01: This feature must not modify the Protected Zone (`claude-agent.ts`, `risk-manager.ts`,
`indicators.ts`, `watchlist-monitor.ts`, `news-intelligence.ts`) — confirmed not needed for this
fix.
C-02: This feature must not modify `TradeHistoryTable.tsx`'s P&L% color logic — it already
computes color from `pnlPct` directly, independent of `.outcome`.
C-03: This feature must not fix the `signal_type = NULL` data-completeness gap (6 trades,
including WVE) — a separate, pre-existing issue.
C-04: This feature must not backfill or update historical `trade_evaluations` rows — reserved
for a separate follow-up spec/prompt, only after this code-level fix is reviewed and approved.

## Out of Scope

- Historical data backfill for the 3 known-affected rows (WVE, OXY, XOM) — separate follow-up.
- The `signal_type = NULL` gap affecting 6 trades' visibility in Signal Type Breakdown.
- Any Protected Zone file changes.
- Any UI/display component changes beyond what's inherited automatically once the source field
  (`TradeEvaluation.outcome`) is corrected — no consumer code changes are expected unless
  investigation in Phase 1 (tasks.md) finds an undocumented independent threshold elsewhere.
