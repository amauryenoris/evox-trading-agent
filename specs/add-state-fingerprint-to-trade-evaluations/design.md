# Design — Add state_fingerprint Column to trade_evaluations

## Architecture Decision

This is a pure database migration. The only change is a single `ALTER TABLE` DDL statement applied via the Supabase MCP `apply_migration` tool. No TypeScript files are touched. The column is added as nullable `jsonb` with no default — existing rows will have `NULL` until a future backfill or write path populates them. The `jsonb` type was chosen over `json` to allow GIN indexing in the future if grouping/filtering by fingerprint fields becomes a common query pattern.

## Pre-Migration Verification (STEP 0)

Before applying the migration, verify the column does not exist:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'trade_evaluations'
  AND column_name = 'state_fingerprint';
```

Expected result: **0 rows**. If 1 row is returned, the column already exists — stop and report without applying the migration.

## Migration SQL

```sql
ALTER TABLE trade_evaluations
  ADD COLUMN state_fingerprint jsonb;
```

Migration name (for Supabase MCP): `add_state_fingerprint_to_trade_evaluations`

## Post-Migration Verification

After applying the migration, re-run the STEP 0 query. Expected result: **1 row** with `column_name = 'state_fingerprint'`.

Additionally verify:
- Column is nullable: `SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'trade_evaluations' AND column_name = 'state_fingerprint'` — expect `is_nullable = 'YES'`, `column_default = NULL`.
- No other columns modified: `SELECT column_name FROM information_schema.columns WHERE table_name = 'trade_evaluations' ORDER BY ordinal_position` — column count increases by exactly 1.

## Data Flow

```
Supabase MCP apply_migration
        │
        ▼
ALTER TABLE trade_evaluations ADD COLUMN state_fingerprint jsonb
        │
        ▼
trade_evaluations schema now includes state_fingerprint (nullable jsonb)
        │
        ▼
Future: write path in db.ts / claude-agent.ts populates the column
Future: backfill script fills existing rows
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| `jsonb` nullable, no default | Matches existing JSONB pattern (`indicators_at_buy`); no migration risk on existing rows | Rows are NULL until populated | **Chosen** |
| `jsonb` with `DEFAULT '{}'::jsonb` | No NULL rows | Writes `{}` to all existing rows (unnecessary data); misleading empty object | Rejected |
| `json` instead of `jsonb` | Simpler | No GIN index support; no operator support; slower for key lookups | Rejected |
| New table `trade_state_fingerprints` | Clean separation | Over-engineering for a single column; requires JOINs for simple queries | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `trade_evaluations` (Supabase) | SCHEMA CHANGE | Add `state_fingerprint jsonb` nullable column |

No TypeScript source files are modified in this spec.

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

**Table**: `trade_evaluations`  
**Change**: Add column `state_fingerprint jsonb` (nullable, no default)  
**Migration name**: `add_state_fingerprint_to_trade_evaluations`  

No new tables, no indexes, no RLS policy changes.

## Open Questions

None.
