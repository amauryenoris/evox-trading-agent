# Design — TREND_PULLBACK MACD Floor Gate

## Architecture Decision

This change lives entirely inside `src/lib/claude-agent.ts`, within the
per-symbol evaluation loop of `runAgentCycle()`. It adds two new boolean
variables (`trendPullbackMacdFloor`, `trendPullbackMomentumOk`) immediately
before the existing `trendSetup` declaration, then appends
`&& trendPullbackMomentumOk` as the final condition of `trendSetup`. A
shadow variable `wouldPassWithoutMacdFloor` (the old `trendSetup` expression,
unchanged) is added after `trendSetup` for BLOCKED_MACD logging. One cycle-
level counter (`trendPullbackBlockedMacd`) is declared outside the symbol loop
alongside the existing ZLE05 counters, and a STATS log fires after the loop
near the existing `TREND_ZLE05_STATS` line (~1526).

No other layer is touched — no API routes, no dashboard components, no DB,
no config.ts.

---

## Data Flow

```
Per-symbol evaluation (inside for...of watchlist loop)
│
├─ [existing] adxOk, macdHistogram, trendQualityOk (lines ~1041–1055)
│
├─ NEW: const trendPullbackMacdFloor = -2.0              ← before trendSetup
├─ NEW: const trendPullbackMomentumOk = macdHistogram !== null
│                                      && macdHistogram > trendPullbackMacdFloor
│
├─ MODIFIED: trendSetup (line ~1068)
│   = [existing 7 conditions] && trendPullbackMomentumOk
│
├─ NEW: const wouldPassWithoutMacdFloor = [existing 7 conditions, no MACD gate]
│
├─ NEW: const zBucket = (Number.isFinite guard + 3-level ternary)
│
├─ NEW: if (!trendSetup && wouldPassWithoutMacdFloor && !trendPullbackMomentumOk)
│   → trendPullbackBlockedMacd++
│   → console.log [TREND_PULLBACK_BLOCKED_MACD]
│
├─ NEW: if (trendSetup)
│   → console.log [TREND_PULLBACK_ENTRY]
│
└─ NEW: if (trendSetup && marketRegime === 'HIGH_VOLATILITY')
    → console.log [TREND_PULLBACK_HIGH_VOL]

After symbol loop (after line ~1526)
└─ NEW: console.log [TREND_PULLBACK_STATS] blockedMacd=${trendPullbackBlockedMacd}
```

---

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| MACD floor gate on TREND_PULLBACK only | Surgical, isolated, testable | Only n=12 — experimental | **Chosen** |
| HIGH_VOLATILITY regime filter | Simple one-line filter | Rejected: INTC +24.6%, POET +15.0% both HIGH_VOL — kills alpha | **Rejected** |
| Promote floor to config.ts as permanent param | Reusable across signals | Premature — hypothesis not yet validated | **Rejected** |
| Tighter MACD threshold (e.g. -1.0) | More conservative | Blocks COP (-1.69) and NVDA (-1.42) which recovered well | **Rejected** |

---

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| [src/lib/claude-agent.ts](../../src/lib/claude-agent.ts) | MODIFY | Add `trendPullbackMacdFloor`, `trendPullbackMomentumOk`, modify `trendSetup`, add `wouldPassWithoutMacdFloor`, add counter + 4 temp log blocks |

---

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — core decision engine. Requires Amaury
confirmation before implementation.

Changes are additive only:
- No existing condition removed from `trendSetup`
- `trendZLE05Setup` and all ZLE05 variables untouched
- `MEAN_REVERSION`, `EMA_RECLAIM` setups untouched
- `enforceExitRules()` untouched

---

## Variable Placement Map

| Variable | Declared at | Scope |
|----------|-------------|-------|
| `trendPullbackBlockedMacd` | Before symbol loop (~line 943) | Cycle-level counter |
| `trendPullbackMacdFloor` | Before `trendSetup` (~line 1067) | Per-symbol const |
| `trendPullbackMomentumOk` | Before `trendSetup` (~line 1067) | Per-symbol const |
| `trendSetup` (modified) | ~line 1068 | Per-symbol const (adds 1 condition) |
| `wouldPassWithoutMacdFloor` | After `trendSetup`, before ZLE05 log | Per-symbol const |
| `zBucket` | After `wouldPassWithoutMacdFloor` | Per-symbol const (temp) |
| Log blocks × 3 | After `zBucket`, before order execution | Temp, remove ~Jun 17 |
| STATS log | After symbol loop, near ZLE05 STATS (~line 1526) | Cycle-level (temp) |

---

## Database Changes

None.

---

## Open Questions

None — all design decisions are resolved in the spec context provided.

---

## Rollback Criteria

Evaluate after **both** conditions are met:
- ≥ 8 completed TREND_PULLBACK trades post-implementation
- ≥ 14 trading days elapsed

Rollback triggers (any one):
1. Expectancy drops materially below the +3.63% baseline
2. Profit factor drops below 2.0
3. `[TREND_PULLBACK_BLOCKED_MACD]` logs consistently show forward returns
   > +2% on blocked trades (gate is killing alpha)
