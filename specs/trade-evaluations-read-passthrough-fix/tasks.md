# Tasks — getTradeEvaluations() Whitelist-Drop Fix (Read Path)

## Pre-Implementation

- [x ] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`db.ts` is not in CLAUDE.md's Protected Zone lists per design.md — no gate applies, routed through this workflow for consistency)
- [x] Database migrations drafted (N/A — none needed)

## Implementation Checklist

### Phase 1 — Read-Path Fix (db.ts)
- [x] T-01: In `getTradeEvaluations()`'s `buyIndicators` IIFE (`db.ts:293-313`), add `...raw,` as the first key in the returned object literal, immediately before the existing `rsi: raw.rsi ?? null,` line
- [x] T-02: Leave all 16 existing explicit keys (including the `kalman` line's exact quirk) byte-identical, in their current order
- [x] T-03: Run `npx tsc --noEmit` to determine whether the `TechnicalIndicators & Record<string, unknown>` cast is actually required — confirmed NOT needed (design.md's prediction was correct: `row`/`raw` are implicitly `any` since `getClient()` doesn't parameterize `createClient()` with a `Database` type); no cast added

### Phase 2 — Testing
- [x] T-04: Created `src/lib/__tests__/trade-evaluations-buy-indicators-passthrough.test.ts`, using the same `vi.hoisted` Supabase mock pattern as `db.trade-evaluations-fingerprint.test.ts`
- [x] T-05: Test — a row with extra keys in `indicators_at_buy` beyond the 16-field whitelist (e.g. `spx_price`, `effectiveThreshold`, `sectorRotation`, `tp_zscore`) has ALL of those extra keys present in the returned `buyIndicators`
- [x] T-06: Test — the 16 core fields' defaulting is unchanged: a row with `rsi: null` (explicit) in the raw jsonb still returns `rsi: null`; a row missing a core key entirely still returns its current default (`null` or `0` per field)
- [x] T-07: Test — a row with `indicators_at_buy` absent/`null` still returns the same safe-default `buyIndicators` object as today
- [x] T-08: Test — the pre-existing `kalman` defaulting quirk (`raw.indicators_at_buy?.kalman ?? raw.kalman ?? null`) is unchanged: a row with `indicators_at_buy.kalman` set still returns it via the `raw.kalman` fallback path, exactly as today

### Phase 3 — Verification
- [x] T-09: Ran `db.trade-evaluations-fingerprint.test.ts` specifically — its 3 existing tests pass unmodified
- [x] T-10: Ran `npx tsc --noEmit` — passed, no errors
- [x] T-11: Ran `npm run build` — passed, compiled successfully
- [x] T-12: Ran full test suite — 326/326 tests passed (34 files)
- [x] T-13: `git diff --stat` shows only `db.ts` (+1/-0 line) + the new test file changed

## Post-Implementation

- [x] Run `/review trade-evaluations-read-passthrough-fix` to verify implementation matches spec
- [x] Confirm no other function in `db.ts`, `learning.ts`, or `claude-agent.ts` changed — diff review limited to the single `buyIndicators` IIFE, confirmed via `git diff src/lib/db.ts`

## Estimated Complexity

Low — one added line (`...raw,`) inside an already-existing IIFE, no new functions, no schema change. The only non-trivial part is confirming (not assuming) whether a type cast is needed, which is a mechanical `tsc --noEmit` check already predicted in design.md.
