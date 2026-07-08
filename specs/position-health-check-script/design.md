# Design — Position Health Monitor: the Health-Check Script

## Architecture Decision

A single new standalone script, `scripts/position-health-check.ts`,
following the exact structural pattern already established by
`scripts/backfill-spx-regime.ts` and
`scripts/backfill-spx-regime-open-positions.ts`: its own
`createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)`, a single
`async function main()`, a dry-run/live toggle via an env var, bracketed
`[TAG]` console logging, and a summary line. It composes four already-pure,
already-exported building blocks — `getBars` (`alpaca.ts`),
`calculateAllIndicators` (`indicators.ts`), `getAdxBucket`/`getMacdBucket`/
`getZBucket`/`computeSpxSnapshot` (`state-fingerprint.ts`), and
`getOpenPositionContexts` (`db.ts`) — with zero new logic beyond
orchestration, comparison, and row-shaping. No Protected Zone file is
touched; this is purely additive.

## Two verified deviations from the prompt's literal draft, reported explicitly

**1. Relative import file extension.** The prompt's draft imports read
`from '../src/lib/alpaca'` (no extension). Checking the one existing
full-agent standalone runner, `scripts/run-cycle.ts:9`:
```ts
import { runAgentCycle } from '../src/lib/claude-agent.js'
```
uses an explicit `.js` extension on its relative import to `src/lib/`
(the TS-source-compiles-to-.js ESM convention `tsx` expects). By contrast,
`scripts/backfill-spx-regime-open-positions.ts:27-33` imports its own
`scripts/lib/spx-snapshot-helpers` **without** an extension. Both patterns
apparently run under `tsx` today (this project already runs both scripts),
so this isn't a hard blocker — but since this new script is a full
"import from `src/lib/`" runner exactly like `run-cycle.ts` (not a
same-directory `scripts/lib/` helper import like the backfill scripts),
**this design follows `run-cycle.ts`'s precedent and uses explicit `.js`
extensions** for all four `../src/lib/*` imports, to match the closer
analog rather than the more distant one.

**2. Reading `state_fingerprint` off `ctx.indicators` requires a safe cast,
not a direct property access.** `OpenPositionContext.indicators` is typed
as `TechnicalIndicators` (`types.ts:90-124`), which has **no**
`state_fingerprint` field — that key is a runtime-only addition bolted onto
the stored jsonb blob by `claude-agent.ts` at buy time (confirmed via the
live sample in the prior diagnostic), not part of the declared type. A
direct `ctx.indicators.state_fingerprint` access would not compile under
this project's `strict: true` TypeScript config. The existing precedent for
reading these bolted-on fields safely, without `any`, is
`learning.ts:73-90` (`evaluateClosedTrade`):
```ts
const ind = closedCtx.indicators
const rawInd = ind as unknown as Record<string, unknown>
const spxPrice = typeof rawInd.spx_price === 'number' ? rawInd.spx_price : null
```
This design follows that exact pattern for `state_fingerprint`: cast to
`Record<string, unknown>`, then narrow with `typeof`/shape checks before
reading `.adx_bucket`/`.macd_bucket`/`.z_bucket`/`.spx_regime` — never `any`.

## Additional implementation detail not spelled out in the prompt, resolved here

**`getZBucket`'s second parameter type does not include the legacy
`'TREND'` signal type**, but `OpenPositionContext.signalType`'s declared
type does include it (`'MEAN_REVERSION' | 'TREND' | 'TREND_PULLBACK' |
'TREND_ZLE05' | 'EMA_RECLAIM' | null | undefined`). Passing `ctx.signalType`
directly to `getZBucket` would not compile. This design normalizes it first:
```ts
function toZBucketSignalType(
  signalType: OpenPositionContext['signalType']
): 'MEAN_REVERSION' | 'TREND_PULLBACK' | 'TREND_ZLE05' | 'EMA_RECLAIM' | null {
  return signalType === 'MEAN_REVERSION' ||
    signalType === 'TREND_PULLBACK' ||
    signalType === 'TREND_ZLE05' ||
    signalType === 'EMA_RECLAIM'
    ? signalType
    : null
}
```
`'TREND'` and `undefined` both fall through to `null`, which is exactly
what `getZBucket` would have effectively done anyway (its internal logic
only branches on those four signal types, defaulting to `null` otherwise)
— this normalization satisfies the type checker without changing behavior.

**Per-symbol bars fetch can also throw outright** (not just return `<200`
bars) — e.g. an Alpaca API error for that one symbol. The prompt's FR
language only explicitly covers the length check; this design wraps the
per-symbol `getBars` call in a `try/catch` so a thrown error is treated the
same as the `<200`-bars case (log, count as failed, `continue`), consistent
with the graceful-degradation principle the prompt already applies to the
SPY fetch (`.catch(...)`).

## Data Flow

```
1. snapshotTimestamp = new Date().toISOString()   ← fixed once, used for every row
2. openPositions = await getOpenPositionContexts()
3. spyBars = await getBars('SPY', '1Day', 400).catch(() => [])
   spxSnapshot = spyBars.length >= 200 ? computeSpxSnapshot(spyBars) : all-nulls
4. rows = []
   for each ctx of openPositions:
     try:
       bars = await getBars(ctx.symbol, '1Day', 400)
     catch: log, failed++, continue
     if bars.length < 200: log, failed++, continue
     currentIndicators = calculateAllIndicators(bars)
     current_adx_bucket   = getAdxBucket(currentIndicators.adx)
     current_macd_bucket  = getMacdBucket(currentIndicators.macd?.histogram ?? null)
     current_z_bucket     = getZBucket(currentIndicators.kalman?.zScore ?? null, toZBucketSignalType(ctx.signalType))
     current_spx_regime   = spxSnapshot.spx_regime
     fingerprint = safe-cast read of ctx.indicators.state_fingerprint (or undefined)
     entry_adx_bucket/macd_bucket/z_bucket/spx_regime = fingerprint?.xxx ?? null
       (log info-level if fingerprint itself is undefined)
     days_since_entry = trading-day formula on ctx.buyTimestamp
     rows.push({ ...all 17 fields... })
     processed++
     log [HEALTH_CHECK] comparison line
5. if rows.length === 0: log DONE (0/0/failed), return — no insert call at all
   else if dry-run: print rows, log DONE (processed/failed/inserted=0)
   else: single await db.from('position_health_snapshots').insert(rows)
         on error: log explicitly, inserted=0
         on success: log DONE (processed/failed/inserted=rows.length)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Insert one row at a time inside the loop | Simpler control flow | Violates the prompt's explicit "single atomic batch" requirement; partial-failure semantics become ambiguous (some rows in, some not, same `snapshot_timestamp` inconsistent) | Rejected |
| Single batch `.insert(rows)` after the loop (this design) | One write, one timestamp guaranteed shared across all rows, matches Prompt 4/4's stated direction (per-run atomicity for future `run_id` grouping) | Requires accumulating rows in memory (trivial — bounded by `MAX_POSITIONS`, currently ≤5) | **Chosen** |
| Cast `ctx.indicators` to `any` to read `state_fingerprint` | Less code | Violates the project's explicit "no `any` casts" rule; loses all type safety for the rest of the object | Rejected |
| `Record<string, unknown>` cast + `typeof` narrowing (`learning.ts` precedent) | No `any`, matches existing project pattern exactly | Slightly more verbose | **Chosen** |
| Let a per-symbol bars-fetch exception propagate and crash the run | Simpler | Directly contradicts NFR-03 ("a failure processing one position shall not prevent other positions... from being processed") and the SPY-fetch graceful-degradation precedent already in the prompt | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `scripts/position-health-check.ts` | CREATE | New standalone script (this spec) |
| `package.json` | MODIFY | Add one `"health-check": "tsx scripts/position-health-check.ts"` script entry |

No other file is created, modified, or deleted. `claude-agent.ts`,
`state-fingerprint.ts`, `indicators.ts`, `alpaca.ts`, and `db.ts` are
imported from only — never edited.

## Protected Zone Impact

None — `scripts/position-health-check.ts` is a new file outside the
Protected Zone, and `package.json` is not a Protected Zone file. No
Protected Zone file requires modification for this spec.

## Database Changes

None — this spec only *writes rows* to the `position_health_snapshots`
table created in Prompt 2/4; no schema, index, or RLS change.

## Open Questions

None. Both ambiguities left open by the prompt's literal draft (import
extension style; safe access to the untyped `state_fingerprint` field) are
resolved above using existing, verified project precedent (`run-cycle.ts`
and `learning.ts` respectively), and the `getZBucket` signal-type mismatch
is resolved with a pure normalization helper that doesn't change observed
behavior.
