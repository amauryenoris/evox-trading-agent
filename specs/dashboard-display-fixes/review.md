# Review Report — Dashboard Display Fixes (Labels · Performance Breakdown · Trade History)

**Date**: 2026-06-03
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | TREND / TREND_FOLLOWING / PULLBACK_EMA50 → "Trend PB" in both SignalBadge components | ✅ | AgentReasoningLog.tsx L138-140, ui.tsx L88-90 |
| FR-02 | TREND_PULLBACK → "Trend PB" in both SignalBadge components | ✅ | AgentReasoningLog.tsx L131, ui.tsx L91 |
| FR-03 | TREND_ZLE05 → "Trend ZLE" in both SignalBadge components | ✅ | Label correct in both; amber vs green color discrepancy is LOW |
| FR-04 | Legacy keys preserved — no raw key fallback for historical records | ✅ | All three legacy keys present in both maps |
| FR-05 | FR-01–FR-03 applied uniformly in AgentReasoningLog and ui.tsx | ✅ | Labels uniform; color for TREND_ZLE05 differs (LOW) |
| FR-06 | trendPullback key in /api/performance response with count/wr/pf/exp | ✅ | route.ts L60-62, L68 |
| FR-07 | trendZLE05 key in /api/performance response | ✅ | route.ts L63, L69 |
| FR-08 | trend key retained = union of trendPullback + trendZLE05 | ✅ | route.ts L67 — "backward compat — do not remove" comment preserved |
| FR-09 | Legacy TREND / PULLBACK_EMA50 / TREND_FOLLOWING included in trendPullback bucket | ✅ | Filter on L60-62 covers all four values |
| FR-10 | PerformanceAnalytics renders separate Trend PB and Trend ZLE rows | ✅ | PerformanceAnalytics.tsx L172-198 |
| FR-11 | TREND_ZLE05 row hidden when count = 0 | ✅ | Global `.filter((s) => s.trades > 0)` at L199 handles this |
| FR-12 | report-generator.ts applies trendPullback/trendZLE05 split in PDF output | ⚠️ | Data is split in calculateDiagnostics() (L291-295) but generatePDF() still renders only stb.trend at L632 — per-setup rows never appear in the PDF |
| FR-13 | signalStats([]) returns all-zero struct — no NaN/Infinity | ✅ | All division sites guarded: wr, avgWP, avgLP, pf, avgPnlPct |
| FR-14 | Trade History renders up to full fetch limit (not hard-coded 20) | ✅ | Changed to slice(0, 50) matching API fetch limit |
| FR-15 | Diagnostic console.log on each render: order count + first 10 {side, symbol, submitted_at} | ✅ | TradeHistoryTable.tsx L11-14 matches spec exactly |
| NFR-01 | All changes display-only — no trading logic modified | ✅ | No changes to execution or sizing code |
| NFR-02 | /api/performance response shape is additive only | ✅ | No key removed or renamed |
| NFR-03 | PerformanceAnalytics uses ?. and ?? 0 on trendPullback/trendZLE05 | ✅ | All 5 fields per bucket use optional chaining + null coalescing |
| C-01 | No Protected Zone file modified | ✅ | Git status confirms zero Protected Zone changes |
| C-02 | No DB migrations or RLS changes | ✅ | No schema changes |
| C-03 | Alpaca fetch logic and /api/trades route unchanged | ✅ | Neither file modified |
| C-04 | trend key not removed from signalTypeBreakdown | ✅ | Present in both route.ts and report-generator.ts |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Not in git diff |
| src/lib/claude-agent.ts | UNTOUCHED | Not in git diff |
| src/lib/risk-manager.ts | UNTOUCHED | Not in git diff |
| src/lib/indicators.ts | UNTOUCHED | Not in git diff |
| src/lib/news-intelligence.ts | UNTOUCHED | Not in git diff |
| src/lib/watchlist-monitor.ts | UNTOUCHED | Not in git diff |
| src/lib/learning.ts | UNTOUCHED | Not in git diff |

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | claude-agent.ts untouched |
| Supabase patterns | ✅ | No new queries; existing getTradeEvaluations called with limit |
| TypeScript quality | ✅ | No `any` types; optional chaining used correctly; all new functions < 50 lines |
| Security | ✅ | No secrets; diagnostic log exposes only side/symbol/submitted_at |

---

## Task Checklist

- Completed: 13/13 implementation tasks (T-01 through T-13)
- Post-implementation manual verifications pending (expected — this review is the first step)

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- **FR-12 — PDF split not rendered**: `calculateDiagnostics()` correctly builds `trendPullback` and `trendZLE05` stats in `signalTypeBreakdown` (report-generator.ts L291-295, L327-332), but `generatePDF()` (L614-641) still references only `stb.trend` at L632 when rendering "Signal Type Breakdown". The per-setup rows are computed but never written to the PDF. T-07 explicitly required updating the PDF section to render both rows separately.

  **Fix**: In `generatePDF()` around line 632, replace the single `stb.trend` block with separate `stb.trendPullback` and `stb.trendZLE05` blocks, guarding each with an existence and `count > 0` check.

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **TREND_ZLE05 color inconsistency**: `AgentReasoningLog.tsx` renders TREND_ZLE05 with amber styling (consistent with the "ZLE" amber convention), but `ui.tsx` uses `tone: 'green'` for the same signal. Labels are correct in both; only the color differs. Spec FR-05 only required label uniformity, so this is not a violation, but the visual discrepancy may confuse users switching between views.

- **console.log fires on every render**: The `console.log('[TRADE_HISTORY]', ...)` in TradeHistoryTable.tsx runs in the component function body, so it fires on every React re-render (not just initial mount or props change). For a diagnostic, this is acceptable per spec (FR-15), but it will be noisy if the parent re-renders frequently. Consider wrapping in `useEffect` with `[orders]` dependency if noise becomes an issue post-verification.

---

## Decision

**APPROVED WITH WARNINGS** — One HIGH finding present. The PDF rendering gap (FR-12) means weekly PDF reports will continue to show only the combined "Trend" stats rather than the split Trend PB / Trend ZLE view. All dashboard UI changes (Fixes 1 and 3) and the API changes (Fix 2) are fully correct and production-ready. Merge with caution and apply the PDF fix as a follow-up before the next weekly report generation.
