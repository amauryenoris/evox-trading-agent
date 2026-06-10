# Requirements — Fix P&L% ×100 Display Bug in TradeHistoryTable

## Context

`trade_evaluations.pnl_pct` is written exclusively by `evaluateClosedTrade()` (`src/lib/learning.ts:65`) as `((sellPrice - buyPrice) / buyPrice) * 100` — i.e. already a percentage (verified in DB: NEM = -5.645, UUUU = -6.192). `TradeHistoryTable.tsx:43` multiplies this value by 100 again before rendering, producing displays like -564.54% instead of -5.65%. `PerformanceAnalytics.tsx` and `/api/performance` consume the same field without multiplying and display correctly.

## Functional Requirements

FR-01: The system shall display the P&L% column in the Trade History table using the `pnlPct` value from `trade_evaluations` without applying any additional ×100 multiplication.

FR-02: The system shall display -5.65% for the NEM losing trade (stored `pnl_pct` = -5.6453984122317) when the Trade History table is rendered.

FR-03: The system shall display -6.19% for the UUUU losing trade (stored `pnl_pct` = -6.19185113891563) when the Trade History table is rendered.

FR-04: The system shall preserve the existing sign-prefix behavior ('+' for profits, none for losses) when rendering the P&L% column.

FR-05: The system shall preserve the existing color-coding behavior (green for profit, red for loss, muted for zero) when rendering the P&L% column.

## Non-Functional Requirements

NFR-01: After the change, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After the change, `npm run build` shall complete successfully.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.

C-02: Only `src/components/dashboard/TradeHistoryTable.tsx` shall be modified. No other file may change.

C-03: The `isProfit` / `isLoss` derivation and the render expression `{pnlPct.toFixed(2)}%` shall remain structurally unchanged — only the `pnlPct` constant assignment changes.

## Out of Scope

- `PerformanceAnalytics.tsx` — already correct; do not touch.
- `src/app/api/performance/route.ts` — already correct; do not touch.
- The unit inconsistency in `agent_log.indicators.pnlPct` (claude-agent.ts:981 stores a fraction there) — different table, different consumer, not displayed by TradeHistoryTable.
- Backfilling or normalizing `pnl_pct` units in the database.
- Adding unit-labeling conventions (e.g. renaming fields to `pnlPctX100`) — a future refactor concern.
