# Design — TREND_PULLBACK_3DAY Data Layer (CHANGE 1 of 3)

## Architecture Decision

This feature lives entirely in the indicators layer: `src/lib/types.ts` (the `TechnicalIndicators` interface) and `src/lib/indicators.ts` (`calculateAllIndicators()`, which already computes `sma50`, `sma200`, and `prevClose` from the same `bars: AlpacaBar[]` array passed in every cycle). No new data source, API route, or DB table is involved — the daily bars used here are already fetched via the existing `getBars(sym, '1Day', 300, 300)` call in the agent cycle. This is purely additive: new fields are computed and attached to the existing indicator object, consumed by nothing yet (CHANGE 2 will read them).

## Data Flow

1. Agent cycle fetches daily bars for a symbol via `getBars(sym, '1Day', 300, 300)` (unchanged).
2. `calculateAllIndicators(bars)` runs, now additionally computing:
   - `sma5` via the existing generic `calculateSMA(bars, 5)`.
   - `closeMinus2`/`closeMinus3`/`closeMinus4` via direct array indexing on `bars`, mirroring `prevClose`'s existing pattern.
3. The returned `TechnicalIndicators` object carries these new fields alongside the existing ones.
4. Nothing downstream reads the new fields yet — they pass through unused until CHANGE 2 wires the `TREND_PULLBACK_3DAY` entry gate.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Discrete `closeMinus2`/`closeMinus3`/`closeMinus4` fields | Mirrors existing `prevClose` convention exactly; minimal diff; easy to review in isolation | Adds 3 similarly-named optional fields instead of one array | Chosen |
| Generic `closeHistory: number[]` array | Scales to any lookback without adding new fields per day | Deviates from the codebase's existing per-field convention (`prevClose`, `ema50Prev`); larger API-shape change; CHANGE 2 would need index math instead of named fields | Rejected |
| Compute the down-streak boolean directly in this change | Fewer total changes across the 3-change sequence | Mixes data-layer computation with gate/entry logic; violates the explicit CHANGE 1/2/3 split; the down-streak logic is Protected-Zone gate logic, not indicator math | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | Add `sma5: number \| null` (non-optional) and `closeMinus2?/closeMinus3?/closeMinus4?: number \| null` (optional) to `TechnicalIndicators`, immediately after the existing `prevClose` field. `ema50Prev` already exists — not duplicated. |
| `src/lib/indicators.ts` | MODIFY | Inside `calculateAllIndicators()`'s return object, add `sma5: calculateSMA(bars, 5)` and the three `closeMinusN` computations using `prevClose`'s exact bounds-check style. No other lines in the function change. |

## Protected Zone Impact

⚠️ **`src/lib/indicators.ts` is Protected Zone** per `specs/README.md` and `CLAUDE.md`'s file-permission matrix ("Signal calculation — Kalman filter"). This requires explicit confirmation from Amaury before `/implement` proceeds, regardless of spec approval — see Open Questions below. (`src/lib/types.ts` is not Protected Zone — it's on the "touch freely" list.)

## Database Changes

None.

## Open Questions

- The originating prompt's header states indicators.ts is "not Protected Zone, no special authorization required." This conflicts with `specs/README.md:77` and `CLAUDE.md`'s file-permission matrix, which both classify it as Protected Zone. **Amaury: please confirm explicitly that this specific, narrowly-scoped indicators.ts change (pure field additions, no logic change) is authorized before `/implement` proceeds.** Absent that confirmation, `/implement` should treat indicators.ts as requiring sign-off per the standing project rule.
