# Review Report — Fix Trade History (Alpaca orders → trade_evaluations)

**Date**: 2026-06-05
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `/api/trades` serves data from `trade_evaluations` | ✅ | `route.ts` calls `getTradeEvaluations(50)` from `db.ts` |
| FR-02 | Returns 50 most recent closed trades, `sell_timestamp` DESC | ✅ | `getTradeEvaluations(50)` — `db.ts:266-267` applies `order('sell_timestamp', ascending:false).limit(50)` |
| FR-03 | One row per closed trade with entry + exit data | ✅ | Each `TradeEvaluation` row has both `buyPrice` and `sellPrice` |
| FR-04 | Trade close date from `sellTimestamp` per row | ✅ | `TradeHistoryTable.tsx:37-42` — formatted ET date from `t.sellTimestamp` |
| FR-05 | Symbol displayed per row | ✅ | `t.symbol` at line 50 |
| FR-06 | Signal type via `SignalBadge` | ✅ | `<SignalBadge signal={t.signal_type ?? null} size="xs" />` at line 52 |
| FR-07 | Entry price (`buyPrice`) as currency | ✅ | `${t.buyPrice.toFixed(2)}` at line 54 |
| FR-08 | Exit price (`sellPrice`) as currency | ✅ | `${t.sellPrice.toFixed(2)}` at line 55 |
| FR-09 | Quantity displayed | ✅ | `t.quantity` at line 56 |
| FR-10 | `pnlPct` as percentage, green/red by sign | ✅ | Lines 57-61 — `isProfit`/`isLoss` flags drive `text-green`/`text-red` classes; `+` prefix added for positive |
| FR-11 | Outcome color-coded badge | ✅ | Lines 63-69 — `Badge` tone: profit=green, loss=red, breakeven=neutral |
| FR-12 | Dashboard page passes `TradeEvaluation[]` | ✅ | `page.tsx` uses `fetchJSON<TradeEvaluation[]>` and `<TradeHistoryTable trades={trades} />` |
| NFR-01 | Zero TypeScript errors | ✅ | `npm run build` passed clean |
| NFR-02 | No `AlpacaOrder` references in modified files | ✅ | Grep confirmed 0 matches across all 3 files |
| C-01 | `getTradeEvaluations()` in `db.ts` unchanged | ✅ | `git diff --stat` shows `db.ts` not in changed files |
| C-02 | No other routes, trading logic, or Protected Zone files touched | ✅ | Exactly 3 files changed |
| C-03 | `ui.tsx` not modified | ✅ | Not in `git diff --stat` |
| C-04 | `[TRADE_HISTORY]` console.log removal is no-op | ✅ | Confirmed no such log existed |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

`git diff --stat HEAD` confirms exactly 3 files changed, none in Protected Zone.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `claude-agent.ts` untouched |
| Supabase patterns | ✅ | `db.ts` untouched; `getTradeEvaluations` uses service role client, `.limit()` bound, error thrown on failure — all pre-existing and unchanged |
| TypeScript quality | ✅ | No `any` casts; no mutations; component is 80 lines; all types from `@/lib/types`; `pnlPct * 100` is not a magic number (documented field scaling) |
| Security | ✅ | No secrets; no SQL injection (Supabase parameterized via existing query); `console.log` in `route.ts` only logs `[trades]:` error — no sensitive data |

## Task Checklist

- Completed: 18/18 tasks ✅ (including 2 pre-implementation gates)

## Findings

### CRITICAL (blocks merge)
None.

### HIGH (should fix)
None.

### MEDIUM (consider fixing)
None.

### LOW (optional)
- Two Tailwind canonical-class warnings from the IDE linter (`max-h-[640px]` → `max-h-160`, `hover:bg-white/[0.015]` → `hover:bg-white/1.5`). These were inherited from the original component and do not affect functionality or build output.

---

## Decision

**APPROVED** — All 18 requirements/constraints satisfied, 18/18 tasks complete, exactly 3 files changed, zero Protected Zone impact. Ready to commit.
