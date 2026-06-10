# Tasks — Fix P&L% ×100 Display Bug in TradeHistoryTable

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A — dashboard component, touch-freely zone)
- [x] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 1 — UI fix

- [x] T-01: In `src/components/dashboard/TradeHistoryTable.tsx` line 43, replace:

  ```ts
  const pnlPct = t.pnlPct * 100
  ```

  with:

  ```ts
  const pnlPct = t.pnlPct
  ```

  Do NOT touch `isProfit`, `isLoss`, or the render expression `{pnlPct.toFixed(2)}%`.

### Phase 2 — Verification

- [x] T-02: Run `npx tsc --noEmit` — must produce zero errors.

- [x] T-03: Run `npm run build` — must complete successfully.

- [x] T-04: Verify expected display values against live DB rows:
  - NEM (pnl_pct = -5.6453984…) → renders **-5.65%** (not -564.54%)
  - UUUU (pnl_pct = -6.1918511…) → renders **-6.19%** (not -619.19%)

  Static verification is acceptable: `-5.6453984.toFixed(2)` → `"-5.65"`; sign/color logic unchanged because the sign of the value is unchanged.

### Phase 3 — Testing

- [x] T-05: No new test required — the component has no existing test file and the change is a one-line constant assignment with no new logic branch. If a test is desired, it belongs to a broader dashboard-component testing effort (out of scope).

## Post-Implementation

- [x] Run /review fix-pnl-pct-trade-history to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged
- [x] Confirm PerformanceAnalytics.tsx and /api/performance/route.ts unchanged

## Estimated Complexity

**Low** — One-line change in a single dashboard component; no logic, type, API, or DB changes.
