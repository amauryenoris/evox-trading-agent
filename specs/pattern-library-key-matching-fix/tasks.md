# Tasks — pattern_library Structural Matching Fix (pattern_key)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone changes confirmed (if applicable) — `learning.ts`, explicitly authorized in
      the originating request (treated as Protected Zone-equivalent per prior session's precedent)
- [X] Database migrations drafted (if applicable) — drafted below (T-01), explicitly authorized in
      the originating request

## Implementation Checklist

### Phase 1 — Migration
- [x] T-01: Created `supabase/migrations/20260722182652_add_pattern_key_to_pattern_library.sql`:
      ```sql
      ALTER TABLE pattern_library ADD COLUMN IF NOT EXISTS pattern_key text;
      CREATE INDEX IF NOT EXISTS idx_pattern_library_pattern_key ON pattern_library (pattern_key);
      ```
      matching this project's established `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT
      EXISTS` migration style.
- [x] T-02: Applied the migration to the live Supabase project via the Management API (no `pg`
      driver/CLI available in this session; `SUPABASE_ACCESS_TOKEN` in `.env.local` allowed a
      direct, idempotent `ADD COLUMN IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` call). Confirmed
      live: `pattern_key` column exists (`text`, nullable), `idx_pattern_library_pattern_key`
      index exists (btree), and all 65 existing rows are unaffected — `pattern_key` reads `null`
      on every row, `sample_count`/`win_rate` unchanged.

### Phase 2 — Type and persistence plumbing
- [x] T-03: Added `patternKey?: string | null` to `TradingPattern` (`types.ts`).
- [x] T-04: In `db.ts`'s `upsertPattern()`, added `pattern_key: pattern.patternKey ?? null` to the
      upsert payload.
- [x] T-05: In `db.ts`'s `getPatternLibrary()`, added `patternKey: row.pattern_key ?? null` to the
      row-mapping return object.

### Phase 3 — Matching logic
- [x] T-06: In `learning.ts`, added an exported `buildPatternKey(fp: TradeEvaluation['stateFingerprint']):
      string | null` helper: returns `null` if `fp` is `null`; otherwise returns
      `` `${fp.signal_type ?? 'null'}|${fp.z_bucket ?? 'null'}|${fp.adx_bucket ?? 'null'}|${fp.macd_bucket ?? 'null'}` ``.
- [x] T-07: In `updatePatternLibrary()`, computed `const key = buildPatternKey(evaluation.stateFingerprint)`
      and replaced the `library.find(p => p.description === patternDescription && p.action ===
      action)` lookup with `library.find(p => key !== null && p.patternKey === key && p.action ===
      action)`.
- [x] T-08: When creating a new pattern row (the `else` branch), added `patternKey: key` to the
      object literal. `description`/`conditions` unchanged — still set from `patternDescription`/
      `patternConditions` exactly as today, display-only now.

### Phase 4 — Testing
- [x] T-09: Test — `buildPatternKey()` returns `null` when given `null`.
- [x] T-10: Test — `buildPatternKey()` returns a deterministic, stable string for a given
      stateFingerprint (same input → same output, called twice).
- [x] T-11: Test — a trade whose derived key matches an existing pattern's `patternKey` increments
      that row's `sampleCount`/`winCount` instead of creating a new row.
- [x] T-12: Test — a trade whose derived key differs from any existing pattern's `patternKey`
      creates a new row.
- [x] T-13: Test — a trade with `stateFingerprint = null` always creates a new row, even when an
      existing row also has `patternKey = null` (never matches on a shared null).
- [x] T-14: Test — replayed the real XOM trades identified in the diagnostic using stateFingerprints
      pulled live from `trade_evaluations`. **Actual result (not assumed): XOM 2026-07-13 and
      2026-07-14 (both `TREND_ZLE05|CONTINUATION|MID|POSITIVE`) DO produce the same key and would
      merge. XOM 2026-07-14 and 2026-07-14→15 — the specific pair the diagnostic flagged as
      "functionally identical" — do NOT match: their z-scores (1.114 vs 0.995) straddle the
      CONTINUATION/CHOP bucket boundary, so their keys differ
      (`...CONTINUATION...` vs `...CHOP...`).** Reported as found, not assumed.
- [x] T-15: Test — `description` confirmed unused in the match decision (a trade with a
      completely different `patternDescription` but the same `stateFingerprint`-derived key still
      merges into the same row).
- [x] T-16: Confirmed no existing `pattern_library` row is modified — live re-query after all code
      changes: still 65/65 rows, all `pattern_key = null`, all `sample_count = 1`, identical to
      immediately post-migration.
- [x] T-17: `npx tsc --noEmit` — passed clean.
- [x] T-18: `npm run build` — passed clean.
- [x] T-19: Full test suite — 286/286 passed (27 test files, 278 → 286 tests, +8 new, zero
      regressions; Prompt 1/2's gate tests unaffected).

## Post-Implementation

- [x] Run `/review pattern-library-key-matching-fix` to verify implementation matches spec —
      APPROVED, see `review.md`
- [x] Confirm Protected Zone files unchanged outside `learning.ts` (or changes approved) —
      `learning.ts` (authorized) plus the new migration (authorized), `types.ts`, and `db.ts`
      (both listed in design.md's Impact table as necessary plumbing) were the only files touched.

## Estimated Complexity

Medium — touches a Protected-Zone-equivalent file (`learning.ts`) and requires a live database
migration (higher care/risk than a pure code change), but the logic itself is small and isolated:
one pure helper function, one changed lookup condition, and minimal plumbing in two other files.
Main risk is migration execution against the live project and correctly verifying zero existing
rows are altered.
