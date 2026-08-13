# Tasks — News Intelligence MACRO Symbol Fallback Fix

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`news-intelligence.ts` — pre-authorized by Amaury per originating request)
- [x] Database migrations drafted (N/A — none needed, forward-only fix)

## Implementation Checklist

### Phase 1 — Bug Fix (news-intelligence.ts)
- [x] T-01: Change line 139 in `classifyNewsItem()` from `symbol: parsed.symbol ?? symbol,` to `symbol: parsed.scope === 'MACRO' ? null : (parsed.symbol ?? symbol),`
- [x] T-02: Confirm no other line in `classifyNewsItem()`, the classification prompt, `getThresholdAdjustment()`, or `buildThresholdMap()` was touched (diff review) — `git diff` shows exactly 3 lines changed: the line-139 fix, and `export` added to `NewsClassification`/`buildThresholdMap` (visibility-only, needed for T-07's direct test — no behavior change)

### Phase 2 — Testing
- [x] T-03: Create `src/lib/__tests__/news-intelligence.test.ts` (first test file for this module)
- [x] T-04: Test — MACRO scope with an ambient ticker present (`article.symbols=['AMZN']`) persists `symbol: null`
- [x] T-05: Test — SYMBOL scope with Claude returning a valid `parsed.symbol` persists that symbol unchanged
- [x] T-06: Test — SYMBOL scope with Claude returning an empty/null `parsed.symbol` still falls back to the ambient ticker unchanged
- [x] T-07: Test — `buildThresholdMap()` output is unchanged for a representative MACRO+SYMBOL mixed case (confirms the fix doesn't alter today's threshold-adjustment math) — tested directly against the real exported function, plus an explicit null-vs-stray-symbol equivalence test

### Phase 3 — Verification
- [x] T-08: Run `npx tsc --noEmit` — passed, no errors
- [x] T-09: Run `npm run build` — passed, compiled successfully
- [x] T-10: Run full test suite — 314/314 tests passed (32 files), including the 6 new tests
- [x] T-11: Report (do not fix) how `getWeeklyNewsStats()` handles a null-symbol MACRO row post-fix — confirmed live: `bullishBoosts`/`bearishPenalties` include it as `{ symbol: null, adjustment: <value> }`, no error, no silent drop. `getWeeklyNewsStats()` itself was not modified.

## Post-Implementation

- [x] Run `/review news-intelligence-macro-symbol-fix` to verify implementation matches spec
- [x] Confirm no other file changed (`git diff --stat` shows only `news-intelligence.ts` + the new test file)

## Estimated Complexity

Low — single-line conditional fix in one function, no new architecture, no schema change. Most of the effort is the new test file (module's first), which is proportionate given this exact bug had zero coverage.
