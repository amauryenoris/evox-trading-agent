# Tasks — SF-A: Migration File for state_fingerprint

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec

## Implementation Checklist

### Phase 1 — Create migration file

- [x] T-01: Get the current UTC time and format as `YYYYMMDDHHMMSS` (must be > `20260609185757`)

- [x] T-02: Create `supabase/migrations/<timestamp>_add_state_fingerprint_to_trade_evaluations.sql` with exactly:
  ```sql
  ALTER TABLE trade_evaluations
    ADD COLUMN IF NOT EXISTS state_fingerprint jsonb;
  ```

### Phase 2 — Verification

- [x] T-03: Confirm file exists in `supabase/migrations/` with correct timestamp filename

- [x] T-04: Confirm `git status` shows only the new `.sql` file — no other changes

- [x] T-05: `npx tsc --noEmit` passes with zero errors

- [x] T-06: `npm run build` passes

## Post-Implementation

- [ ] Run `/review sf-a-migration-file-state-fingerprint` to verify

## Estimated Complexity

**Low** — Create one file with one SQL statement. No code changes, no schema changes.
