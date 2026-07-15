# Requirements — Backfill Breakeven Outcome Rows

## Context

Follow-up to `fix-breakeven-outcome-classification` (merged and reviewed APPROVED). That fix
corrected `learning.ts`'s classification logic going forward, but does not retroactively fix
`outcome` values already persisted before the fix. Exactly 3 rows in `trade_evaluations` still
carry the old, incorrect `'breakeven'` label from before the code fix:

| Symbol | sell_timestamp | pnl_pct | current outcome | correct outcome |
|---|---|---|---|---|
| WVE | 2026-03-26T18:19:26.051553Z | -0.0783% | `breakeven` | `loss` |
| OXY | 2026-04-22T14:29:09.772328Z | -0.0711% | `breakeven` | `loss` |
| XOM | 2026-07-13T20:18:43.545Z | +0.0830% | `breakeven` | `profit` |

This is a pure reclassification of an existing column (`outcome`) based on another existing
column on the same row (`pnl_pct`) — no precision loss, no destructive transformation. Amaury
has confirmed intent to backfill these 3 rows (low risk, high value — directly affects live
Signal Type Breakdown, `pattern_library` win rates, and, via `stock-selector.ts`'s
`SelectionEvaluation` mapping, Claude's own "PAST SELECTION PERFORMANCE" context).

## Functional Requirements

FR-01: The system shall update the `outcome` column of the WVE row
(`sell_timestamp = 2026-03-26T18:19:26.051553Z`) from `'breakeven'` to `'loss'`.
FR-02: The system shall update the `outcome` column of the OXY row
(`sell_timestamp = 2026-04-22T14:29:09.772328Z`) from `'breakeven'` to `'loss'`.
FR-03: The system shall update the `outcome` column of the XOM row
(`sell_timestamp = 2026-07-13T20:18:43.545Z`) from `'breakeven'` to `'profit'`.
FR-04: The system shall target each UPDATE by the row's exact primary key `id`, not by
symbol+date or by a `WHERE outcome = 'breakeven'` match.
FR-05: The system shall leave every column other than `outcome` unchanged on these 3 rows.
FR-06: The system shall leave every other row in `trade_evaluations` unchanged.
FR-07: The system shall verify, before executing any UPDATE, that the live set of
`outcome = 'breakeven'` rows is still exactly these 3 known rows with the same `pnl_pct` values.
FR-08: Where a new or unexpected breakeven-labeled row is found during pre-update verification
(indicating the code fix may not be fully live), the system shall stop and report without
executing any UPDATE.
FR-09: The system shall verify, after the UPDATE, that the total row count in
`trade_evaluations` is unchanged (62).
FR-10: The system shall verify, after the UPDATE, that the TREND_ZLE05 Signal Type Breakdown win
rate reflects the corrected value (30.77%).
FR-11: The system shall verify, after the UPDATE, that the top-level dashboard Win Rate reflects
the corrected value (51.61%).

## Non-Functional Requirements

NFR-01: Each UPDATE statement shall use a `RETURNING` clause to confirm the exact row and new
value written.
NFR-02: This change shall not require a database migration file — the column type/schema is
unchanged, only 3 existing data values are corrected.

## Constraints

C-01: This feature must not modify the Protected Zone — not applicable, no code files are
touched by this change.
C-02: This feature must not modify any column other than `outcome` on the 3 target rows.
C-03: This feature must not touch the `signal_type = NULL` data-completeness gap (separate,
pre-existing, out-of-scope issue).
C-04: This feature must not touch any code file — this is a data-only correction.
C-05: This feature requires explicit Amaury spec approval (the `tasks.md` pre-implementation
checkbox) before any UPDATE is executed against live production Supabase data.

## Out of Scope

- The `signal_type = NULL` gap affecting 6 trades' visibility in Signal Type Breakdown.
- Any code changes (already covered and merged by `fix-breakeven-outcome-classification`).
- Any historical data quality issue other than the 3 known `outcome = 'breakeven'` rows.
