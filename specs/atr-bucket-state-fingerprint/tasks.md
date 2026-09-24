# Tasks — Add atr_bucket to state_fingerprint

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — ⚠️ REQUIRED: `src/lib/claude-agent.ts` is Protected Zone. Obtain fresh, explicit, in-conversation confirmation from Amaury before starting Phase 2 — separate from, and not satisfied by, spec approval alone. `state-fingerprint.ts`, `types.ts`, and `learning.ts` need no such confirmation.
- [x] Database migrations drafted — N/A, none needed (rides in existing `state_fingerprint` JSONB on both tables; `db.ts` requires no code change either, per `design.md`).

## Implementation Checklist

### Phase 1 — state-fingerprint.ts and types.ts

- [x] T-01: Add `getAtrBucket(atrPercentile: number | null): string | null` to `src/lib/state-fingerprint.ts`, immediately after `getMacdBucket` (before `getZBucket`), following the exact CHANGE-specified body:
  ```ts
  export function getAtrBucket(atrPercentile: number | null): string | null {
    if (atrPercentile === null || !Number.isFinite(atrPercentile)) return null
    if (atrPercentile >= 0.85) return 'VERY_HIGH'
    if (atrPercentile >= 0.60) return 'HIGH'
    if (atrPercentile >= 0.30) return 'MID'
    return 'LOW'
  }
  ```
- [x] T-02: Add `atr_bucket?: string | null` (optional, not required — see amendment note below T-11) to the `TradeEvaluation.stateFingerprint` inline type (`src/lib/types.ts`, currently lines 217-224), alongside the existing five fields. Other five fields' types unchanged.

### Phase 2 — claude-agent.ts

- [ ] T-03: Re-verify current exact line numbers for the `import { getAdxBucket, getMacdBucket, getZBucket, computeSpxSnapshot } from './state-fingerprint'` line (~25), `indicatorsAtBuy.state_fingerprint` (~2232-2239), and `bestIndicatorsAtBuy.state_fingerprint` construction block including `bestAdxValue`/`bestMacdHist` (~2417-2433) before editing — they may have shifted since this spec was written.
- [x] T-04: Add `getAtrBucket` to the existing `state-fingerprint` import (~line 25).
- [x] T-05: In `indicatorsAtBuy.state_fingerprint` (~2232-2239), add one more field: `atr_bucket: getAtrBucket(typeof indicators.atrPercentile === 'number' ? indicators.atrPercentile : null),` — matching the existing field style/indentation. Do not change `signal_type`/`spx_regime`/`market_regime`/`adx_bucket`/`z_bucket`/`macd_bucket`.
- [x] T-06: In the ranking-path block (~2417-2433), declare `const bestAtrPercentile = typeof best.indicators.atrPercentile === 'number' ? best.indicators.atrPercentile : null` alongside `bestAdxValue`/`bestMacdHist`, then add `atr_bucket: getAtrBucket(bestAtrPercentile),` to `bestIndicatorsAtBuy.state_fingerprint`. Do not change the other five fields.
- [x] T-07: Confirm `currentFingerprint` (~1982-1989) is left untouched, per `design.md`'s explicit decision (its sole consumer, `compareFingerprints`, cannot read a new field regardless — adding it there would be inert). Confirmed via `git diff` — not present in the diff.
- [x] T-08: Confirm no BUY/HOLD/REJECT decision logic, gate, or threshold was touched anywhere in the diff. Confirmed — diff shows exactly the import line and 2 `atr_bucket` fields + 1 new const.

### Phase 3 — learning.ts

- [x] T-09: Re-verify current exact line numbers for `evaluateClosedTrade()`'s inline type cast (~96-107) before editing.
- [x] T-10: Add `atr_bucket?: string | null` (optional, not required — see amendment note below) to the cast's inline type (~99-107), alongside the existing five fields.
- [x] T-11: Confirm `buildPatternKey()` (~202-205), `FINGERPRINT_DIMENSIONS`/`getFingerprintDimensionValue()` (~293-305), and `compareFingerprints()` (~307-331) are byte-for-byte unchanged. Confirmed via `git diff` — exactly one line added, none of these functions appear in the diff.

**AMENDMENT (found via T-12's `npx tsc --noEmit`)**: the spec's FR-07 said to match "the same loose `string | null` typing" as the existing five fields — I initially implemented this literally as `atr_bucket: string | null` (required, no `?`). This broke the build in 3 places: `claude-agent.ts:1990` (`buildLearningContext(indicators, currentFingerprint)` — `currentFingerprint` deliberately omits `atr_bucket` per T-07's own decision, so it no longer satisfied the parameter type) and two test fixtures (`gate-relevance-context.test.ts`, `pattern-library-key-matching-fix.test.ts`) that construct fingerprint objects without `atr_bucket`. Design's decision to leave `currentFingerprint` untouched (T-07) is only internally consistent if `atr_bucket` is *optional* at the type level (`atr_bucket?: string | null`), unlike its five siblings — all three builders populate those unconditionally, but only two of three now populate `atr_bucket`. Fixed by making it optional in both `types.ts` and `learning.ts`'s cast; re-ran `tsc --noEmit` clean. No test fixture was modified — this fix works precisely because it doesn't require touching them.

## Post-Implementation

- [x] T-12: Run `npx tsc --noEmit` — must pass with zero new errors. First run surfaced 3 errors (see amendment above), fixed, re-run clean.
- [x] T-13: Diff confirmed: `db.ts` shows no output at all; the other four files' changes match exactly T-01, T-02, T-04–T-06, T-10 (plus the T-12 amendment's `?` fix, same lines).
- [x] T-14: Confirmed no new Supabase migration file was created — `git status --porcelain` shows no changes under `supabase/`.
- [x] T-15: Sample JSONB shape shown in completion report (see below).
- [x] T-16: Full test suite run — 48 files / 448 tests passed, no regressions. The four fixture-carrying test files passed unmodified, confirming the `?` amendment was the right fix.
- [ ] Run `/review atr-bucket-state-fingerprint` to verify implementation matches spec.
- [x] Confirm Protected Zone files unchanged except the explicitly-confirmed `claude-agent.ts` modification.

## Estimated Complexity

**Low** — one new pure function copied from an established template, one type-field addition, and three small object-literal/cast extensions, all following patterns already used three times over (`adx_bucket`/`macd_bucket`/`z_bucket`) in the exact same files. The only non-obvious part — that the close-time cast in `learning.ts` is a required fourth site, not optional — was already identified and resolved during `STEP 0`/spec-writing, not left for implementation to discover.
