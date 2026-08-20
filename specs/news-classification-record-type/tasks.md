# Tasks — Narrow getRecentNewsClassifications()'s Return Type

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A — see design.md → Protected Zone Impact: no protected file is touched)
- [x] Database migrations drafted (N/A — no schema change in this fix)

## Implementation Checklist

### Phase 1 — Type Layer
- [x] T-01: In `src/lib/types.ts`, add `NewsClassificationRecord = Pick<NewsEvent, 'scope' | 'symbol' | 'sentiment' | 'impact' | 'threshold_adjustment'>` immediately after the `NewsEvent` interface (currently ending at line 321), with a comment pointing at `getRecentNewsClassifications()`'s `.select()` list in `db.ts`

### Phase 2 — Data Access Layer
- [x] T-02: In `src/lib/db.ts`, add `NewsClassificationRecord` to the existing `./types` import (do not add a second import statement)
- [x] T-03: Change `getRecentNewsClassifications()`'s return type from `Promise<NewsEvent[]>` to `Promise<NewsClassificationRecord[]>`
- [x] T-04: Change the function's final cast from `(data ?? []) as NewsEvent[]` to `(data ?? []) as NewsClassificationRecord[]`
- [x] T-05: Add a comment immediately above the function pointing at `NewsClassificationRecord`'s `Pick<>` in `types.ts`
- [x] T-06: Confirm the `.select()` column list, `.gt()` filter, and error-handling branch are byte-identical to before

### Phase 3 — Verification
- [x] T-07: Confirm `newsIntelligenceLayer()` (news-intelligence.ts:150-198) type-checks against the narrowed return type with zero code changes
- [x] T-08: Confirm `getAggregateMacroSentiment()` (news-intelligence.ts:328-340) type-checks against the narrowed return type with zero code changes
- [x] T-09: Confirm `newsIntelligenceLayer()`'s defensive filter line (`.filter((e) => e.scope && e.sentiment && e.impact)`) is byte-identical before/after
- [x] T-10: During review (not committed), write a throwaway snippet reading `.headline` or `.created_at` off `getRecentNewsClassifications()`'s result and confirm it produces a TypeScript compile error — proving the fix changes compiler behavior, not just the type declaration
- [x] T-11: Run `npx tsc --noEmit` — must pass with zero new errors
- [x] T-12: Run `npm run build` — must pass with zero new errors
- [x] T-13: Run the full test suite — all existing tests must pass unmodified

## Post-Implementation

- [ ] Run `/review news-classification-record-type` to verify implementation matches spec
- [ ] Confirm `NewsEvent`, `newsIntelligenceLayer()`, `getAggregateMacroSentiment()`, `buildThresholdMap()`, and every other function in `db.ts`/`news-intelligence.ts` are unchanged

## Estimated Complexity

Low — a single new derived type plus a return-type/cast swap in one function, with two paired comments. No control-flow change, no query change, no consumer-code change required. The only nuance is proving (via a throwaway, non-committed snippet) that the narrowing actually produces a compile error, not just a cosmetic annotation change.
