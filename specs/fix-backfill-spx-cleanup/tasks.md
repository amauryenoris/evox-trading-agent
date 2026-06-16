# Tasks — Fix Backfill SPX Cleanup (MEDIUM findings)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec

## Implementation Checklist

### Phase 1 — Script fix (`scripts/backfill-spx-regime.ts`)

- [x] T-01: Move `const isLive = process.env.RUN_BACKFILL === 'true'` from line ~98 to just before the `if (!trades || trades.length === 0)` guard (after the `fetchError` check)
- [x] T-02: Replace the single-line early-exit log with the `if (isLive) / else` branch (see design.md)
- [x] T-03: Remove the now-duplicate `const isLive` declaration at the original position (~line 98)

### Phase 2 — Spec correction (`specs/backfill-spx-regime/requirements.md`)

- [x] T-04: Update FR-02: replace `250 calendar days` with `400 calendar days`

### Phase 3 — Verification

- [x] T-05: `npx tsc --noEmit` passes with zero errors
- [x] T-06: Dry run `npx tsx --env-file=.env.local scripts/backfill-spx-regime.ts` prints `[BACKFILL_DRY_DONE] wouldUpdate=0 wouldSkip=0` — todas las rows ya backfilleadas, early-exit branch funciona correctamente
- [x] T-07: `specs/backfill-spx-regime/requirements.md` FR-02 ya no contiene `250 calendar days` (residual hits son en review.md y design.md — archivos históricos)
- [x] T-08: `grep "400 calendar days" specs/` → result exists in `specs/backfill-spx-regime/requirements.md`

## Post-Implementation

- [x] Run `/review fix-backfill-spx-cleanup` to verify implementation matches spec
- [x] Confirm no file in `src/` was modified

## Estimated Complexity

**Low** — Two isolated, non-logic changes: one variable hoist + one string replacement in a doc file.
