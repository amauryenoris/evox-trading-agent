# Requirements — SF-A: Migration File for state_fingerprint

## Functional Requirements

FR-01: The system shall create a `.sql` migration file in `supabase/migrations/` with a UTC timestamp filename matching the convention `YYYYMMDDHHMMSS_add_state_fingerprint_to_trade_evaluations.sql`.

FR-02: The migration file shall contain exactly the statement `ALTER TABLE trade_evaluations ADD COLUMN IF NOT EXISTS state_fingerprint jsonb;`.

FR-03: The migration file shall use `IF NOT EXISTS` so that running it against a database that already has the column is a no-op.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after this change.

NFR-02: `npm run build` shall pass after this change.

## Constraints

C-01: No TypeScript source file may be modified.

C-02: No existing migration file may be modified.

C-03: No other file besides the new `.sql` migration file may be created or changed.

## Out of Scope

- Backfilling `state_fingerprint` with data.
- Any TypeScript type or db.ts changes for `state_fingerprint`.
- Any UI changes.
