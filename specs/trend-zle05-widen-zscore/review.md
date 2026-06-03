# Review Report — TREND_ZLE05 Widen Z-Score Window

**Date**: 2026-06-03
**Reviewer**: Claude (automated)
**Status**: BLOCKED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Accept TREND_ZLE05 for 0 < z <= 1.25 | ✅ | `zScore <= 1.25` in `trendZLE05Setup` confirmed |
| FR-02 | ADX non-null AND >= 25 required | ✅ | `adxOk = adxValue !== null && adxValue >= 25` |
| FR-03 | Log `[TREND_ZLE05]` blocked when ADX null in trade zone | ✅ | Guard at line 1068 checks all three conditions |
| FR-04 | Log `[TREND_ZLE05_ENTRY]` with bucket/symbol/z/adx/macd | ✅ | Lines 1095–1101; `legacy` vs `expanded` bucket correct |
| FR-05 | Log `[TREND_ZLE05_REJECTED_Z]` for 1.25 < z <= 2.5 | ✅ | `wouldPassWithoutZ` correct; bounded to z <= 2.5 |
| FR-06 | Log `[TREND_ZLE05_STATS]` once per cycle after all symbols | ✅ | Placed after symbol loop at line ~1495 |
| FR-07 | Never accept TREND_ZLE05 for z > 1.25 | ✅ | `trendSetupRejected` updated to `> 1.25`; fires `continue` |
| NFR-01 | Temp logging removal scheduled ~2 weeks post-deploy | ✅ | Comment `// TEMP LOGGING — remove ~2026-06-17` present |
| NFR-02 | Zero TypeScript errors in source files | ✅ | Pre-existing test-file errors unrelated to this change |
| NFR-03 | No change to position sizing, exit rules, risk params | ❌ | **See HIGH finding below** — `adxOk` change affects TREND_PULLBACK |
| C-01 | Protected Zone file touched with Amaury confirmation | ✅ | Confirmed in tasks.md |
| C-02 | `detectMarketRegime()` unchanged | ✅ | Not touched |
| C-03 | MEAN_REVERSION, TREND_PULLBACK, EMA_RECLAIM blocks unchanged | ❌ | **See HIGH finding** — TREND_PULLBACK's effective ADX threshold changed |
| C-04 | Only `adxOk` changed in quality-gate variables | ✅ | `momentumOk`, `ema50SlopeOk`, `trendQualityOk` untouched |
| C-05 | `enforceExitRules()`, cooldown, `openPositionSymbols` unchanged | ✅ | Not touched |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | MODIFIED | Listed in design.md — expected |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Claude's action field override unchanged; output schema unchanged |
| Supabase patterns | ✅ | No DB changes |
| TypeScript quality | ✅ | No `any`, no mutation, functions < 50 lines |
| Security | ✅ | No secrets; `console.log` contains only symbol + numeric indicators |

---

## Task Checklist

- Completed: 15/17 tasks (2 post-implementation items pending: `/review` run and logging cleanup schedule)

---

## Findings

### CRITICAL (blocks merge)
None

### HIGH (must fix before merge)

**`adxOk` is shared — TREND_PULLBACK's ADX threshold was silently raised**

`adxOk` is consumed by `trendQualityOk`, which is used by **both** `trendZLE05Setup`
and `trendSetup` (TREND_PULLBACK):

```typescript
// Line 1040 — shared gate
const adxOk = adxValue !== null && adxValue >= 25  // ← changed

// Line 1042 — used by both setups
const trendQualityOk = ema50SlopeOk && adxOk

// Line 1055–1062 — TREND_PULLBACK uses trendQualityOk
const trendSetup = ... && trendQualityOk

// Line 1072–1082 — TREND_ZLE05 also uses trendQualityOk
const trendZLE05Setup = ... && trendQualityOk
```

**Effect**: TREND_PULLBACK now requires ADX >= 25 AND non-null. Previously it
required ADX >= 20 (with null pass-through). The spec explicitly puts "Any change
to TREND_PULLBACK's ADX threshold" out of scope (requirements.md) and C-03 states
TREND_PULLBACK blocks must not be changed.

**Fix**: Introduce a separate `adxOkZLE05` for TREND_ZLE05 only. Keep `adxOk`
(and therefore `trendQualityOk`) at its original `adxValue === null || adxValue >= 20`
for TREND_PULLBACK. Apply `adxOkZLE05` only in `trendZLE05Setup`:

```typescript
// Shared (unchanged) — used by TREND_PULLBACK
const adxOk = adxValue === null || adxValue >= 20

// ZLE05-specific — tighter gate
const adxOkZLE05 = adxValue !== null && adxValue >= 25

const trendQualityOk = ema50SlopeOk && adxOk           // TREND_PULLBACK unchanged
const trendQualityOkZLE05 = ema50SlopeOk && adxOkZLE05 // ZLE05 only

// trendZLE05Setup uses trendQualityOkZLE05 instead of trendQualityOk
// isZLE05Candidate uses trendQualityOkZLE05 is optional (it's a candidate flag,
//   not an entry gate — but for consistency should also use the tighter gate)
```

Also update `wouldPassWithoutZ` to use `trendQualityOkZLE05` so it mirrors the
actual `trendZLE05Setup` conditions.

### MEDIUM (consider fixing)
None

### LOW (optional)
- The ADX null guard (FR-03 / T-06) uses `macdHistogram !== null` as the condition,
  which is correct but differs slightly from the spec wording "positive MACD
  histogram" — the guard checks `!= null && > 0` implicitly via the condition chain.
  Actually confirmed it is `macdHistogram !== null && macdHistogram > 0` — no issue.
- `isZLE05Candidate` now uses `zScore <= 1.25` (consistent with new gate) but the
  quality-filter path at line ~1150 uses `trendQualityOk` (the shared one), not
  `trendQualityOkZLE05`. Once the HIGH fix is applied, `isZLE05Candidate` should
  use the ZLE05-specific quality gate for full consistency.

---

## Decision

**BLOCKED** — 1 HIGH finding. Must fix before merge:

- **Shared `adxOk` raises TREND_PULLBACK's ADX threshold as a side effect.**
  Create `adxOkZLE05 = adxValue !== null && adxValue >= 25` and use it only in
  `trendZLE05Setup` (and `isZLE05Candidate`). Restore `adxOk` to
  `adxValue === null || adxValue >= 20` so TREND_PULLBACK is unaffected.
