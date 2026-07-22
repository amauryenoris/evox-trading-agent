# Tasks — Minimum Sample-Size Gate Across All 3 pattern_library Consumers

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — `learning.ts`, explicitly authorized in
      the originating request (treated as Protected Zone-equivalent per prior session's precedent)
- [X] Database migrations drafted (if applicable) — N/A, none needed

## Implementation Checklist

### Phase 1 — Shared constant
- [x] T-01: In `learning.ts`, add `export const MIN_PATTERN_SAMPLE_SIZE = 5` near the existing
      pattern-library functions.

### Phase 2 — Claude's prompt context
- [x] T-02: In `getRelevantPatterns()` (`learning.ts:266-274`), filter the library to
      `sampleCount >= MIN_PATTERN_SAMPLE_SIZE` before the `matchesConditions`-based relevance
      filter/ranking, so `buildLearningContext()` never receives a sub-threshold pattern.
- [x] T-03: Confirm `buildLearningContext()` (`learning.ts:280-297`) requires no other change —
      it already just formats whatever `getRelevantPatterns()` returns. Confirmed unchanged.

### Phase 3 — Dashboard
- [x] T-04: In `PatternLibraryCard.tsx`, import `MIN_PATTERN_SAMPLE_SIZE` from `@/lib/learning`.
      Confirmed safe: neither `PatternLibraryCard.tsx` nor `dashboard/page.tsx` has a `'use client'`
      directive (Server Component, App Router default) — no service-role-key leakage risk.
- [x] T-05: Add a per-row conditional: when `p.sampleCount < MIN_PATTERN_SAMPLE_SIZE`, render an
      "Insufficient data (n=X)" badge (neutral tone) in place of the win-rate percentage/progress
      bar; otherwise render the existing win-rate UI unchanged. Left the `sampleCount >= 1` filter,
      slice(0, 10), and `{patterns.length} discovered` header untouched.

### Phase 4 — Weekly PDF
- [x] T-06: In `report-generator.ts`, import `MIN_PATTERN_SAMPLE_SIZE` and replace the literal `2`
      in `.filter((p) => p.sampleCount >= 2)` (line 905) with `MIN_PATTERN_SAMPLE_SIZE`.

### Phase 5 — Testing
- [x] T-07: Test — a pattern with `sampleCount = 4` is excluded from `getRelevantPatterns()`'s
      result (and thus from `buildLearningContext()`'s output text).
      `src/lib/__tests__/pattern-library-min-sample-gate.test.ts`.
- [x] T-08: Test — a pattern with `sampleCount = 5` is included in `getRelevantPatterns()`'s result
      and appears in `buildLearningContext()`'s formatted output, unchanged from today's format.
      Same file.
- [x] T-09: Test — the current CVX/TREND_ZLE05-shaped pattern (`sampleCount = 1`) is excluded from
      `getRelevantPatterns()`'s result, confirming the originating symptom is fixed. Same file.
- [x] T-10: Test — dashboard render boundary: `sampleCount = 4` does not meet
      `MIN_PATTERN_SAMPLE_SIZE` (renders insufficient-data badge), `sampleCount = 5` does (renders
      win-rate bar) — no component-testing library exists in this project, so the boundary is
      asserted directly against the real imported constant, mirroring `PatternLibraryCard.tsx`'s
      `hasEnoughSamples` condition exactly. Same file.
- [x] T-11: Test — PDF `topPatterns` filter: `sampleCount = 4` excluded, `sampleCount = 5` included,
      confirming the reconciled threshold behaves identically to the other two consumers at the
      same boundary values (NFR-03). Same file.
- [x] T-12: Confirm no existing `pattern_library` row is modified — ran the same live-query check
      used in the diagnostic after implementation: still 65/65 rows at `sample_count=1`, identical
      to the diagnostic's finding. No write path was touched by this change.
- [x] T-13: `npx tsc --noEmit` — passed clean.
- [x] T-14: `npm run build` — passed clean.
- [x] T-15: Full test suite — 278/278 passed (26 test files, 268 → 278 tests, +10 new, zero
      regressions).

## Post-Implementation

- [x] Run `/review pattern-library-min-sample-gate` to verify implementation matches spec —
      APPROVED, see `review.md`
- [x] Confirm Protected Zone files unchanged outside `learning.ts` (or changes approved) —
      `learning.ts` (authorized), `PatternLibraryCard.tsx` and `report-generator.ts` (both listed
      in design.md's Impact table, neither is Protected Zone) were the only files modified.

## Estimated Complexity

Low — a single new constant reused at three independent, already-identified insertion points (one
filter addition, one filter-value reconciliation, one new conditional render branch). No schema
changes, no restructuring of existing control flow, no interaction with the separate structural
matching fix (Prompt 2/2). Main care point is keeping all three consumers' threshold behavior
numerically identical (NFR-03) and verifying no `pattern_library` row is touched.
