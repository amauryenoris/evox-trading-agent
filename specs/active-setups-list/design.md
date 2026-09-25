# Design — Central ACTIVE_SETUPS List, Fix Setup-Name Drift

## Architecture Decision

A new, dependency-free file `src/lib/setups.ts` becomes the single source of truth for the 5 live setup names and their plain-language criteria. It has no imports (in particular, no import from `claude-agent.ts` — the criteria text is hand-written documentation, not derived at runtime from the boolean gate logic), so `types.ts` can safely import `SetupName` from it with no circular-import risk. `gate-importance.ts` gets one additive entry to its existing `DIMENSION_IMPORTANCE` table. `system-status/route.ts` gets a one-line fix required by the `SignalType` narrowing itself. No Protected Zone file is touched.

## Data Flow

```
setups.ts (NEW)
  ACTIVE_SETUPS: { name, criteria, active }[]  — 5 entries, order matches
                                                   claude-agent.ts:1873-1883's selector
  SetupName = (typeof ACTIVE_SETUPS)[number]['name']
       │
       ▼
types.ts:137  SignalType = SetupName   ← import type { SetupName } from './setups'
       │
       ▼
types.ts:158  AgentDecision.signal_type?: SignalType
       │
       ▼
system-status/route.ts:31-32  compares against real trend-setup names (was stale)

types.ts:195, :212  OpenPositionContext.signalType / TradeEvaluation.signal_type
  — UNCHANGED value set (still includes 'TREND'); comment added documenting it
    as legacy-compat, consumed by claude-agent.ts:295 (not touched)

gate-importance.ts  DIMENSION_IMPORTANCE
  + TREND_PULLBACK_3DAY: { adx: 'not-gated', macd: 'not-gated', z: 'not-gated', regime: 'not-gated' }
       │
       ▼
learning.ts compareFingerprints() (NOT modified — consumes the new entry automatically)
  — TREND_PULLBACK_3DAY trades now get a "Context vs. current trade" comparison
    line in RECENT TRADE LESSONS; previously that line was silently omitted
    (see Prior Behavior below)
```

## DIMENSION_IMPORTANCE — Before

```ts
export const DIMENSION_IMPORTANCE: Record<string, Record<string, GateImportance>> = {
  MEAN_REVERSION: { adx: 'hard-gated', macd: 'not-gated', z: 'hard-gated', regime: 'hard-gated' },
  TREND_PULLBACK: { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  TREND_ZLE05:    { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  EMA_RECLAIM:    { adx: 'not-gated', macd: 'not-gated', z: 'hard-gated', regime: 'not-gated' },
}
```

`GateImportance = 'hard-gated' | 'soft-referenced' | 'not-gated'` (`gate-importance.ts:3`) — a 3-value enum, not a numeric scale. "LOW importance" in the original request maps to `'not-gated'`, the table's existing floor value (used today wherever a dimension is confirmed absent from a setup's own gate condition, e.g. `MEAN_REVERSION.macd`).

## DIMENSION_IMPORTANCE — After (proposed)

```ts
export const DIMENSION_IMPORTANCE: Record<string, Record<string, GateImportance>> = {
  MEAN_REVERSION: { adx: 'hard-gated', macd: 'not-gated', z: 'hard-gated', regime: 'hard-gated' },
  TREND_PULLBACK: { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  TREND_ZLE05:    { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  EMA_RECLAIM:    { adx: 'not-gated', macd: 'not-gated', z: 'hard-gated', regime: 'not-gated' },
  TREND_PULLBACK_3DAY: { adx: 'not-gated', macd: 'not-gated', z: 'not-gated', regime: 'not-gated' },
}
```

### Reasoning (to be mirrored in a code comment)

- **adx / macd / z → `'not-gated'`**: `TREND_PULLBACK_3DAY`'s entry condition (`claude-agent.ts:1711-1728`) reads only `prevClose`, `sma200`, `closeMinus2`, `closeMinus3`, `closeMinus4`. It never reads `adx`, `macd`, or the Kalman z-score. None of these three dimensions inform the actual entry decision, so weighting them as gated would mislead Claude into treating past trades as comparable on a basis that was never part of the real decision — exactly the risk flagged in the original request.
- **regime → `'not-gated'`**: `gate-importance.ts`'s `regime` key is not an abstract "is this an uptrend" flag — it is fed by `learning.ts:301-305`'s `getFingerprintDimensionValue()`, which maps `regime` → `fp.market_regime`, itself populated from `indicators.marketRegime: 'TRENDING' | 'RANGING' | 'HIGH_VOLATILITY' | 'TRANSITION'`. `TREND_PULLBACK_3DAY`'s uptrend check (`prevClose > sma200`) never reads `indicators.marketRegime` at all — same as its trend-setup siblings. Only `MEAN_REVERSION`'s gate (`mrRangingAdxGateOk`, `claude-agent.ts:1693-1699`) directly reads `indicators.marketRegime`, which is why it alone is `'hard-gated'` on `regime`. `TREND_PULLBACK`, `TREND_ZLE05`, and `EMA_RECLAIM` all require an uptrend structurally (via EMA50/EMA200 relationships) but never read the `marketRegime` field either, and are all `'not-gated'` on `regime` — `TREND_PULLBACK_3DAY` follows the identical, evidence-based pattern. It is not marked `'hard-gated'` on `regime` because doing so would misrepresent what this specific table cell actually measures.

This row is `{ not-gated, not-gated, not-gated, not-gated }` on all four dimensions — a shape no existing row has, which is itself evidence it wasn't copied from `TREND_ZLE05` or any sibling.

## Prior Behavior for a Setup Missing from DIMENSION_IMPORTANCE (confirmed)

`compareFingerprints()` (`learning.ts:308-332`) does:
```ts
const currentImportance = DIMENSION_IMPORTANCE[current.signal_type ?? '']
const historicalImportance = DIMENSION_IMPORTANCE[historical.signal_type ?? '']
if (!currentImportance || !historicalImportance) return null
```
With `TREND_PULLBACK_3DAY` absent, either lookup is `undefined` whenever either side of a comparison is a `TREND_PULLBACK_3DAY` trade, so the function returns `null` for the **entire** comparison — not a degraded/default comparison, a fully skipped one. `buildRecentTradeLessonsLines()` (`learning.ts:334-362`) still renders that trade's `- SYMBOL (date): OUTCOME +/-X.X%` line and up to 2 `lessonsLearned` bullets; only the `  Context vs. current trade: ...` sentence is missing. After this change, that sentence renders using the new `{ not-gated × 4 }` weights — a real, intended improvement (Claude gains dimension-comparison context for `TREND_PULLBACK_3DAY` trades it previously didn't have), not a silent behavior change to any other setup.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `regime: 'hard-gated'` for `TREND_PULLBACK_3DAY` (reflecting the informal uptrend requirement) | Visually signals "this setup needs an uptrend" | Misrepresents what the `regime` key measures (`market_regime` classification, not SMA-relative structure); would flag a `RANGING`-regime historical trade as "differs importantly" from a `TREND_PULLBACK_3DAY` trade even though the entry gate never reads that field | Rejected |
| `regime: 'not-gated'` for `TREND_PULLBACK_3DAY` (matches all 3 trend-setup siblings) | Accurate to what the entry gate reads; consistent with existing table precedent | Table's 4 fixed dimensions have no slot for "requires price > SMA200" — a pre-existing limitation, not introduced by this change | **Chosen** |
| Derive `SignalType` (`types.ts:137`) from `setups.ts`'s `SetupName` | DRY; single source of truth; matches this codebase's existing `(typeof X)[number]['key']` pattern (`DashboardTabs.tsx:14`) | None identified — no circular import, since `setups.ts` has zero imports | **Chosen** |
| Also derive `OpenPositionContext.signalType` / `TradeEvaluation.signal_type` from `SetupName` | Full DRY | Both fields need `'TREND'` too (legacy-compat, per user decision) — `SetupName` has no room for a 6th, non-current value without polluting the "5 live setups" list with a dead one | Rejected — kept as independently hand-typed 6-value unions, now documented in place |
| Remove `'TREND'` from `OpenPositionContext.signalType` / `TradeEvaluation.signal_type` | Matches the original "6 values instead of 5" framing literally | Guaranteed TS2322 in `db.ts:192`/`:335`, guaranteed TS2367 in `claude-agent.ts:295` (Protected Zone) — expands this change into Protected Zone territory it explicitly excludes | Rejected (per user decision 2026-09-25) |
| Fix `system-status/route.ts:31-32`'s stale comparison in this change | Required — otherwise `SignalType`'s narrowing (already in scope) causes a guaranteed TS2367 here; file is not Protected Zone | Slightly expands the file list beyond `setups.ts`/`types.ts`/`gate-importance.ts` | **Chosen** — unavoidable consequence of FR-05, not an independent scope expansion |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/setups.ts` | CREATE | `ACTIVE_SETUPS` array (5 entries) + `SetupName` type |
| `src/lib/types.ts` | MODIFY | Line 137: `SignalType` derived from `SetupName`. Lines 195, 212: unchanged values, comment added documenting `'TREND'` as legacy-compat |
| `src/lib/gate-importance.ts` | MODIFY | Add `TREND_PULLBACK_3DAY` entry + reasoning comment |
| `src/app/api/system-status/route.ts` | MODIFY | Lines 31-32: replace stale `'TREND_FOLLOWING'` / `'PULLBACK_EMA50'` comparison with real trend-setup names (`'TREND_PULLBACK'`, `'TREND_ZLE05'`, `'TREND_PULLBACK_3DAY'`), required by the `SignalType` narrowing above |

No other file requires a change: `db.ts:192`/`:335` and `claude-agent.ts:295` stay as-is because `OpenPositionContext.signalType` / `TradeEvaluation.signal_type`'s value sets are not changing.

## Protected Zone Impact

None. `setups.ts` is new and unprotected. `types.ts`, `gate-importance.ts`, and `system-status/route.ts` are all on the "touch freely" list in `CLAUDE.md`'s File Permission Matrix. `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, and `config.ts` are untouched.

One adjacent note for awareness, not a blocker: `gate-importance.ts` feeds `learning.ts`'s `compareFingerprints()`, and `learning.ts` is on the project's broader "confirm before touching" list (`CLAUDE.md` File Permission Matrix; `specs/README.md`'s "zona protegida" list). This change does not edit `learning.ts` itself — only the data it consumes — so it does not trigger that confirmation requirement, but the downstream effect on Claude's learning-context prompt text is real and described above under "Prior Behavior."

## Database Changes

None.

## Open Questions

None outstanding. The two conflicts found during spec research were resolved:
1. Whether to remove `'TREND'` from `OpenPositionContext.signalType` / `TradeEvaluation.signal_type` — resolved by user decision (2026-09-25): keep it, document in place, defer removal to a future change that explicitly authorizes touching `claude-agent.ts` and `db.ts`.
2. Whether `TREND_PULLBACK_3DAY`'s `regime` dimension should be `'hard-gated'` or `'not-gated'` — resolved by inspecting `getFingerprintDimensionValue()` and `mrRangingAdxGateOk`: `'not-gated'`, consistent with all 3 trend-setup siblings (see Reasoning above).
