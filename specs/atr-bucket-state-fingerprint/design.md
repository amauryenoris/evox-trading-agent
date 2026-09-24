# Design — Add atr_bucket to state_fingerprint

## Architecture Decision

Four-file, purely additive change. A new bucketing function joins its three siblings in `src/lib/state-fingerprint.ts`. The `TradeEvaluation.stateFingerprint` inline type (`types.ts`) gains one more loosely-typed field, matching the existing five. `claude-agent.ts`'s two buy-time `state_fingerprint` builders each gain one more computed field, using data (`atrPercentile`) already resident on the same `indicators`/`best.indicators` object they already read `adx`/`macd`/`marketRegime` from. `learning.ts`'s `evaluateClosedTrade()` — the single place that actually re-types the buy-time object into what gets inserted into `trade_evaluations` — gains the same field in its inline cast, so the value that already survives the JSON round-trip at runtime becomes visible to TypeScript too.

## Data Flow

1. `atrPercentile` (0–1 ratio) is computed once per symbol in `calculateAllIndicators()` (`indicators.ts`, unmodified) and cached on `TechnicalIndicators.atrPercentile` — already present on both `indicators` (immediate path) and `best.indicators` (ranking path) at the exact points `state_fingerprint` gets built.
2. **New**: `getAtrBucket(atrPercentile)` (`state-fingerprint.ts`) classifies that ratio into `'VERY_HIGH' | 'HIGH' | 'MID' | 'LOW' | null`, mirroring `getAdxBucket`'s shape exactly (null-guard, then a threshold `if`-chain, no `else`).
3. At `indicatorsAtBuy.state_fingerprint` (`claude-agent.ts:2232-2239`) and `bestIndicatorsAtBuy.state_fingerprint` (`claude-agent.ts:2426-2433`), one more field is added: `atr_bucket: getAtrBucket(...)`, guarded the same `typeof x === 'number' ? x : null` way the ranking path already guards `bestAdxValue`/`bestMacdHist`.
4. This object is persisted, unchanged in shape by any other code, into `open_position_contexts.indicators.state_fingerprint` (JSONB, via `saveOpenPositionContext()` — no `db.ts` change needed, confirmed in `STEP 0`).
5. At position close, `evaluateClosedTrade()` (`learning.ts:96-107`) reads `closedCtx.indicators.state_fingerprint` back through an explicit type-cast. **This cast must also list `atr_bucket`** — not because the runtime value would otherwise be lost (a TypeScript `as` cast never strips properties at runtime), but because every consumer downstream of this function accesses `evaluation.stateFingerprint.<field>` through the static type, and an omitted field is simply inaccessible to type-checked code even though it's sitting right there in the object.
6. `evaluation.stateFingerprint` (now including `atr_bucket`, both at runtime and in its type) flows into `insertTradeEvaluation()` (`db.ts:252-276`, unmodified — `state_fingerprint: evaluation.stateFingerprint ?? null` already passes the whole object through) and is later read back by `getTradeEvaluations()` (`db.ts:290-336`, also unmodified — `stateFingerprint: row.state_fingerprint ?? null`, a direct passthrough).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `getAtrBucket` to `state-fingerprint.ts`, extend both buy-time builders and the close-time cast (3 code sites + 1 type) | Matches the existing convention exactly; makes the field genuinely usable end-to-end, not just physically present | Slightly more surface than "just add a bucket function" | **Chosen** — matches `STEP 0`'s own finding that the close-time cast is a required site, not optional |
| Add `getAtrBucket` and the two buy-time builders only, skip the `learning.ts` cast | Smaller diff | The field would silently exist in the JSONB but be statically inaccessible to any TypeScript code reading `evaluation.stateFingerprint.atr_bucket` — defeats the purpose of a typed addition; exactly the trap `STEP 0` flagged | Rejected |
| Also add `atr_bucket` to `currentFingerprint` (`claude-agent.ts:1982-1989`) for full parity across all three fingerprint-shaped objects | Cosmetic consistency across all "builders" | `currentFingerprint`'s only consumer, `compareFingerprints()`, reads through the closed `FINGERPRINT_DIMENSIONS` union (`'adx' \| 'macd' \| 'z' \| 'regime'`, explicitly not extended per FR-11) — the field would be added but never read by anything, i.e. dead weight, not "more consistent" in any functional sense | Rejected — `currentFingerprint` left untouched, since the CHANGE's own conditional ("touch it only if leaving it inconsistent would be misleading") resolves to "not misleading" once its one consumer is confirmed structurally incapable of reading the new field either way |
| Also fold `atr_bucket` into `buildPatternKey`/`FINGERPRINT_DIMENSIONS`/`DIMENSION_IMPORTANCE` now, while touching this area anyway | One less follow-up change later | Explicitly out of scope per the CHANGE's DO NOT list (FR-11) — a real design decision (does ATR belong in the pattern-matching key? at what weight relative to adx/macd/z?) that shouldn't be bundled into a pure schema-observability addition | Rejected for this change |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/state-fingerprint.ts` | MODIFY | New exported `getAtrBucket()` function, following `getAdxBucket`'s exact shape. |
| `src/lib/types.ts` | MODIFY | `TradeEvaluation.stateFingerprint` (lines 217-224) gains `atr_bucket: string | null`. |
| `src/lib/claude-agent.ts` | MODIFY | Import line (`~25`) gains `getAtrBucket`. `indicatorsAtBuy.state_fingerprint` (~2232-2239) and `bestIndicatorsAtBuy.state_fingerprint` (~2426-2433) each gain one field; the ranking path also gains one new `const bestAtrPercentile` alongside `bestAdxValue`/`bestMacdHist`. |
| `src/lib/learning.ts` | MODIFY | `evaluateClosedTrade()`'s inline type cast (~96-107) gains `atr_bucket: string | null`. |
| `src/lib/db.ts` | UNCHANGED | Confirmed in `STEP 0`: both `insertTradeEvaluation()` and `getTradeEvaluations()` already pass the whole `state_fingerprint` object through untouched — no edit needed, no migration. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` IS in `CLAUDE.md`'s Protected Zone.** Implementation must not begin until Amaury gives fresh, explicit, in-conversation confirmation to touch this file. `src/lib/state-fingerprint.ts`, `src/lib/types.ts`, and `src/lib/learning.ts` are not Protected Zone and need no such confirmation.

## Database Changes

None. `atr_bucket` rides in the already-persisted `state_fingerprint` JSONB on both `open_position_contexts` and `trade_evaluations` — no migration, no new column, confirmed via the same zero-`db.ts`-changes pattern already established by `mrRiskFactors` and `requestedQty`.

## Open Questions

None blocking. The one judgment call the CHANGE prompt explicitly delegated to the spec-writer — whether to also touch `currentFingerprint` — is resolved above (leave it untouched) rather than left open, since it has a clear, argued answer from the code itself (its one consumer cannot read the new field regardless).
