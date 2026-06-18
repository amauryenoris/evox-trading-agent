# Design — SF-A: Migration File for state_fingerprint

## Architecture Decision

The `state_fingerprint` column was already applied to the production Supabase project directly via CLI (`ALTER TABLE trade_evaluations ADD COLUMN state_fingerprint jsonb`). The missing piece is a corresponding `.sql` file in `supabase/migrations/` so the schema change is tracked in the repo and reproducible in new environments.

The `IF NOT EXISTS` guard is required because the column already exists in production — without it, running all migrations from scratch against a fresh DB would succeed (column doesn't exist yet), but running against the current production DB would error on the ADD COLUMN.

Precedent file: `supabase/migrations/20260609185757_add_spx_regime_to_trade_evaluations.sql`

## Filename Convention

```
supabase/migrations/YYYYMMDDHHMMSS_add_state_fingerprint_to_trade_evaluations.sql
```

Use the actual UTC time at implementation (e.g. `20260618194530`). The timestamp must be greater than all existing migration timestamps (latest: `20260609185757`) so migrations run in the correct order.

## File Content

```sql
ALTER TABLE trade_evaluations
  ADD COLUMN IF NOT EXISTS state_fingerprint jsonb;
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| `IF NOT EXISTS` guard | Safe to run on prod (column exists) and new envs (column absent) | Slightly longer SQL | **Chosen** |
| No guard (plain ADD COLUMN) | Simpler | Fails on prod if migrations are re-run; error-prone | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/migrations/20260618XXXXXX_add_state_fingerprint_to_trade_evaluations.sql` | CREATE | Migration file with `IF NOT EXISTS` guard |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None — the column already exists in production. The file documents the change that was already applied.

## Open Questions

None.
